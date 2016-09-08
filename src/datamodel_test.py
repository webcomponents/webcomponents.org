from datamodel import Library, Version

from google.appengine.ext import ndb

from test_base import TestBase

class LibraryTests(TestBase):
  def test_versions_for_key(self):
    library_key = ndb.Key(Library, 'a/b')
    Version(id='v2.0.0', sha='x', parent=library_key).put()
    Version(id='v1.0.0', sha='x', parent=library_key).put()
    Version(id='v3.0.0', sha='x', parent=library_key).put()
    Version(id='v3.0.X', sha='x', parent=library_key).put()
    Version(id='xxx', sha='x', parent=library_key).put()
    versions = Library.versions_for_key_async(library_key).get_result()
    self.assertEqual(versions, ['v1.0.0', 'v2.0.0', 'v3.0.0'])

