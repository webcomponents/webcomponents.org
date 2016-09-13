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
import sys

from datamodel import Author, Status, Library, Version, Content, CollectionReference, Dependency, VersionCache
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
  """A specialized Request Handler that deals with erroring/aborting and committing.

  Subclasses should define one of ``handle_get`` or ``handle_post`` and add logic
  to commit any permanent changes in ``commit``.

  ``commit`` will be called at the end of any request unless an exception is
  raised.

  The following exceptions are treated specially:
  * ``util.GitHubError`` which signals that the request should be retried.
  * ``RequestAborted`` which completes the request immediately.

  Subclasses can use the ``error`` and ``abort`` functions to short-circuit a request:
  * The ``error`` function is used to denote a permanent error.
  * The ``abort`` function is used to denote a temporary error, indicating that the
  request should be retried.

  These functions raise the ``RequestAborted`` exception and should be typically
  called in a ``return self.error()`` style.

  Subclasses should override and re-delegate the ``error`` and ``abort``
  functions when they need to store additional information about the state. eg.
  Stashing a permanent error in a datastore entity.
  """

  def commit(self):
    pass

  def is_mutation(self):
    return True

  def get(self, **kwargs):
    if self.is_mutation() and not validate_mutation_request(self):
      return
    try:
      self.handle_get(**kwargs)
      self.commit()
    except util.GitHubError:
      self.response.set_status(502)
    except RequestAborted:
      pass

  def post(self, **kwargs):
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

  def abort(self, message):
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
  def handle_get(self, owner, repo, kind):
    task_url = util.ingest_library_task(owner, repo, kind)
    util.new_task(task_url, target='manage')
    self.response.write('OK')

class LibraryTask(RequestHandler):
  def __init__(self, request, response):
    super(LibraryTask, self).__init__(request, response)
    self.owner = None
    self.repo = None
    self.library = None
    self.library_dirty = False

  def init_library(self, owner, repo, kind=None, create=True):
    self.owner = owner.lower()
    self.repo = repo.lower()
    if create:
      assert kind is not None
      self.library = Library.maybe_create_with_kind(self.owner, self.repo, kind)
    else:
      self.library = Library.get_by_id('%s/%s' % (owner, repo))

  def set_ready(self):
    if self.library.status != Status.ready:
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
    response = util.github_get('repos', self.owner, self.repo, etag=self.library.metadata_etag)
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
      logging.info('deleting non-existing repo %s/%s', self.owner, self.repo)
      delete_library(self.library.key)
      raise RequestAborted('repo no longer exists')
    elif response.status_code != 304:
      return self.abort('could not update repo metadata (%d)' % response.status_code)

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
      return self.abort('could not update contributors (%d)' % response.status_code)

    if not self.library.shallow_ingestion:
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
        # TODO: Alternatively we could abort this task and try again.
        pass
      elif response.status_code != 304:
        return self.abort('could not update stats/participation (%d)' % response.status_code)

  def trigger_version_deletion(self, tag):
    task_url = util.delete_task(self.owner, self.repo, tag)
    util.new_task(task_url, target='manage')

  def trigger_version_ingestion(self, tag, sha, latest=False, url=None):
    version_object = Version.get_or_insert(tag, parent=self.library.key, sha=sha)
    if version_object.sha == sha and version_object.status == Status.ready:
      # Version object is already up to date
      return

    version_object.url = url
    version_object.sha = sha
    version_object.status = Status.pending
    version_object.put()

    params = {}
    if latest:
      params["latestVersion"] = "True"

    task_url = util.ingest_version_task(self.owner, self.repo, tag)
    util.new_task(task_url, params=params, target='manage')
    util.publish_analysis_request(self.owner, self.repo, tag)

  def trigger_author_ingestion(self):
    if self.library.shallow_ingestion:
      return
    task_url = util.ingest_author_task(self.owner)
    util.new_task(task_url, target='manage')

  def ingest_versions(self):
    if self.library.shallow_ingestion:
      return

    response = util.github_get('repos', self.owner, self.repo, 'git/refs/tags', etag=self.library.tags_etag)
    if response.status_code == 304:
      return

    if response.status_code != 200:
      return self.abort('could not upate repo tags (%d)' % response.status_code)

    old_tags = self.library.tags

    try:
      data = json.loads(response.content)
    except ValueError:
      return self.error("could not parse git/refs/tags")

    if not isinstance(data, object):
      data = {}

    # normalize the tag from 'refs/tags/v0.8.0' to 'v0.8.0'
    new_tag_map = dict((d['ref'][10:], d['object']['sha']) for d in data
                       if versiontag.is_valid(d['ref'][10:]))
    new_tags = new_tag_map.keys()
    new_tags.sort()

    self.library.tags = new_tags
    self.library.tags_etag = response.headers.get('ETag', None)
    self.library.tags_updated = datetime.datetime.now()
    self.library_dirty = True

    removed_tags = list(set(old_tags) - set(new_tags))

    for tag in removed_tags:
      self.trigger_version_deletion(tag)

    if len(new_tags) is 0:
      return self.error("couldn't find any tagged versions")

    new_tags.reverse()
    for tag in new_tags:
      is_latest = tag == new_tags[0]
      self.trigger_version_ingestion(tag, new_tag_map[tag], is_latest)

class IngestLibrary(LibraryTask):
  @ndb.toplevel
  def handle_get(self, owner, repo, kind):
    assert kind == 'element' or kind == 'collection'
    self.init_library(owner, repo, kind)
    if self.library.shallow_ingestion:
      self.library.shallow_ingestion = False
      self.library_dirty = True
    self.update_metadata()
    self.ingest_versions()
    self.trigger_author_ingestion()
    self.set_ready()

class UpdateLibrary(LibraryTask):
  @ndb.toplevel
  def handle_get(self, owner, repo):
    self.init_library(owner, repo, create=False)
    if self.library is None:
      return
    self.update_metadata()
    self.ingest_versions()
    self.set_ready()

class IngestLibraryCommit(LibraryTask):
  @ndb.toplevel
  def handle_get(self, owner, repo):
    commit = self.request.get('commit', None)
    url = self.request.get('url', None)
    assert commit is not None and url is not None

    self.init_library(owner, repo, 'element')
    is_new = self.library.metadata is None and self.library.error is None
    if is_new:
      self.library.shallow_ingestion = True
      self.library_dirty = True
      self.update_metadata()

    self.trigger_version_ingestion(commit, commit, url=url)
    self.set_ready()

class IngestWebhookLibrary(LibraryTask):
  def handle_get(self, owner, repo):
    access_token = self.request.get('access_token', None)
    assert access_token is not None

    self.init_library(owner, repo, 'element')
    is_new = self.library.metadata is None and self.library.error is None
    if is_new:
      self.library.shallow_ingestion = True
      self.library_dirty = True
      self.update_metadata()
    self.library.github_access_token = access_token
    self.library_dirty = True

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
      return self.abort('could not update author metadata (%d)' % response.status_code)

class IngestAuthor(AuthorTask):
  @ndb.toplevel
  def handle_get(self, name):
    self.init_author(name, insert=True)
    if self.author.metadata is not None:
      return self.error('author has already been ingested')
    self.update_metadata()
    self.author_dirty = True
    self.author.status = Status.ready

class UpdateAuthor(AuthorTask):
  @ndb.toplevel
  def handle_get(self, name):
    self.init_author(name, insert=False)
    if self.author is None:
      return self.error('author does not exist')
    self.update_metadata()

class DeleteVersion(RequestHandler):
  def handle_get(self, owner, repo, version):
    version_key = ndb.Key(Library, '%s/%s' % (owner, repo), Version, version)
    ndb.delete_multi(ndb.Query(ancestor=version_key).iter(keys_only=True))
    VersionCache.update_async(version_key.parent()).get_result()

class IngestVersion(RequestHandler):
  def __init__(self, request, response):
    super(IngestVersion, self).__init__(request, response)
    self.version_key = None
    self.version_object = None
    self.owner = None
    self.repo = None
    self.version = None
    self.latest_version = False

  @ndb.toplevel
  def handle_get(self, owner, repo, version):
    self.owner = owner
    self.repo = repo
    self.version = version
    self.version_key = ndb.Key(Library, '%s/%s' % (owner, repo), Version, version)
    self.version_object = self.version_key.get()

    logging.info('ingesting version %s/%s/%s', owner, repo, version)
    self.latest_version = self.request.get('latestVersion', False)

    if self.version_object is None:
      return self.error('version object is missing')

    self.update_readme()
    bower = self.update_bower()

    if self.latest_version:
      self.update_indexes(bower)

    self.set_ready()

  def commit(self):
    if self.version_object is not None:
      self.version_object.put()

      # Update the version cache if it exists.
      # Create it if we're ingesting the latest version.
      VersionCache.update_async(self.version_key.parent(), create=self.latest_version).get_result()

  def error(self, error_string):
    self.version_object.status = Status.error
    self.version_object.error = error_string
    if self.latest_version:
      # No longer the latest valid version. Prevent creation of the version cache.
      self.latest_version = False
      library = self.version_key.parent().get()
      tags = library.tags
      idx = tags.index(self.version)
      if idx > 0:
        next_tag = tags[idx - 1]
        logging.info('ingestion for %s/%s falling back to version %s', self.owner, self.repo, next_tag)
        task_url = util.ingest_version_task(self.owner, self.repo, next_tag)
        util.new_task(task_url, params={'latestVersion':'True'}, target='manage')
    super(IngestVersion, self).error(error_string)

  def update_readme(self):
    response = urlfetch.fetch(util.content_url(self.owner, self.repo, self.version, 'README.md'), validate_certificate=True)
    if response.status_code == 200:
      readme = response.content
      try:
        content = Content(parent=self.version_key, id='readme', content=readme)
        content.etag = response.headers.get('ETag', None)
        content.put()
      except db.BadValueError:
        return self.error("Could not store README.md as a utf-8 string")
    elif response.status_code == 404:
      readme = None
    else:
      return self.abort('error fetching readme (%d)' % response.status_code)

    if readme is not None:
      response = util.github_markdown(readme)
      if response.status_code == 200:
        content = Content(parent=self.version_key, id='readme.html', content=response.content)
        content.put()
      else:
        return self.abort('error converting readme to markdown (%d)' % response.status_code)

  def update_bower(self):
    response = urlfetch.fetch(util.content_url(self.owner, self.repo, self.version, 'bower.json'), validate_certificate=True)
    if response.status_code == 200:
      try:
        bower_json = json.loads(response.content)
      except ValueError:
        return self.error("could not parse bower.json")
      content = Content(parent=self.version_key, id='bower', content=response.content)
      content.etag = response.headers.get('ETag', None)
      content.put()
      return bower_json
    elif response.status_code == 404:
      return self.error("missing bower.json")
    else:
      return self.abort('could not access bower.json (%d)' % response.status_code)

  def set_ready(self):
    self.version_object.status = Status.ready

  def update_indexes(self, bower):
    assert self.latest_version
    library = self.version_key.parent().get()
    if library.kind == "collection":
      task_url = util.ingest_dependencies_task(self.owner, self.repo, self.version)
      util.new_task(task_url, target='manage')
    metadata = json.loads(library.metadata)
    logging.info('adding search index for %s', self.version)
    description = bower.get("description", metadata.get("description", ""))
    document = search.Document(doc_id='%s/%s' % (self.owner, self.repo), fields=[
        search.AtomField(name='full_name', value=metadata['full_name']),
        search.TextField(name='owner', value=self.owner),
        search.TextField(name='repo', value=self.repo),
        search.TextField(name='version', value=self.version),
        search.TextField(name='repoparts', value=' '.join(self.repo.split('-'))),
        search.TextField(name='description', value=description),
        search.TextField(name='keywords', value=' '.join(bower.get('keywords', []))),
    ])
    index = search.Index('repo')
    index.put(document)

class IngestDependencies(RequestHandler):
  def handle_get(self, owner, repo, version):
    logging.info('ingesting version %s/%s/%s', owner, repo, version)
    bower_key = ndb.Key(Library, '%s/%s' % (owner, repo), Version, version, Content, 'bower')
    collection_version_key = bower_key.parent()
    bower = json.loads(bower_key.get().content)
    dependencies = bower.get('dependencies', {})

    for name in dependencies.keys():
      dep = Dependency.from_string(dependencies[name])
      library_key = ndb.Key(Library, '%s/%s' % (dep.owner.lower(), dep.repo.lower()))
      CollectionReference.ensure(library_key, collection_version_key, semver=dep.version)

      # FIXME: Can't assume this is an element.
      task_url = util.ingest_library_task(dep.owner.lower(), dep.repo.lower(), 'element')
      util.new_task(task_url, target='manage')

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

    logging.info('Ingesting analysis data %s/%s/%s', owner, repo, version)
    parent = Version.get_by_id(version, parent=ndb.Key(Library, '%s/%s' % (owner, repo)))

    # Don't accept the analysis data unless the version still exists in the datastore
    if parent is not None:
      content = Content(parent=parent.key, id='analysis', content=data)
      try:
        content.put()
      # TODO: Which exception is this for?
      # pylint: disable=bare-except
      except:
        logging.error(sys.exc_info()[0])

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
        taskqueue.add(queue_name='update', method='GET', url='/task/update/%s' % key.id())
    self.response.write('triggered %d update tasks' % task_count)


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
    delete_library(ndb.Key(Library, ('%s/%s' % (owner, repo)).lower()), response_for_logging=self.response)

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
    webapp2.Route(r'/manage/update-all', handler=UpdateAll),
    webapp2.Route(r'/manage/add/<kind>/<owner>/<repo>', handler=AddLibrary),
    webapp2.Route(r'/manage/delete/<owner>/<repo>', handler=DeleteLibrary),
    webapp2.Route(r'/manage/delete_everything/yes_i_know_what_i_am_doing', handler=DeleteEverything),
    webapp2.Route(r'/task/update/<owner>/<repo>', handler=UpdateLibrary),
    webapp2.Route(r'/task/update/<name>', handler=UpdateAuthor),
    webapp2.Route(r'/task/delete/<owner>/<repo>/<version>', handler=DeleteVersion),
    webapp2.Route(r'/task/ingest/author/<name>', handler=IngestAuthor),
    webapp2.Route(r'/task/ingest/commit/<owner>/<repo>', handler=IngestLibraryCommit),
    webapp2.Route(r'/task/ingest/webhook/<owner>/<repo>', handler=IngestWebhookLibrary),
    webapp2.Route(r'/task/ingest/library/<owner>/<repo>/<kind>', handler=IngestLibrary),
    webapp2.Route(r'/task/ingest/dependencies/<owner>/<repo>/<version>', handler=IngestDependencies),
    webapp2.Route(r'/task/ingest/version/<owner>/<repo>/<version>', handler=IngestVersion),
    webapp2.Route(r'/_ah/push-handlers/analysis', handler=IngestAnalysis),
], debug=True)
