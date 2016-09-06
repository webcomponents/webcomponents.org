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

from datamodel import Author, Status, Library, Version, Content, CollectionReference, Dependency
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

class GetXsrfToken(webapp2.RequestHandler):
  def get(self):
    self.response.write(mint_xsrf_token())

class AddLibrary(webapp2.RequestHandler):
  def get(self, owner, repo, kind):
    if not validate_mutation_request(self):
      return
    task_url = util.ingest_library_task(owner, repo, kind)
    util.new_task(task_url, target='manage')
    self.response.write('OK')

class RequestAborted(Exception):
  pass

class LibraryTask(webapp2.RequestHandler):
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

  def error(self, message):
    self.response.set_status(200)
    self.library.status = Status.error
    self.library.error = message
    self.library.put()
    raise RequestAborted()

  def abort(self, abort_string):
    logging.error(abort_string)
    self.response.set_status(500)
    self.commit()
    raise RequestAborted()

  def commit(self, ready=False):
    if ready and self.library.status != Status.ready:
      self.library.status = Status.ready
      self.library_dirty = True
    if self.library_dirty:
      self.library.put()

  def update_metadata(self):
    response = util.github_resource('repos', self.owner, self.repo, etag=self.library.metadata_etag)
    if response.status_code == 200:
      self.library.metadata = response.content
      self.library.metadata_etag = response.headers.get('ETag', None)
      self.library_dirty = True
    elif response.status_code == 404:
      logging.info('deleting non-existing repo %s/%s', self.owner, self.repo)
      delete_library(self.library.key)
      raise RequestAborted('repo no longer exists')
    elif response.status_code != 304:
      return self.abort('could not update repo metadata (%d)' % response.status_code)

    response = util.github_resource('repos', self.owner, self.repo, 'contributors', etag=self.library.contributors_etag)
    if response.status_code == 200:
      self.library.contributors = response.content
      self.library.contributors_etag = response.headers.get('ETag', None)
      self.library_dirty = True
    elif response.status_code != 304:
      return self.abort('could not update contributors (%d)' % response.status_code)

    if self.library.ingest_versions:
      response = util.github_resource('repos', self.owner, self.repo, 'stats/participation ', etag=self.library.participation_etag)
      if response.status_code == 200:
        self.library.participation = response.content
        self.library.participation_etag = response.headers.get('ETag', None)
        self.library_dirty = True
      elif response.status_code == 202:
        # GitHub is "computing" the data. We'll try again next update cycle.
        # TODO: Alternatively we could abort this task and try again.
        pass
      elif response.status_code != 304:
        return self.abort('could not update stats/participation (%d)' % response.status_code)

  def trigger_version_ingestion(self, tag, sha, latest=False, url=None):
    params = {}
    if latest:
      params["latestVersion"] = "True"
    version_object = Version.get_or_insert(tag, parent=self.library.key, sha=sha)
    if url is not None:
      version_object.url = url
    version_object.status = Status.pending
    version_object.put()
    task_url = util.ingest_version_task(self.owner, self.repo, tag)
    util.new_task(task_url, params=params, target='manage')
    util.publish_analysis_request(self.owner, self.repo, tag)

  def ingest_author(self):
    if not self.library.ingest_versions:
      return
    task_url = util.ingest_author_task(self.owner)
    util.new_task(task_url, target='manage')

  def ingest_versions(self):
    if not self.library.ingest_versions:
      return

    response = util.github_resource('repos', self.owner, self.repo, 'git/refs/tags', etag=self.library.tags_etag)
    if response.status_code == 304:
      return

    if response.status_code != 200:
      return self.abort('could not upate repo tags (%d)' % response.status_code)

    self.library.tags = response.content
    self.library.tags_etag = response.headers.get('ETag', None)
    self.library_dirty = True

    data = json.loads(response.content)
    if not isinstance(data, object):
      data = []
    data = [d for d in data if versiontag.is_valid(d['ref'][10:])]
    if len(data) is 0:
      return self.error('no valid versions')
    data.sort(lambda a, b: versiontag.compare(a['ref'][10:], b['ref'][10:]))
    data_refs = [d['ref'][10:] for d in data]
    # TODO: Do a diff on self.library.tags:
    # * ingest new shas
    # * delete missing
    self.library.tags = json.dumps(data_refs)
    self.library.tags_etag = response.headers.get('ETag', None)
    data.reverse()
    is_newest = True
    for version in data:
      tag = version['ref'][10:]
      if not versiontag.is_valid(tag):
        continue
      sha = version['object']['sha']
      self.trigger_version_ingestion(tag, sha, latest=is_newest)
      is_newest = False

class IngestLibrary(LibraryTask):
  @ndb.toplevel
  def get(self, owner, repo, kind):
    if not validate_mutation_request(self):
      return
    assert kind == 'element' or kind == 'collection'
    try:
      self.init_library(owner, repo, kind)
      if not self.library.ingest_versions:
        self.library.ingest_versions = True
        self.library_dirty = True
      self.update_metadata()
      self.ingest_versions()
      self.ingest_author()
      self.commit(ready=True)
    except RequestAborted:
      pass

class UpdateLibrary(LibraryTask):
  @ndb.toplevel
  def get(self, owner, repo):
    if not validate_mutation_request(self):
      return
    try:
      self.init_library(owner, repo, create=False)
      if self.library is None:
        return
      self.update_metadata()
      self.ingest_versions()
      self.commit(ready=True)
    except RequestAborted:
      pass

class IngestLibraryCommit(LibraryTask):
  @ndb.toplevel
  def get(self, owner, repo):
    if not validate_mutation_request(self):
      return
    commit = self.request.get('commit', None)
    url = self.request.get('url', None)
    assert commit is not None and url is not None
    try:
      self.init_library(owner, repo, 'element')
      is_new = self.library.metadata is None and self.library.error is None
      if is_new:
        self.library.ingest_versions = False
        self.library_dirty = True
        self.update_metadata()

      self.trigger_version_ingestion(commit, commit, url=url)
      self.commit(ready=True)
    except RequestAborted:
      pass

class IngestWebhookLibrary(LibraryTask):
  def get(self, owner, repo):
    if not validate_mutation_request(self):
      return
    access_token = self.request.get('access_token', None)
    assert access_token is not None
    try:
      self.init_library(owner, repo, 'element')
      is_new = self.library.metadata is None and self.library.error is None
      if is_new:
        self.library.ingest_versions = False
        self.library_dirty = True
        self.update_metadata()
      self.library.github_access_token = access_token
      self.library_dirty = True
      self.commit()
    except RequestAborted:
      pass

class AuthorTask(webapp2.RequestHandler):
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

  def abort(self, abort_string):
    logging.error(abort_string)
    self.response.set_status(500)
    self.commit()
    raise RequestAborted()

  def update_metadata(self):
    response = util.github_resource('users', self.author.key.id(), etag=self.author.metadata_etag)
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
  def get(self, name):
    if not validate_mutation_request(self):
      return
    try:
      self.init_author(name, insert=True)
      if self.author.metadata is not None:
        raise RequestAborted('author has already been ingested')
      self.update_metadata()
      self.author.status = Status.ready
      self.commit()
    except RequestAborted:
      pass

class UpdateAuthor(AuthorTask):
  @ndb.toplevel
  def get(self, name):
    if not validate_mutation_request(self):
      return
    try:
      self.init_author(name, insert=False)
      if self.author is None:
        raise RequestAborted('author does not exist')
      self.update_metadata()
      self.commit()
    except RequestAborted:
      pass


TIME_FORMAT = '%Y-%m-%dT%H:%M:%SZ'

class IngestVersion(webapp2.RequestHandler):
  def get(self, owner, repo, version):
    if not validate_mutation_request(self):
      return
    generate_search = self.request.get('latestVersion', False)
    logging.info('ingesting version %s/%s/%s', owner, repo, version)

    key = ndb.Key(Library, '%s/%s' % (owner, repo), Version, version)

    def error(error_string):
      logging.info('ingestion error "%s" for %s/%s/%s', error_string, owner, repo, version)
      ver = key.get()
      ver.status = Status.error
      ver.error = error_string
      ver.put()
      if generate_search:
        library = key.parent().get()
        versions = json.loads(library.tags)
        idx = versions.index(version)
        if idx > 0:
          logging.info('ingestion for %s/%s falling back to version %s', owner, repo, versions[idx - 1])
          task_url = util.ingest_version_task(owner, repo, versions[idx - 1])
          util.new_task(task_url, params={'latestVersion':'True'}, target='manage')

    def abort(abort_string):
      logging.error(abort_string)
      self.response.set_status(500)

    response = urlfetch.fetch(util.content_url(owner, repo, version, 'README.md'), validate_certificate=True)
    if response.status_code == 200:
      readme = response.content
      try:
        content = Content(parent=key, id='readme', content=readme)
        content.etag = response.headers.get('ETag', None)
        content.put()
      except db.BadValueError:
        return error("Could not store README.md as a utf-8 string")
    elif response.status_code == 404:
      readme = None
    else:
      return abort('error fetching readme (%d)' % response.status_code)

    if readme is not None:
      response = util.github_markdown(readme)
      if response.status_code == 200:
        content = Content(parent=key, id='readme.html', content=response.content)
        content.put()
      else:
        return abort('error converting readme to markdown (%d)' % response.status_code)

    response = urlfetch.fetch(util.content_url(owner, repo, version, 'bower.json'), validate_certificate=True)
    if response.status_code == 200:
      try:
        json.loads(response.content)
      except ValueError:
        return error("could not parse bower.json")
      content = Content(parent=key, id='bower', content=response.content)
      content.etag = response.headers.get('ETag', None)
      content.put()
    elif response.status_code == 404:
      return error("missing bower.json")
    else:
      return abort('could not access bower.json (%d)' % response.status_code)

    ver = key.get()
    ver.status = Status.ready
    ver.put()

    if generate_search:
      library = key.parent().get()
      if library.kind == "collection":
        task_url = util.ingest_dependencies_task(owner, repo, version)
        util.new_task(task_url, target='manage')
      bower = json.loads(response.content)
      metadata = json.loads(library.metadata)
      logging.info('adding search index for %s', version)
      description = bower.get("description", metadata.get("description", ""))
      document = search.Document(doc_id='%s/%s' % (owner, repo), fields=[
          search.AtomField(name='full_name', value=metadata['full_name']),
          search.TextField(name='owner', value=owner),
          search.TextField(name='repo', value=repo),
          search.TextField(name='version', value=version),
          search.TextField(name='repoparts', value=' '.join(repo.split('-'))),
          search.TextField(name='description', value=description),
          search.TextField(name='keywords', value=' '.join(bower.get('keywords', []))),
          search.NumberField(name='stars', value=metadata.get('stargazers_count')),
          search.NumberField(name='subscribers', value=metadata.get('subscribers_count')),
          search.NumberField(name='forks', value=metadata.get('forks')),
          search.NumberField(name='contributors', value=library.contributor_count),
          search.DateField(name='updated_at', value=datetime.datetime.strptime(metadata.get('updated_at'), TIME_FORMAT))
      ])
      index = search.Index('repo')
      index.put(document)

class IngestDependencies(webapp2.RequestHandler):
  def get(self, owner, repo, version):
    if not validate_mutation_request(self):
      return
    logging.info('ingesting version %s/%s/%s', owner, repo, version)
    key = ndb.Key(Library, '%s/%s' % (owner, repo), Version, version, Content, 'bower')
    bower = json.loads(key.get().content)
    ver = key.parent().get()
    dependencies = bower.get('dependencies', {})
    library_keys = []
    dep_list = []
    for name in dependencies.keys():
      ver.dependencies.append(dependencies[name])
      dep = Dependency.from_string(dependencies[name])
      dep_list.append(dep)
      library_keys.append(ndb.Key(Library, '%s/%s' % (dep.owner.lower(), dep.repo.lower())))

    libraries = Library.get_or_create_list(library_keys)
    for i, library in enumerate(libraries):
      dep = dep_list[i]
      library.collections.append(CollectionReference(version=key.parent(), semver=dep.version))
      # FIXME: Can't assume this is an element.
      task_url = util.ingest_library_task(dep.owner.lower(), dep.repo.lower(), 'element')
      util.new_task(task_url, target='manage')
    libraries.append(ver)
    ndb.put_multi(libraries)

class IngestAnalysis(webapp2.RequestHandler):
  def post(self):
    # FIXME: Protect via XSRF token.
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

    self.response.set_status(200)

class UpdateAll(webapp2.RequestHandler):
  def get(self):
    if not validate_mutation_request(self):
      return
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

class GithubStatus(webapp2.RequestHandler):
  def get(self):
    for key, value in util.github_rate_limit().items():
      self.response.write('%s: %s<br>' % (key, value))

class DeleteLibrary(webapp2.RequestHandler):
  def get(self, owner, repo):
    if not validate_mutation_request(self):
      return
    self.response.headers['Content-Type'] = 'text/plain'
    delete_library(ndb.Key(Library, ('%s/%s' % (owner, repo)).lower()), response_for_logging=self.response)

class DeleteEverything(webapp2.RequestHandler):
  def get(self):
    if not validate_mutation_request(self):
      return
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
    webapp2.Route(r'/task/ingest/author/<name>', handler=IngestAuthor),
    webapp2.Route(r'/task/ingest/commit/<owner>/<repo>', handler=IngestLibraryCommit),
    webapp2.Route(r'/task/ingest/webhook/<owner>/<repo>', handler=IngestWebhookLibrary),
    webapp2.Route(r'/task/ingest/library/<owner>/<repo>/<kind>', handler=IngestLibrary),
    webapp2.Route(r'/task/ingest/dependencies/<owner>/<repo>/<version>', handler=IngestDependencies),
    webapp2.Route(r'/task/ingest/version/<owner>/<repo>/<version>', handler=IngestVersion),
    webapp2.Route(r'/_ah/push-handlers/analysis', handler=IngestAnalysis),
], debug=True)
