from datamodel import Library, Version, Status, VersionCache

from google.appengine.ext import ndb

from test_base import TestBase

class LibraryTests(TestBase):
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
