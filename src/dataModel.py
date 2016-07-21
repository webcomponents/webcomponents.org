from google.appengine.ext import ndb

import versionTag

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
  def getOrCreate(key):
    library = key.get()
    if library is None:
      library = Library(id=key.id())
    return library

  @staticmethod
  def getOrCreateList(keys):
    libraries = ndb.get_multi(keys)
    for i in range(len(keys)):
      if libraries[i] is None:
        libraries[i] = Library(id=keys[i].id())
    return libraries

  @staticmethod
  def maybeCreateWithKind(owner, repo, kind):
    library = Library.getOrCreate(ndb.Key(Library, '%s/%s' % (owner, repo)))
    library.kind = kind
    library.put()
    return library

  @staticmethod
  def versionsForKey(key):
    versions = Version.query(ancestor=key).map(lambda v: v.key.id())
    versions.sort(versionTag.compare)
    return versions

  @staticmethod
  @ndb.tasklet
  def versionsForKey_async(key):
    versions = yield Version.query(ancestor=key).fetch_async(keys_only=True)
    versions = map(lambda key: key.id(), versions)
    versions.sort(versionTag.compare)
    raise ndb.Return(versions)

  def versions(self):
    return Library.versionsForKey(self.key)

class Version(ndb.Model):
  sha = ndb.StringProperty(required=True)
  error = ndb.StringProperty()
  updated = ndb.DateTimeProperty(auto_now_add=True)
  dependencies = ndb.StringProperty(repeated=True)

class Content(ndb.Model):
  content = ndb.TextProperty(required=True)
  updated = ndb.DateTimeProperty(auto_now_add=True)
