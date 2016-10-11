from google.appengine.ext import db
from google.appengine.api import memcache
from google.appengine.ext import ndb
from google.appengine.api import search
from google.appengine.api import taskqueue
from google.appengine.api import urlfetch

import base64
import binascii
import datetime
import json
import logging
import os
import urllib
import webapp2

from datamodel import Author, Status, Library, Version, Content, CollectionReference, Dependency, VersionCache, Sitemap
import licenses
import versiontag
import util

def mint_xsrf_token():
  token = binascii.hexlify(os.urandom(20))
  result = memcache.add('xsrf-token: %s' % token, 'valid', 300)
  assert result
  return token

def validate_xsrf_token(handler):
  token = handler.request.get('token', None)
  if token is None:
    return False

  data = memcache.get('xsrf-token: %s' % token)
  if data != 'valid':
    return False

  result = memcache.delete('xsrf-token: %s' % token)
  assert result == memcache.DELETE_SUCCESSFUL
  return True

def validate_task(handler):
  return handler.request.headers.get('X-AppEngine-QueueName', None) is not None

def validate_mutation_request(handler):
  if validate_task(handler) or validate_xsrf_token(handler):
    return True

  new_token = mint_xsrf_token()
  handler.response.write('invalid token: use %s instead' % new_token)
  handler.response.set_status(403)
  return False

class RequestAborted(Exception):
  pass

class RequestHandler(webapp2.RequestHandler):
  """A specialized Request Handler that deals with erroring/retrying and committing.

  Subclasses should define one of ``handle_get`` or ``handle_post`` and add logic
  to commit any permanent changes in ``commit``.

  ``commit`` will be called at the end of any request unless an exception is
  raised.

  The following exceptions are treated specially:
  * ``util.GitHubError`` which signals that the request should be retried.
  * ``RequestAborted`` which completes the request immediately.

  Subclasses can use the ``error`` and ``retry`` functions to short-circuit a request:
  * The ``error`` function is used to denote a permanent error.
  * The ``retry`` function is used to denote a temporary error, indicating that the
  request should be retried.

  These functions raise the ``RequestAborted`` exception and should be typically
  called in a ``return self.error()`` style.

  Subclasses should override and re-delegate the ``error`` and ``retry``
  functions when they need to store additional information about the state. eg.
  Stashing a permanent error in a datastore entity.
  """

  def __init__(self, request, response):
    super(RequestHandler, self).__init__(request, response)

  def commit(self):
    pass

  def is_mutation(self):
    return True

  def is_transactional(self):
    return False

  def get(self, **kwargs):
    if self.is_mutation() and not validate_mutation_request(self):
      return
    try:
      if self.is_transactional():
        @ndb.transactional
        def transactional_get():
          try:
            self.handle_get(**kwargs)
          except util.GitHubError as error:
            return error
          except RequestAborted as error:
            return error
          self.commit()
        exception = transactional_get()
        if isinstance(exception, Exception):
          raise exception
      else:
        self.handle_get(**kwargs)
        self.commit()
    except util.GitHubError:
      self.response.set_status(502)
    except RequestAborted:
      pass

  def post(self, **kwargs):
    # because it's not implemented yet...
    assert not self.is_transactional()
    if self.is_mutation() and not validate_mutation_request(self):
      return
    try:
      self.handle_post(**kwargs)
      self.commit()
    except util.GitHubError:
      self.response.set_status(502)
    except RequestAborted:
      pass

  def error(self, message):
    logging.warning(message)
    self.commit()
    self.response.set_status(200)
    raise RequestAborted()

  def retry(self, message):
    logging.error(message)
    self.response.set_status(500)
    self.commit()
    raise RequestAborted()

class GetXsrfToken(RequestHandler):
  def is_mutation(self):
    return False

  def handle_get(self):
    self.response.write(mint_xsrf_token())

class AddLibrary(RequestHandler):
  def handle_get(self, owner, repo):
    task_url = util.ingest_library_task(owner, repo)
    util.new_task(task_url, target='manage')
    self.response.write('OK')

class LibraryTask(RequestHandler):
  def __init__(self, request, response):
    super(LibraryTask, self).__init__(request, response)
    self.owner = None
    self.repo = None
    self.library = None
    self.library_dirty = False
    self.is_new = False

  def init_library(self, owner, repo, create=True):
    self.owner = owner.lower()
    self.repo = repo.lower()
    if create:
      self.library = Library.get_or_insert(Library.id(owner, repo))
      self.is_new = self.library.metadata is None and self.library.error is None
    else:
      self.library = Library.get_by_id(Library.id(owner, repo))

  def set_ready(self):
    assert self.library.spdx_identifier is not None
    if self.library.status != Status.ready:
      self.library.error = None
      self.library.status = Status.ready
      self.library_dirty = True

  def error(self, message):
    self.library.status = Status.error
    self.library.error = message
    self.library_dirty = True
    super(LibraryTask, self).error(message)

  def commit(self):
    if self.library_dirty:
      self.library.put()

  def update_metadata(self):
    headers = {'Accept': 'application/vnd.github.drax-preview+json'}
    response = util.github_get('repos', self.owner, self.repo, etag=self.library.metadata_etag, headers=headers)
    if response.status_code == 200:
      try:
        json.loads(response.content)
      except ValueError:
        return self.error("could not parse metadata")
      self.library.metadata = response.content
      self.library.metadata_etag = response.headers.get('ETag', None)
      self.library.metadata_updated = datetime.datetime.now()
      self.library_dirty = True
    elif response.status_code == 404:
      logging.info('deleting non-existing repo %s', Library.id(self.owner, self.repo))
      delete_library(self.library.key)
      raise RequestAborted('repo no longer exists')
    elif response.status_code != 304:
      return self.retry('could not update repo metadata (%d)' % response.status_code)

    response = util.github_get('repos', self.owner, self.repo, 'contributors', etag=self.library.contributors_etag)
    if response.status_code == 200:
      try:
        json.loads(response.content)
      except ValueError:
        return self.error("could not parse contributors")
      self.library.contributors = response.content
      self.library.contributors_etag = response.headers.get('ETag', None)
      self.library.contributors_updated = datetime.datetime.now()
      self.library_dirty = True
    elif response.status_code != 304:
      return self.retry('could not update contributors (%d)' % response.status_code)

    response = util.github_get('repos', self.owner, self.repo, 'stats/participation ', etag=self.library.participation_etag)
    if response.status_code == 200:
      try:
        json.loads(response.content)
      except ValueError:
        return self.error("could not parse stats/participation")
      self.library.participation = response.content
      self.library.participation_etag = response.headers.get('ETag', None)
      self.library.participation_updated = datetime.datetime.now()
      self.library_dirty = True
    elif response.status_code == 202:
      # GitHub is "computing" the data. We'll try again next update cycle.
      # TODO: Alternatively we could retry this task
      pass
    elif response.status_code != 304:
      return self.retry('could not update stats/participation (%d)' % response.status_code)

  def update_license_and_kind(self):
    metadata = json.loads(self.library.metadata)
    default_branch = metadata.get('default_branch', 'master')
    response = urlfetch.fetch(util.content_url(self.owner, self.repo, default_branch, 'bower.json'), validate_certificate=True)
    bower_json = None
    if response.status_code == 200:
      try:
        bower_json = json.loads(response.content)
      except ValueError:
        return self.error("Could not parse master/bower.json")
    elif response.status_code == 404:
      bower_json = None
    else:
      return self.retry('error fetching master/bower.json' % response.status_code)

    kind = 'element'
    if bower_json is not None and 'element-collection' in bower_json.get('keywords', []):
      kind = 'collection'

    if self.library.kind != kind:
      self.library.kind = kind
      self.library_dirty = True

    spdx_identifier = None
    github_license = metadata.get('license')
    if github_license is not None:
      spdx_identifier = licenses.validate_spdx(github_license.get('key', 'MISSING'))

    if spdx_identifier is None and bower_json is not None:
      license_name = bower_json.get('license')
      if license_name is not None:
        spdx_identifier = licenses.validate_spdx(license_name)

    if self.library.spdx_identifier != spdx_identifier:
      self.library.spdx_identifier = spdx_identifier
      self.library_dirty = True

    if self.library.spdx_identifier is None:
      return self.error('Could not detect an OSI approved license on GitHub or in %s/bower.json' % default_branch)

  def trigger_version_deletion(self, tag):
    task_url = util.delete_task(self.owner, self.repo, tag)
    util.new_task(task_url, target='manage', transactional=True)

  def trigger_version_ingestion(self, tag, sha, url=None, preview=False):
    version_object = Version.get_by_id(tag, parent=self.library.key)
    if version_object is not None and version_object.status == Status.ready:
      # Version object is already up to date
      return

    Version(id=tag, parent=self.library.key, sha=sha, url=url, preview=preview).put()

    task_url = util.ingest_version_task(self.owner, self.repo, tag)
    util.new_task(task_url, target='manage', transactional=True)
    self.trigger_analysis(tag, sha)

  def trigger_analysis(self, tag, sha):
    analysis_sha = None
    if self.library.kind == 'collection':
      analysis_sha = sha
    version_key = ndb.Key(Library, self.library.key.id(), Version, tag)
    Content(id='analysis', parent=version_key, status=Status.pending).put()
    task_url = util.ingest_analysis_task(self.owner, self.repo, tag, analysis_sha)
    util.new_task(task_url, target='analysis', transactional=True)

  def trigger_author_ingestion(self):
    if self.library.shallow_ingestion:
      return
    task_url = util.ensure_author_task(self.owner)
    util.new_task(task_url, target='manage', transactional=True)

  def update_collection_tags(self):
    response = util.github_get('repos', self.owner, self.repo, 'git/refs/heads/master', etag=self.library.tags_etag)
    if response.status_code == 304:
      return

    if response.status_code != 200:
      return self.retry('could not update git/refs/heads/master (%d)' % response.status_code)

    try:
      data = json.loads(response.content)
    except ValueError:
      return self.error("could not parse git/refs/heads/master")

    if data.get('ref', None) != 'refs/heads/master':
      return self.error('could not find master branch')

    self.library.collection_sequence_number = self.library.collection_sequence_number + 1
    version = 'v0.0.%d' % self.library.collection_sequence_number
    self.library.tags = [version]
    self.library.tags_etag = response.headers.get('ETag', None)
    self.library.tags_updated = datetime.datetime.now()
    self.library.library_dirty = True

    return {version: data['object']['sha']}

  def update_element_tags(self):
    response = util.github_get('repos', self.owner, self.repo, 'tags', etag=self.library.tags_etag)
    if response.status_code == 304:
      return None

    if response.status_code != 200:
      return self.retry('could not update git/refs/tags (%d)' % response.status_code)

    try:
      data = json.loads(response.content)
    except ValueError:
      return self.error("could not parse git/refs/tags")

    new_tag_map = dict((tag['name'], tag['commit']['sha']) for tag in data
                       if versiontag.is_valid(tag['name']))
    new_tags = new_tag_map.keys()
    new_tags.sort(versiontag.compare)

    self.library.tags = new_tags
    self.library.tags_etag = response.headers.get('ETag', None)
    self.library.tags_updated = datetime.datetime.now()
    self.library.library_dirty = True

    return new_tag_map

  def update_versions(self):
    if self.library.shallow_ingestion:
      return

    old_tags = self.library.tags

    if self.library.kind == 'collection':
      new_tag_map = self.update_collection_tags()
    else:
      assert self.library.kind == 'element'
      new_tag_map = self.update_element_tags()

    if new_tag_map is None:
      new_tags = old_tags
    else:
      new_tags = new_tag_map.keys()
      new_tags.sort(versiontag.compare)

    # FIXME: Rename to tags_to_delete.
    # FIXME: And change to (Library.versions_for_key_async - new_tags).
    # FIXME: And do this check regardless of whether the tags have changed.
    # FIXME: But not if there are any pending ingestions.
    removed_tags = list(set(old_tags) - set(new_tags))
    added_tags = list(set(new_tags) - set(old_tags))

    for tag in removed_tags:
      self.trigger_version_deletion(tag)

    if len(new_tags) is 0:
      return self.error("couldn't find any tagged versions")

    added_tags.sort(versiontag.compare)
    added_tags.reverse()
    for tag in added_tags:
      is_latest = tag == new_tags[-1]
      # Only ingest the latest version if we're doing ingestion for the first time.
      if old_tags != [] or is_latest:
        self.trigger_version_ingestion(tag, new_tag_map[tag])

class IngestLibrary(LibraryTask):
  def is_transactional(self):
    return True
  def handle_get(self, owner, repo):
    self.init_library(owner, repo)
    if self.library.shallow_ingestion:
      self.library.shallow_ingestion = False
      self.library_dirty = True
    self.update_metadata()
    self.update_license_and_kind()
    self.update_versions()
    self.trigger_author_ingestion()
    self.set_ready()

class UpdateLibrary(LibraryTask):
  def is_transactional(self):
    return True
  def handle_get(self, owner, repo):
    self.init_library(owner, repo, create=False)
    if self.library is None:
      logging.warning('Library not found: %s', Library.id(owner, repo))
      return
    if self.library.spdx_identifier is None:
      # Can't update a library if it's not licensed correctly.
      return
    self.update_metadata()
    self.update_versions()
    self.set_ready()

class IngestPreview(LibraryTask):
  def is_transactional(self):
    return True
  def handle_get(self, owner, repo):
    commit = self.request.get('commit', None)
    url = self.request.get('url', None)
    assert commit is not None and url is not None

    self.init_library(owner, repo)
    if self.is_new:
      self.library.shallow_ingestion = True
      self.library_dirty = True
      self.update_metadata()
      self.update_license_and_kind()
      self.set_ready()
    elif self.library.status != Status.ready:
      self.update_metadata()
      self.update_license_and_kind()
      self.set_ready()

    if self.library.kind == 'element':
      self.trigger_version_ingestion(commit, commit, url=url, preview=True)

class IngestWebhookLibrary(LibraryTask):
  def is_transactional(self):
    return True
  def handle_get(self, owner, repo):
    access_token = self.request.get('access_token', None)
    assert access_token is not None

    self.init_library(owner, repo)
    if self.is_new:
      self.library.shallow_ingestion = True
      self.library_dirty = True
      self.update_metadata()
      self.update_license_and_kind()
      self.set_ready()

    self.library.github_access_token = access_token
    self.library_dirty = True

class AnalyzeLibrary(LibraryTask):
  def is_transactional(self):
    return True
  def handle_get(self, owner, repo):
    self.init_library(owner, repo)
    if self.library is None:
      self.response.set_status(404)
      self.response.write('could not find library: %s' % Library.id(owner, repo))
      return

    versions = Version.query(Version.status == Status.ready, ancestor=self.library.key).fetch()
    for version in versions:
      self.trigger_analysis(version.key.id(), version.sha)

class AuthorTask(RequestHandler):
  def __init__(self, request, response):
    super(AuthorTask, self).__init__(request, response)
    self.author = None
    self.author_dirty = False

  def init_author(self, name, insert):
    name = name.lower()
    if insert:
      self.author = Author.get_or_insert(name)
    else:
      self.author = Author.get_by_id(name)
    self.author_dirty = False

  def commit(self):
    if self.author_dirty:
      self.author.put()

  def update_metadata(self):
    response = util.github_get('users', self.author.key.id(), etag=self.author.metadata_etag)
    if response.status_code == 200:
      self.author.metadata = response.content
      self.author.metadata_etag = response.headers.get('ETag', None)
      self.author_dirty = True
    elif response.status_code == 404:
      logging.info('deleting non-existing author %s', self.author.key.id())
      delete_author(self.author.key)
      raise RequestAborted('author no longer exists')
    elif response.status_code != 304:
      return self.retry('could not update author metadata (%d)' % response.status_code)

class IngestAuthor(AuthorTask):
  def handle_get(self, name):
    self.init_author(name, insert=True)
    if self.author.metadata is not None:
      return self.error('author has already been ingested')
    self.update_metadata()
    self.author_dirty = True
    self.author.status = Status.ready

class UpdateAuthor(AuthorTask):
  def handle_get(self, name):
    self.init_author(name, insert=False)
    if self.author is None:
      return self.error('author does not exist')
    self.update_metadata()

class DeleteVersion(RequestHandler):
  def handle_get(self, owner, repo, version):
    # FIXME: Make deletion transactional with check on library that tag is excluded.
    version_key = ndb.Key(Library, Library.id(owner, repo), Version, version)
    ndb.delete_multi(ndb.Query(ancestor=version_key).iter(keys_only=True))
    if VersionCache.update(version_key.parent()):
      task_url = util.update_indexes_task(owner, repo)
      util.new_task(task_url, target='manage')

class IngestVersion(RequestHandler):
  def __init__(self, request, response):
    super(IngestVersion, self).__init__(request, response)
    self.version_key = None
    self.version_object = None
    self.owner = None
    self.repo = None
    self.version = None
    self.sha = None

  def handle_get(self, owner, repo, version):
    self.owner = owner
    self.repo = repo
    self.version = version

    library_key = ndb.Key(Library, Library.id(owner, repo))
    self.version_object = Version.get_by_id(version, parent=library_key)
    if self.version_object is None:
      return self.error('Version entity does not exist: %s/%s' % (Library.id(owner, repo), version))

    self.sha = self.version_object.sha
    self.version_key = self.version_object.key

    self.update_readme()
    self.update_bower()
    self.set_ready()

  def commit(self):
    if self.version_object is not None:
      self.version_object.put()
      self.update_versions_and_index()

  @ndb.transactional
  def update_versions_and_index(self):
    if VersionCache.update(self.version_key.parent()):
      task_url = util.update_indexes_task(self.owner, self.repo)
      util.new_task(task_url, target='manage', transactional=True)

  def error(self, error_string):
    if self.version_object is not None:
      self.version_object.status = Status.error
      self.version_object.error = error_string
    super(IngestVersion, self).error(error_string)

  def update_readme(self):
    response = urlfetch.fetch(util.content_url(self.owner, self.repo, self.sha, 'README.md'), validate_certificate=True)
    if response.status_code == 200:
      readme = response.content
      try:
        Content(parent=self.version_key, id='readme', content=readme,
                status=Status.ready, etag=response.headers.get('ETag', None)).put()
      except db.BadValueError:
        return self.error("Could not store README.md as a utf-8 string")
    elif response.status_code == 404:
      readme = None
    else:
      return self.retry('error fetching readme (%d)' % response.status_code)

    if readme is not None:
      response = util.github_markdown(readme)
      if response.status_code == 200:
        Content(parent=self.version_key, id='readme.html', content=response.content,
                status=Status.ready, etag=response.headers.get('ETag', None)).put()
      else:
        return self.retry('error converting readme to markdown (%d)' % response.status_code)

  def update_bower(self):
    response = urlfetch.fetch(util.content_url(self.owner, self.repo, self.sha, 'bower.json'), validate_certificate=True)
    if response.status_code == 200:
      try:
        bower_json = json.loads(response.content)
      except ValueError:
        return self.error("could not parse bower.json")
      Content(parent=self.version_key, id='bower', content=response.content,
              status=Status.ready, etag=response.headers.get('ETag', None)).put()
      return bower_json
    elif response.status_code == 404:
      return self.error("missing bower.json")
    else:
      return self.retry('could not access bower.json (%d)' % response.status_code)

  def set_ready(self):
    self.version_object.status = Status.ready

class UpdateIndexes(RequestHandler):
  def handle_get(self, owner, repo):
    library_key = ndb.Key(Library, Library.id(owner, repo))
    version = Library.latest_version_for_key_async(library_key).get_result()
    if version is None:
      return self.error('no versions for %s' % Library.id(owner, repo))

    bower_key = ndb.Key(Library, Library.id(owner, repo), Version, version, Content, 'bower')
    bower_object = bower_key.get()
    bower = {} if bower_object is None else json.loads(bower_object.content)
    version_key = bower_key.parent()
    library = version_key.parent().get()

    self.update_search_index(owner, repo, version_key, library, bower)

    if library.kind == 'collection':
      self.update_collection_dependencies(version_key, bower)

    latest_version = Library.latest_version_for_key_async(library_key).get_result()
    if latest_version is not None and latest_version != version:
      return self.retry('latest version changed while updating indexes')

  def update_collection_dependencies(self, collection_version_key, bower):
    dependencies = bower.get('dependencies', {})
    for name in dependencies.keys():
      dep = Dependency.from_string(dependencies[name])
      if dep is None:
        continue
      library_key = ndb.Key(Library, Library.id(dep.owner, dep.repo))
      CollectionReference.ensure(library_key, collection_version_key, semver=dep.version)

      task_url = util.ensure_library_task(dep.owner.lower(), dep.repo.lower())
      util.new_task(task_url, target='manage')

  def update_search_index(self, owner, repo, version_key, library, bower):
    metadata = json.loads(library.metadata)
    fields = [
        search.TextField(name='owner', value=owner),
        search.TextField(name='repo', value=repo),
        search.AtomField(name='kind', value=library.kind),
        search.AtomField(name='version', value=version_key.id()),
        search.TextField(name='github_description', value=metadata.get('description', '')),
        search.TextField(name='bower_description', value=bower.get('description', '')),
        search.TextField(name='bower_keywords', value=' '.join(bower.get('keywords', []))),
    ]

    analysis = Content.get_by_id('analysis', parent=version_key)
    if analysis is not None and analysis.status == Status.ready:
      analysis = json.loads(analysis.content)
      elements = analysis.get('elementsByTagName', {}).keys()
      if elements != []:
        fields.append(search.TextField(name='element', value=' '.join(elements)))
      behaviors = analysis.get('behaviorsByName', {}).keys()
      if behaviors != []:
        fields.append(search.TextField(name='behavior', value=' '.join(behaviors)))

    document = search.Document(doc_id=Library.id(owner, repo), fields=fields)
    index = search.Index('repo')
    index.put(document)


class IngestAnalysis(RequestHandler):
  def is_mutation(self):
    # FIXME: This is really a mutation.
    return False

  def handle_post(self):
    message_json = json.loads(urllib.unquote(self.request.body).rstrip('='))
    message = message_json['message']
    data = base64.b64decode(str(message['data']))
    attributes = message['attributes']
    owner = attributes['owner']
    repo = attributes['repo']
    version = attributes['version']
    error = attributes.get('error', None)

    version_key = ndb.Key(Library, Library.id(owner, repo), Version, version)

    content = Content.get_by_id('analysis', parent=version_key)
    if content is None:
      return
    content.content = None if data == '' else data
    if error is None:
      content.status = Status.ready
      content.error = None
    else:
      content.status = Status.error
      content.error = error
    content.put()

    if version_key.id() == Library.latest_version_for_key_async(version_key.parent()).get_result():
      task_url = util.update_indexes_task(owner, repo)
      util.new_task(task_url, target='manage')

class EnsureLibrary(RequestHandler):
  def handle_get(self, owner, repo):
    library = Library.get_by_id(Library.id(owner, repo))
    if library is None:
      task_url = util.ingest_library_task(owner, repo)
      util.new_task(task_url, target='manage')

class EnsureAuthor(RequestHandler):
  def handle_get(self, name):
    author = Author.get_by_id(name.lower())
    if author is None:
      task_url = util.ingest_author_task(name)
      util.new_task(task_url, target='manage')

class IndexAll(RequestHandler):
  def handle_get(self):
    query = Library.query()
    cursor = None
    more = True
    task_count = 0
    while more:
      keys, cursor, more = query.fetch_page(50, keys_only=True, start_cursor=cursor)
      for key in keys:
        task_count = task_count + 1
        owner, repo = key.id().split('/', 1)
        task_url = util.update_indexes_task(owner, repo)
        util.new_task(task_url, target='manage')

    logging.info('triggered %d index updates', task_count)

class UpdateAll(RequestHandler):
  def handle_get(self):
    queue = taskqueue.Queue('update')
    if queue.fetch_statistics().tasks > 0:
      self.response.write('update already in progress')
      return

    query = Library.query()
    cursor = None
    more = True
    task_count = 0
    while more:
      keys, cursor, more = query.fetch_page(50, keys_only=True, start_cursor=cursor)
      for key in keys:
        task_count = task_count + 1
        task_url = util.update_library_task(key.id())
        util.new_task(task_url, target='manage', queue_name='update')

    logging.info('triggered %d library updates', task_count)

    query = Author.query()
    cursor = None
    more = True
    task_count = 0
    while more:
      keys, cursor, more = query.fetch_page(50, keys_only=True, start_cursor=cursor)
      for key in keys:
        task_count = task_count + 1
        task_url = util.update_author_task(key.id())
        util.new_task(task_url, target='manage', queue_name='update')

    logging.info('triggered %d author updates', task_count)

class BuildSitemaps(RequestHandler):
  def handle_get(self):
    keys = (Library.query()
            .filter(Library.kind == 'element')
            # pylint: disable=singleton-comparison
            .filter(Library.shallow_ingestion == False)
            .fetch(keys_only=True, read_policy=ndb.EVENTUAL_CONSISTENCY))
    elements = Sitemap(id='elements')
    elements.pages = [key.id() for key in keys]
    elements.put()
    logging.info('%d elements', len(elements.pages))

    keys = (Library.query()
            .filter(Library.kind == 'collection')
            # pylint: disable=singleton-comparison
            .filter(Library.shallow_ingestion == False)
            .fetch(keys_only=True, read_policy=ndb.EVENTUAL_CONSISTENCY))
    collections = Sitemap(id='collections')
    collections.pages = [key.id() for key in keys]
    collections.put()
    logging.info('%d collections', len(elements.pages))

    keys = Author.query().fetch(keys_only=True, read_policy=ndb.EVENTUAL_CONSISTENCY)
    authors = Sitemap(id='authors')
    authors.pages = [key.id() for key in keys]
    authors.put()
    logging.info('%d authors', len(elements.pages))

def delete_author(author_key, response_for_logging=None):
  keys = [author_key] + ndb.Query(ancestor=author_key).fetch(keys_only=True)
  ndb.delete_multi(keys)

  if response_for_logging is not None:
    for key in keys:
      response_for_logging.write(repr(key.flat()) + '\n')
    response_for_logging.write('\n')

def delete_library(library_key, response_for_logging=None):
  keys = [library_key] + ndb.Query(ancestor=library_key).fetch(keys_only=True)
  ndb.delete_multi(keys)

  if response_for_logging is not None:
    for key in keys:
      response_for_logging.write(repr(key.flat()) + '\n')
    response_for_logging.write('\n')

  index = search.Index('repo')
  index.delete([library_key.id()])

class GithubStatus(RequestHandler):
  def is_mutation(self):
    return False

  def handle_get(self):
    for key, value in util.github_rate_limit().items():
      self.response.write('%s: %s<br>' % (key, value))

class DeleteLibrary(RequestHandler):
  def handle_get(self, owner, repo):
    self.response.headers['Content-Type'] = 'text/plain'
    delete_library(ndb.Key(Library, Library.id(owner, repo).lower()), response_for_logging=self.response)

class DeleteEverything(RequestHandler):
  def handle_get(self):
    while True:
      deleted_something = False
      for library_key in Library.query().fetch(keys_only=True, limit=10):
        delete_library(library_key, response_for_logging=self.response)
        deleted_something = True
      for author_key in Author.query().fetch(keys_only=True, limit=10):
        delete_author(author_key, response_for_logging=self.response)
        deleted_something = True
      if not deleted_something:
        break

    # Delete any remaining entries in the search index.
    index = search.Index('repo')
    while True:
      docs = [
          document.doc_id
          for document
          in index.get_range(ids_only=True)]

      if not docs:
        break

      self.response.write('search docs: %s\n' + repr(docs))
      index.delete(docs)

    self.response.write('Finished')


# pylint: disable=invalid-name
app = webapp2.WSGIApplication([
    webapp2.Route(r'/manage/token', handler=GetXsrfToken),
    webapp2.Route(r'/manage/github', handler=GithubStatus),
    webapp2.Route(r'/manage/index-all', handler=IndexAll),
    webapp2.Route(r'/manage/update-all', handler=UpdateAll),
    webapp2.Route(r'/manage/build-sitemaps', handler=BuildSitemaps),
    webapp2.Route(r'/manage/analyze/<owner>/<repo>', handler=AnalyzeLibrary),
    webapp2.Route(r'/manage/add/<owner>/<repo>', handler=AddLibrary),
    webapp2.Route(r'/manage/delete/<owner>/<repo>', handler=DeleteLibrary),
    webapp2.Route(r'/manage/delete_everything/yes_i_know_what_i_am_doing', handler=DeleteEverything),
    webapp2.Route(r'/task/ensure/<name>', handler=EnsureAuthor),
    webapp2.Route(r'/task/ensure/<owner>/<repo>', handler=EnsureLibrary),
    webapp2.Route(r'/task/update/<name>', handler=UpdateAuthor),
    webapp2.Route(r'/task/update/<owner>/<repo>', handler=UpdateLibrary),
    webapp2.Route(r'/task/update-indexes/<owner>/<repo>', handler=UpdateIndexes),
    webapp2.Route(r'/task/delete/<owner>/<repo>/<version>', handler=DeleteVersion),
    webapp2.Route(r'/task/ingest/<name>', handler=IngestAuthor),
    webapp2.Route(r'/task/ingest/<owner>/<repo>', handler=IngestLibrary),
    webapp2.Route(r'/task/ingest/<owner>/<repo>/<version>', handler=IngestVersion),
    webapp2.Route(r'/task/ingest-preview/<owner>/<repo>', handler=IngestPreview),
    webapp2.Route(r'/task/ingest-webhook/<owner>/<repo>', handler=IngestWebhookLibrary),
    webapp2.Route(r'/_ah/push-handlers/analysis', handler=IngestAnalysis),
], debug=True)
