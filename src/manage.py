from google.appengine.ext import db
from google.appengine.ext import ndb
from google.appengine.api import search
from google.appengine.api import urlfetch

import base64
import datetime
import json
import logging
import urllib
import webapp2
import sys

from datamodel import Library, Version, Content, CollectionReference, Dependency
import quota
import versiontag
import util


class AddLibrary(webapp2.RequestHandler):
  def get(self, kind, owner, repo):
    util.new_task('ingest/library', owner, repo, detail=kind)
    self.response.write('OK')

class IngestLibrary(webapp2.RequestHandler):
  def get(self, owner, repo, kind):
    if not (kind == 'element' or kind == 'collection'):
      self.response.set_status(400)
      return
    owner = owner.lower()
    repo = repo.lower()
    library = Library.maybe_create_with_kind(owner, repo, kind)

    logging.info('created library')

    github = quota.GitHub()
    if not github.reserve(3):
      self.response.set_status(500)
      return

    response = github.github_resource('repos', owner, repo)

    if not response.status_code == 200:
      library.error = 'repo metadata not found'
      github.release()
      library.put()
      return

    library.metadata = response.content

    response = github.github_resource('repos', owner, repo, 'contributors')
    if not response.status_code == 200:
      library.error = 'repo contributors not found'
      github.release()
      library.put()
      return

    library.contributors = response.content
    library.contributor_count = len(json.loads(response.content))

    response = github.github_resource('repos', owner, repo, 'git/refs/tags')
    if not response.status_code == 200:
      library.error = 'repo tags not found'
      github.release()
      library.put()
      return

    data = json.loads(response.content)
    if not isinstance(data, object):
      library.error = 'repo contians no valid version tags'
      github.release()
      library.put()
      return

    library.put()

    for version in data:
      tag = version['ref'][10:]
      if not versiontag.is_valid(tag):
        continue
      sha = version['object']['sha']
      version_object = Version(parent=library.key, id=tag, sha=sha)
      version_object.put()
      util.new_task('ingest/version', owner, repo, detail=tag)
      util.publish_analysis_request(owner, repo, tag)

TIME_FORMAT = '%Y-%m-%dT%H:%M:%SZ'

class IngestVersion(webapp2.RequestHandler):
  def get(self, owner, repo, version):
    logging.info('ingesting version %s/%s/%s', owner, repo, version)

    github = quota.GitHub()
    if not github.reserve(1):
      self.response.set_status(500)
      return

    key = ndb.Key(Library, '%s/%s' % (owner, repo), Version, version)

    blob = urlfetch.fetch(util.content_url(owner, repo, version, 'README.md'))

    try:
      content = Content(parent=key, id='readme', content=blob.content)
      content.put()
    except db.BadValueError:
      ver = key.get()
      ver.error = "Could not store README.md as a utf-8 string"
      ver.put()
      self.response.set_status(200)
      return

    response = github.markdown(blob.content)
    content = Content(parent=key, id='readme.html', content=response.content)
    content.put()

    blob = urlfetch.fetch(util.content_url(owner, repo, version, 'bower.json'))
    try:
      json.loads(blob.content)
    # TODO: Which exception is this for?
    # pylint: disable=bare-except
    except:
      ver = key.get()
      ver.error = "This version has a missing or broken bower.json"
      ver.put()
      self.response.set_status(200)
      return

    content = Content(parent=key, id='bower', content=blob.content)
    content.put()

    versions = Library.versions_for_key(key.parent())
    if versions[-1] == version:
      library = key.parent().get()
      if library.kind == "collection":
        util.new_task('ingest/dependencies', owner, repo, detail=version)
      bower = json.loads(blob.content)
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
      util.new_task('ingest/library', dep.owner.lower(), dep.repo.lower())
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

    logging.info('Ingesting hydro data %s/%s/%s', owner, repo, version)
    parent = Version.get_by_id(version, parent=ndb.Key(Library, '%s/%s' % (owner, repo)))

    # Don't accept the hydro data unless the version still exists in the datastore
    if parent is not None:
      content = Content(parent=parent.key, id='hydrolyzer', content=data)
      try:
        content.put()
      # TODO: Which exception is this for?
      # pylint: disable=bare-except
      except:
        logging.error(sys.exc_info()[0])

    self.response.set_status(200)

def delete_library(response, library_key):
  keys = [library_key] + ndb.Query(ancestor=library_key).fetch(keys_only=True)
  ndb.delete_multi(keys)

  for key in keys:
    response.write(repr(key.flat()) + '\n')
  response.write('\n')

  index = search.Index('repo')
  index.delete([library_key.id()])

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
    webapp2.Route(r'/manage/add/<kind>/<owner>/<repo>', handler=AddLibrary, name='add'),
    webapp2.Route(r'/manage/delete/<owner>/<repo>', handler=DeleteLibrary),
    webapp2.Route(r'/manage/delete_everything/yes_i_know_what_i_am_doing', handler=DeleteEverything),
    webapp2.Route(r'/task/ingest/library/<owner>/<repo>/<kind>', handler=IngestLibrary, name='nom'),
    webapp2.Route(r'/task/ingest/dependencies/<owner>/<repo>/<version>', handler=IngestDependencies, name='nomdep'),
    webapp2.Route(r'/task/ingest/version/<owner>/<repo>/<version>', handler=IngestVersion, name='nomver'),
    webapp2.Route(r'/_ah/push-handlers/analysis', handler=IngestAnalysis, name='nomhyd'),
], debug=True)
