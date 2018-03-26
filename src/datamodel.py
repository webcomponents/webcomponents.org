from google.appengine.ext import ndb

import json
import re
import versiontag

class CollectionReference(ndb.Model):
  semver = ndb.StringProperty(indexed=False)

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
  suppressed = 'suppressed'

class Author(ndb.Model):
  metadata = ndb.TextProperty(indexed=False)

  metadata_etag = ndb.StringProperty(indexed=False)
  metadata_updated = ndb.DateTimeProperty()

  status = ndb.StringProperty(default=Status.pending)
  error = ndb.StringProperty(indexed=False)
  updated = ndb.DateTimeProperty(auto_now=True)

class Library(ndb.Model):
  github_owner = ndb.StringProperty(indexed=False)
  github_repo = ndb.StringProperty(indexed=False)
  github_access_token = ndb.StringProperty(indexed=False)

  kind = ndb.StringProperty(default='element')
  collection_sequence_number = ndb.IntegerProperty(indexed=False, default=0)

  spdx_identifier = ndb.StringProperty(indexed=False)

  registry_metadata = ndb.TextProperty(indexed=False)
  registry_metadata_updated = ndb.DateTimeProperty()

  metadata = ndb.TextProperty(indexed=False)
  metadata_etag = ndb.StringProperty(indexed=False)
  metadata_updated = ndb.DateTimeProperty()

  contributors = ndb.TextProperty(indexed=False)
  contributors_etag = ndb.StringProperty(indexed=False)
  contributors_updated = ndb.DateTimeProperty()

  tags = ndb.StringProperty(repeated=True, indexed=False)
  tag_map = ndb.TextProperty(indexed=False)
  tags_etag = ndb.StringProperty(indexed=False)
  tags_updated = ndb.DateTimeProperty()

  participation = ndb.TextProperty(indexed=False)
  participation_etag = ndb.StringProperty(indexed=False)
  participation_updated = ndb.DateTimeProperty()

  shallow_ingestion = ndb.BooleanProperty(default=False)

  status = ndb.StringProperty(default=Status.pending)
  error = ndb.StringProperty(indexed=False)
  updated = ndb.DateTimeProperty(auto_now=True)

  npm_package = ndb.StringProperty(indexed=False)
  migrated_from_bower = ndb.BooleanProperty(indexed=False, default=False)

  @staticmethod
  def id(owner, repo):
    return '%s/%s' % (owner.lower(), repo.lower())

  @staticmethod
  def github_from_url(path):
    path = re.sub('git://github.com/', '', path)
    path = re.sub(r'(git\+)?https?:\/\/github.com\/', '', path)
    path = re.sub(r'\.git$', '', path)
    split = path.split('/')
    return (split[0], split[1]) if len(split) is 2 else ('', '')

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
  def default_version_for_key_async(key):
    versions = yield Library.versions_for_key_async(key)
    if versions == []:
      raise ndb.Return(None)
    raise ndb.Return(versiontag.default_version(versions))

  @staticmethod
  def uncached_versions_for_key(key):
    versions = Version.query(Version.status != Status.pending, ancestor=key).fetch(keys_only=True)
    versions = [key.id() for key in versions if versiontag.is_valid(key.id())]
    versions.sort(versiontag.compare)
    return versions

class VersionCache(ndb.Model):
  versions = ndb.StringProperty(repeated=True, indexed=False)

  @staticmethod
  @ndb.transactional
  def update(library_key):
    """Updates the version cache and returns whether the latest version has
       changed and an index update is needed.
    """
    versions = Library.uncached_versions_for_key(library_key)
    version_cache = VersionCache.get_or_insert('versions', parent=library_key)
    needs_index_update = False
    if version_cache.versions != versions:
      old_default = versiontag.default_version(version_cache.versions)
      new_default = versiontag.default_version(versions)
      needs_index_update = old_default != new_default
      version_cache.versions = versions
      version_cache.put()
    return needs_index_update

class Version(ndb.Model):
  sha = ndb.StringProperty(required=True, indexed=False)
  url = ndb.StringProperty(indexed=False)

  preview = ndb.BooleanProperty(default=False)
  status = ndb.StringProperty(default=Status.pending)
  error = ndb.StringProperty(indexed=False)
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
    raise ndb.Return(result_map.values())

class Content(ndb.Model):
  content = ndb.TextProperty(indexed=False)
  json = ndb.JsonProperty(indexed=False, compressed=True)

  etag = ndb.StringProperty(indexed=False)
  status = ndb.StringProperty(default=Status.pending)
  error = ndb.StringProperty(indexed=False)
  updated = ndb.DateTimeProperty(auto_now=True)

  def get_json(self):
    if self.json is not None:
      return self.json
    if self.content is not None:
      return json.loads(self.content)
    return self.content

  def set_json(self, data):
    if self.content:
      self.content = None
    self.json = data

class Dependency(object):
  def __init__(self, owner, repo, version):
    self.owner = owner
    self.repo = repo
    self.version = version

  @staticmethod
  def from_string(dep_string):
    # Strip fully qualified URLs.
    dep_string = re.sub(r'https://github\.com/(.*)', r'\1', dep_string)
    dep_string = re.sub(r'.git\b', '', dep_string)
    bits = dep_string.split('#', 1)
    if len(bits) == 1:
      bits.append('*')
    repo_bits = bits[0].split('/', 1)
    if len(repo_bits) != 2:
      return None
    owner, repo = repo_bits
    return Dependency(owner, repo, bits[1])

class Sitemap(ndb.Model):
  pages = ndb.StringProperty(repeated=True, indexed=False)
