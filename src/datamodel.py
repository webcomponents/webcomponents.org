from google.appengine.ext import ndb

import versiontag

class CollectionReference(ndb.Model):
  version = ndb.KeyProperty(kind="Version", required=True)
  semver = ndb.StringProperty()

class Library(ndb.Model):
  metadata = ndb.TextProperty()
  contributors = ndb.TextProperty()
  contributor_count = ndb.IntegerProperty()
  error = ndb.StringProperty()
  updated = ndb.DateTimeProperty(auto_now_add=True)
  kind = ndb.StringProperty()
  collections = ndb.StructuredProperty(CollectionReference, repeated=True)

  @staticmethod
  def get_or_create(key):
    library = key.get()
    if library is None:
      library = Library(id=key.id())
    return library

  @staticmethod
  def get_or_create_list(keys):
    libraries = ndb.get_multi(keys)
    for i in range(len(keys)):
      if libraries[i] is None:
        libraries[i] = Library(id=keys[i].id())
    return libraries

  @staticmethod
  def maybe_create_with_kind(owner, repo, kind):
    library = Library.get_or_create(ndb.Key(Library, '%s/%s' % (owner, repo)))
    library.kind = kind
    library.put()
    return library

  @staticmethod
  def versions_for_key(key):
    versions = Version.query(ancestor=key).map(lambda v: v.key.id())
    versions.sort(versiontag.compare)
    return versions

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
  error = ndb.StringProperty()
  updated = ndb.DateTimeProperty(auto_now_add=True)
  dependencies = ndb.StringProperty(repeated=True)

class Content(ndb.Model):
  content = ndb.TextProperty(required=True)
  updated = ndb.DateTimeProperty(auto_now_add=True)
