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
