import unittest
import versiontag

class VersionTagTest(unittest.TestCase):
  def test_x_ranges(self):
    self.assertTrue(versiontag.match('1.1.2', '1.1.x'))
    self.assertTrue(versiontag.match('1.0.0', '1.x.x'))
    self.assertTrue(versiontag.match('1.1.0', '1.x.x'))
    self.assertTrue(versiontag.match('1.0.1', '1.x.x'))
    self.assertTrue(versiontag.match('1.0.0', '1.x'))
    self.assertTrue(versiontag.match('1.1.0', '1.x'))
    self.assertTrue(versiontag.match('1.0.1', '1.x'))

    self.assertFalse(versiontag.match('1.1.0', '1.0.x'))
    self.assertFalse(versiontag.match('0.1.0', '1.0.x'))
    self.assertFalse(versiontag.match('2.0.0', '1.0.x'))

    self.assertFalse(versiontag.match('2.0.0', '1.x'))
    self.assertFalse(versiontag.match('0.0.1', '1.x'))

  def test_tilde_ranges(self):
    self.assertTrue(versiontag.match('1.0.0', '~1'))
    self.assertTrue(versiontag.match('1.1.0', '~1'))
    self.assertTrue(versiontag.match('1.0.1', '~1'))
    self.assertFalse(versiontag.match('2.0.0', '~1'))
    self.assertFalse(versiontag.match('0.1.0', '~1'))
    self.assertFalse(versiontag.match('0.0.1', '~1'))

  def test_categorize(self):
    self.assertEqual(versiontag.categorize('v1.0.0', []), 'unknown')
    self.assertEqual(versiontag.categorize('v2.0.0', ['v1.0.0']), 'major')
    self.assertEqual(versiontag.categorize('v1.1.0', ['v1.0.0']), 'minor')
    self.assertEqual(versiontag.categorize('v1.1.1', ['v1.0.0']), 'minor')
    self.assertEqual(versiontag.categorize('v1.0.1', ['v1.0.0']), 'patch')
    self.assertEqual(versiontag.categorize('1.0.1', ['v1.0.0']), 'patch')

    self.assertEqual(versiontag.categorize('bestversionever', ['v1.0.0']), 'unknown')

    self.assertEqual(versiontag.categorize('v2.0.0', ['v1.0.0', 'v3.0.0']), 'major')
    self.assertEqual(versiontag.categorize('v2.1.0', ['v1.0.0', 'v3.0.0']), 'major')
    self.assertEqual(versiontag.categorize('v2.1.1', ['v1.0.0', 'v2.1.0', 'v3.0.0']), 'patch')
