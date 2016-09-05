from google.appengine.ext import ndb

import versiontag

class CollectionReference(ndb.Model):
  version = ndb.KeyProperty(kind="Version", required=True)
  semver = ndb.StringProperty()

class Status(object):
  error = 'error'
  pending = 'pending'
  ready = 'ready'

class Author(ndb.Model):
  metadata = ndb.TextProperty()

  metadata_etag = ndb.StringProperty()

  status = ndb.StringProperty(default=Status.pending)
  error = ndb.StringProperty()

class Library(ndb.Model):
  kind = ndb.StringProperty()

  github_access_token = ndb.StringProperty()

  metadata = ndb.TextProperty()
  contributors = ndb.TextProperty()
  tags = ndb.TextProperty()

  metadata_etag = ndb.StringProperty()
  contributors_etag = ndb.StringProperty()
  tags_etag = ndb.StringProperty()

  contributor_count = ndb.IntegerProperty()
  collections = ndb.StructuredProperty(CollectionReference, repeated=True)

  ingest_versions = ndb.BooleanProperty(default=True)

  status = ndb.StringProperty(default=Status.pending)
  error = ndb.StringProperty()
  updated = ndb.DateTimeProperty(auto_now_add=True)

  @staticmethod
  def get_or_create_list(keys):
    libraries = ndb.get_multi(keys)
    for i, key in enumerate(keys):
      if libraries[i] is None:
        libraries[i] = Library(id=key.id())
    return libraries

  @staticmethod
  def maybe_create_with_kind(owner, repo, kind):
    library = Library.get_or_insert('%s/%s' % (owner, repo))
    # FIXME: Probably don't want libraries to change kind.
    if library.kind != kind:
      library.kind = kind
      library.put()
    return library

  @staticmethod
  @ndb.tasklet
  def versions_for_key_async(key):
    versions = yield Version.query(ancestor=key).fetch_async(keys_only=True)
    versions = [key.id() for key in versions]
    versions.sort(versiontag.compare)
    raise ndb.Return(versions)

  def versions(self):
    return Library.versions_for_key(self.key)

class Version(ndb.Model):
  sha = ndb.StringProperty(required=True)
  url = ndb.StringProperty()

  dependencies = ndb.StringProperty(repeated=True)

  status = ndb.StringProperty(default=Status.pending)
  error = ndb.StringProperty()
  updated = ndb.DateTimeProperty(auto_now_add=True)


class Content(ndb.Model):
  content = ndb.TextProperty(required=True)
  etag = ndb.StringProperty()
  updated = ndb.DateTimeProperty(auto_now_add=True)

class Dependency(object):
  def __init__(self, owner, repo, version):
    self.owner = owner
    self.repo = repo
    self.version = version

  @staticmethod
  def from_string(dep_string):
    bits = dep_string.split('#')
    owner, repo = bits[0].split('/')
    return Dependency(owner, repo, bits[1])

