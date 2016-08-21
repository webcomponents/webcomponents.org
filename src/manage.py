from google.appengine.ext import db
from google.appengine.ext import ndb
from google.appengine.api import search
from google.appengine.api import taskqueue
from google.appengine.api import urlfetch

import base64
import datetime
import json
import logging
import urllib
import webapp2
import sys

from datamodel import Library, Version, Content, CollectionReference, Dependency
import versiontag
import util


class AddLibrary(webapp2.RequestHandler):
  def get(self, owner, repo, kind):
    task_url = util.ingest_library_task(owner, repo, kind)
    util.new_task(task_url)
    self.response.write('OK')

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
    self.library.error = message
    self.library.put()

  def abort(self):
    self.response.set_status(500)
    if self.library_dirty:
      self.library.put()

  def commit(self):
    if self.library_dirty:
      self.library.put()

  def update_metadata(self):
    response = util.github_resource('repos', self.owner, self.repo, etag=self.library.metadata_etag)
    if response.status_code != 304:
      if response.status_code == 200:
        self.library.metadata = response.content
        self.library.metadata_etag = response.headers.get('ETag', None)
        self.library_dirty = True
      else:
        return self.error('repo metadata not found (%d)' % response.status_code)

    response = util.github_resource('repos', self.owner, self.repo, 'contributors', etag=self.library.contributors_etag)
    if response.status_code != 304:
      if response.status_code == 200:
        self.library.contributors = response.content
        self.library.contributors_etag = response.headers.get('ETag', None)
        self.library.contributor_count = len(json.loads(response.content))
        self.library_dirty = True
      else:
        return self.error('repo contributors not found (%d)' % response.status_code)

  def ingest_versions(self):
    if not self.library.ingest_versions:
      return

    response = util.github_resource('repos', self.owner, self.repo, 'git/refs/tags', etag=self.library.tags_etag)
    if response.status_code != 304:
      if response.status_code != 200:
        return self.error('repo tags not found (%d)' % response.status_code)

      self.library.tags = response.content
      self.library.tags_etag = response.headers.get('ETag', None)
      self.library_dirty = True

      data = json.loads(response.content)
      if not isinstance(data, object):
        data = []
      data = [d for d in data if versiontag.is_valid(d['ref'][10:])]
      if len(data) is 0:
        return self.error('repo contains no valid version tags')
      data.sort(lambda a, b: versiontag.compare(a['ref'][10:], b['ref'][10:]))
      data_refs = [d['ref'][10:] for d in data]
      self.library.tags = json.dumps(data_refs)
      self.library.tags_etag = response.headers.get('ETag', None)
      data.reverse()
      is_newest = True
      for version in data:
        tag = version['ref'][10:]
        if not versiontag.is_valid(tag):
          continue
        sha = version['object']['sha']
        params = {}
        if is_newest:
          params["latestVersion"] = "True"
          is_newest = False
        version_object = Version(parent=self.library.key, id=tag, sha=sha)
        version_object.put()
        task_url = util.ingest_version_task(self.owner, self.repo, tag)
        util.new_task(task_url, params)
        util.publish_analysis_request(self.owner, self.repo, tag)

class IngestLibrary(LibraryTask):
  def get(self, owner, repo, kind):
    assert kind == 'element' or kind == 'collection'
    self.init_library(owner, repo, kind)
    if not self.library.ingest_versions:
      self.library.ingest_versions = True
      self.library_dirty = True
    self.update_metadata()
    self.ingest_versions()
    self.commit()

class UpdateLibrary(LibraryTask):
  def get(self, owner, repo):
    self.init_library(owner, repo, create=False)
    if self.library is None:
      return
    self.update_metadata()
    self.ingest_versions()
    self.commit()

class IngestLibraryCommit(LibraryTask):
  def get(self, owner, repo, kind):
    commit = self.request.get('commit', None)
    url = self.request.get('url', None)
    assert commit is not None and url is not None
    self.init_library(owner, repo, kind)
    is_new = self.library.metadata is None and self.library.error is None
    if is_new:
      self.library.ingest_versions = False
      self.library_dirty = True
      self.update_metadata()

    version = Version(parent=self.library.key, id=commit, sha=commit, url=url)
    version.put()
    task_url = util.ingest_version_task(owner, repo, commit)
    util.new_task(task_url)
    self.commit()

TIME_FORMAT = '%Y-%m-%dT%H:%M:%SZ'

class IngestVersion(webapp2.RequestHandler):
  def get(self, owner, repo, version):
    generate_search = self.request.get('latestVersion', False)
    logging.info('ingesting version %s/%s/%s', owner, repo, version)

    key = ndb.Key(Library, '%s/%s' % (owner, repo), Version, version)

    response = urlfetch.fetch(util.content_url(owner, repo, version, 'README.md'))
    readme = response.content

    def error(error_string):
      logging.info('ingestion error "%s" for %s/%s/%s', error_string, owner, repo, version)
      ver = key.get()
      ver.error = error_string
      ver.put()
      if generate_search:
        library = key.parent().get()
        versions = json.loads(library.tags)
        idx = versions.index(version)
        if idx > 0:
          logging.info('ingestion for %s/%s falling back to version %s', owner, repo, versions[idx - 1])
          task_url = util.ingest_version_task(owner, repo, versions[idx - 1])
          util.new_task(task_url, {'latestVersion':'True'})

      self.response.set_status(200)

    try:
      content = Content(parent=key, id='readme', content=readme)
      content.etag = response.headers.get('ETag', None)
      content.put()
    except db.BadValueError:
      return error("Could not store README.md as a utf-8 string")

    response = util.github_markdown(readme)
    content = Content(parent=key, id='readme.html', content=response.content)
    content.put()

    response = urlfetch.fetch(util.content_url(owner, repo, version, 'bower.json'))
    try:
      json.loads(response.content)
    except ValueError:
      return error("This version has a missing or broken bower.json")

    content = Content(parent=key, id='bower', content=response.content)
    content.etag = response.headers.get('ETag', None)
    content.put()

    if generate_search:
      library = key.parent().get()
      if library.kind == "collection":
        task_url = util.ingest_dependencies_task(owner, repo, version)
        util.new_task(task_url)
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
    self.response.set_status(200)

class IngestDependencies(webapp2.RequestHandler):
  def get(self, owner, repo, version):
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
      util.new_task(task_url)
    libraries.append(ver)
    ndb.put_multi(libraries)

class IngestAnalysis(webapp2.RequestHandler):
  def post(self):
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

def delete_library(response, library_key):
  keys = [library_key] + ndb.Query(ancestor=library_key).fetch(keys_only=True)
  ndb.delete_multi(keys)

  for key in keys:
    response.write(repr(key.flat()) + '\n')
  response.write('\n')

  index = search.Index('repo')
  index.delete([library_key.id()])

class GithubStatus(webapp2.RequestHandler):
  def get(self):
    for key, value in util.rate_limit().items():
      self.response.write('%s: %s<br>' % (key, value))

class DeleteLibrary(webapp2.RequestHandler):
  def get(self, owner, repo):
    self.response.headers['Content-Type'] = 'text/plain'
    delete_library(self.response, ndb.Key(Library, ('%s/%s' % (owner, repo)).lower()))

class DeleteEverything(webapp2.RequestHandler):
  def get(self):
    while True:
      deleted_something = False
      for library_key in Library.query().fetch(keys_only=True, limit=10):
        delete_library(self.response, library_key)
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
    webapp2.Route(r'/manage/github', handler=GithubStatus),
    webapp2.Route(r'/manage/update-all', handler=UpdateAll),
    webapp2.Route(r'/manage/add/<kind>/<owner>/<repo>', handler=AddLibrary),
    webapp2.Route(r'/manage/delete/<owner>/<repo>', handler=DeleteLibrary),
    webapp2.Route(r'/manage/delete_everything/yes_i_know_what_i_am_doing', handler=DeleteEverything),
    webapp2.Route(r'/task/update/<owner>/<repo>', handler=UpdateLibrary),
    webapp2.Route(r'/task/ingest/commit/<owner>/<repo>/<kind>', handler=IngestLibraryCommit),
    webapp2.Route(r'/task/ingest/library/<owner>/<repo>/<kind>', handler=IngestLibrary),
    webapp2.Route(r'/task/ingest/dependencies/<owner>/<repo>/<version>', handler=IngestDependencies),
    webapp2.Route(r'/task/ingest/version/<owner>/<repo>/<version>', handler=IngestVersion),
    webapp2.Route(r'/_ah/push-handlers/analysis', handler=IngestAnalysis),
], debug=True)
