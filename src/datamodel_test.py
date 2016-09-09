from datamodel import Library, Version, Status, VersionCache, CollectionReference

from google.appengine.ext import ndb

from test_base import TestBase

class VersionCacheTests(TestBase):
  def test_versions_for_key(self):
    library_key = ndb.Key(Library, 'a/b')
    Version(id='v2.0.0', sha='x', status=Status.ready, parent=library_key).put()
    Version(id='v1.0.0', sha='x', status=Status.ready, parent=library_key).put()
    Version(id='v3.0.0', sha='x', status=Status.ready, parent=library_key).put()
    Version(id='v3.0.X', sha='x', status=Status.ready, parent=library_key).put()
    Version(id='v4.0.0', sha='x', status=Status.error, parent=library_key).put()
    Version(id='v5.0.0', sha='x', status=Status.pending, parent=library_key).put()
    Version(id='xxx', sha='x', status=Status.ready, parent=library_key).put()
    versions = yield Library.uncached_versions_for_key_async(library_key)
    self.assertEqual(versions, ['v1.0.0', 'v2.0.0', 'v3.0.0'])

  @ndb.toplevel
  def test_version_cache(self):
    library_key = ndb.Key(Library, 'a/b')
    Version(id='v2.0.0', sha='x', status=Status.ready, parent=library_key).put()
    Version(id='v1.0.0', sha='x', status=Status.ready, parent=library_key).put()
    Version(id='v3.0.0', sha='x', status=Status.ready, parent=library_key).put()
    Version(id='v3.0.X', sha='x', status=Status.ready, parent=library_key).put()
    Version(id='v4.0.0', sha='x', status=Status.error, parent=library_key).put()
    Version(id='v5.0.0', sha='x', status=Status.pending, parent=library_key).put()
    Version(id='xxx', sha='x', status=Status.ready, parent=library_key).put()
    versions = yield Library.versions_for_key_async(library_key)
    self.assertEqual(versions, [])

    yield VersionCache.update_async(library_key)
    versions = yield Library.versions_for_key_async(library_key)
    self.assertEqual(versions, [])

    yield VersionCache.update_async(library_key, create=True)
    versions = yield Library.versions_for_key_async(library_key)
    self.assertEqual(versions, ['v1.0.0', 'v2.0.0', 'v3.0.0'])

    Version(id='v6.0.0', sha='x', status=Status.ready, parent=library_key).put()
    yield VersionCache.update_async(library_key)
    versions = yield Library.versions_for_key_async(library_key)
    self.assertEqual(versions, ['v1.0.0', 'v2.0.0', 'v3.0.0', 'v6.0.0'])

class CollectionReferenceTests(TestBase):
  @ndb.toplevel
  def test_stale_ref_is_removed(self):
    # Stale since the collection version doesn't actually exist.
    collection_v0 = ndb.Key(Library, 'collection/1', Version, 'v0.5.0')

    element_key = ndb.Key(Library, 'ele/ment')
    element_v1 = Version(id='v1.0.0', sha='x', status=Status.ready, parent=element_key).put()

    ref0 = CollectionReference.ensure(element_key, collection_v0, '^1.0.0')
    collections = yield Version.collections_for_key_async(element_v1)
    collection_keys = [collection.key for collection in collections]

    self.assertIsNone(ref0.get())
    self.assertEqual(collection_keys, [])

  @ndb.toplevel
  def test_latest_matching_collection_version_is_returned(self):
    collection_key = ndb.Key(Library, 'collection/1')
    collection_v1 = Version(id='v1.0.0', sha='x', status=Status.ready, parent=collection_key).put()
    collection_v2 = Version(id='v2.0.0', sha='x', status=Status.ready, parent=collection_key).put()

    element_key = ndb.Key(Library, 'ele/ment')
    element_v1 = Version(id='v1.0.0', sha='x', status=Status.ready, parent=element_key).put()

    CollectionReference.ensure(element_key, collection_v1, '^1.0.0')
    CollectionReference.ensure(element_key, collection_v2, '^1.0.0')

    collections = yield Version.collections_for_key_async(element_v1)
    collection_keys = [collection.key for collection in collections]

    # Only latest matching version of the collection should be present.
    self.assertEqual(collection_keys, [
        collection_v2,
    ])
