from google.appengine.ext import ndb

import versiontag

class CollectionReference(ndb.Model):
  semver = ndb.StringProperty()

  def collection_version_key(self):
    (owner, repo, version) = self.key.id().split('/')
    return ndb.Key(Library, '%s/%s' % (owner, repo), Version, version)

  @staticmethod
  def ensure(library_key, collection_version_key, semver):
    assert library_key.kind() == 'Library'
    assert collection_version_key.kind() == 'Version'
    collection_library_key = collection_version_key.parent()
    name = '%s/%s' % (collection_library_key.id(), collection_version_key.id())
    collection_reference = CollectionReference(id=name, parent=library_key, semver=semver)
    return collection_reference.put()

class Status(object):
  error = 'error'
  pending = 'pending'
  ready = 'ready'

class Author(ndb.Model):
  metadata = ndb.TextProperty()

  metadata_etag = ndb.StringProperty()

  status = ndb.StringProperty(default=Status.pending)
  error = ndb.StringProperty()
  updated = ndb.DateTimeProperty(auto_now=True)

class Library(ndb.Model):
  kind = ndb.StringProperty()

  github_access_token = ndb.StringProperty()

  metadata = ndb.TextProperty()
  contributors = ndb.TextProperty()
  tags = ndb.StringProperty(repeated=True)
  participation = ndb.TextProperty()

  metadata_etag = ndb.StringProperty()
  contributors_etag = ndb.StringProperty()
  tags_etag = ndb.StringProperty()
  participation_etag = ndb.StringProperty()

  contributor_count = ndb.IntegerProperty()

  ingest_versions = ndb.BooleanProperty(default=True)

  status = ndb.StringProperty(default=Status.pending)
  error = ndb.StringProperty()
  updated = ndb.DateTimeProperty(auto_now=True)

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
    version_cache = yield VersionCache.get_by_id_async('versions', parent=key)
    versions = []
    if version_cache is not None:
      versions = version_cache.versions
    raise ndb.Return(versions)

  @staticmethod
  @ndb.tasklet
  def uncached_versions_for_key_async(key):
    versions = yield Version.query(Version.status == Status.ready, ancestor=key).fetch_async(keys_only=True)
    versions = [key.id() for key in versions if versiontag.is_valid(key.id())]
    versions.sort(versiontag.compare)
    raise ndb.Return(versions)

class VersionCache(ndb.Model):
  versions = ndb.StringProperty(repeated=True, indexed=False)

  @staticmethod
  @ndb.tasklet
  @ndb.transactional
  def update_async(library_key, create=False):
    versions = yield Library.uncached_versions_for_key_async(library_key)
    if create:
      version_cache = yield VersionCache.get_or_insert_async('versions', parent=library_key, versions=versions)
    else:
      version_cache = yield VersionCache.get_by_id_async('versions', parent=library_key)
    if version_cache is not None and version_cache.versions != versions:
      version_cache.versions = versions
      version_cache.put()
    raise ndb.Return(None)

class Version(ndb.Model):
  sha = ndb.StringProperty(required=True)
  url = ndb.StringProperty()

  status = ndb.StringProperty(default=Status.pending)
  error = ndb.StringProperty()
  updated = ndb.DateTimeProperty(auto_now=True)

  @staticmethod
  @ndb.tasklet
  def collections_for_key_async(version_key):
    library_key = version_key.parent()
    collection_references = yield CollectionReference.query(ancestor=library_key).fetch_async()
    collection_version_futures = [ref.collection_version_key().get_async() for ref in collection_references]
    # If there are multiple versions of a collection we want to find the most recent one that applies.
    result_map = {}
    for i, version_future in enumerate(collection_version_futures):
      collection_version = yield version_future
      if collection_version is None:
        # Remove the stale reference.
        yield collection_references[i].key.delete_async()
      elif versiontag.match(version_key.id(), collection_references[i].semver):
        collection_id = collection_version.key.parent().id()
        existing_version = result_map.get(collection_id, None)
        if existing_version is None or versiontag.compare(collection_version.key.id(), existing_version.key.id()) > 0:
          result_map[collection_id] = collection_version
      else:
        raise Exception([version_key.id(), collection_references[i].semver])
    raise ndb.Return(result_map.values())

class Content(ndb.Model):
  content = ndb.TextProperty(required=True)
  etag = ndb.StringProperty()
  updated = ndb.DateTimeProperty(auto_now=True)

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

