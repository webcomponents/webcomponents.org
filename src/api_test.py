import unittest
import webtest

from api import app
import util

from test_base import TestBase

class ApiTestBase(TestBase):
  def setUp(self):
    TestBase.setUp(self)
    self.app = webtest.TestApp(app)

class OnDemandTest(ApiTestBase):
  def setUp(self):
    ApiTestBase.setUp(self)
    util.SECRETS['recaptcha'] = 'secret'

  def test_resolve_pull(self):
    self.respond_to('https://www.google.com/recaptcha/api/siteverify', '{"success": true}')
    self.respond_to('https://api.github.com/repos/org/repo/git/refs/pull/1/head', '{"ref": "refs/pull/1/head", "object": {"sha": "pullsha"}}')
    response = self.app.post('/api/ondemand', params={'url': 'https://github.com/org/repo/pull/1'})
    self.assertEqual(response.status_int, 200)
    self.assertEqual(response.normal_body, 'pullsha')

  def test_resolve_commitsha(self):
    self.respond_to('https://www.google.com/recaptcha/api/siteverify', '{"success": true}')
    response = self.app.post('/api/ondemand', params={'url': 'https://github.com/org/repo/commit/commitsha'})
    self.assertEqual(response.status_int, 200)
    self.assertEqual(response.normal_body, 'commitsha')

  def test_resolve_treebranch(self):
    self.respond_to('https://www.google.com/recaptcha/api/siteverify', '{"success": true}')
    self.respond_to('https://api.github.com/repos/org/repo/git/refs/heads/branch', '{"ref": "refs/heads/branch", "object": {"sha": "branchsha"}}')
    response = self.app.post('/api/ondemand', params={'url': 'https://github.com/org/repo/tree/branch'})
    self.assertEqual(response.status_int, 200)
    self.assertEqual(response.normal_body, 'branchsha')

  def test_resolve_repo(self):
    self.respond_to('https://www.google.com/recaptcha/api/siteverify', '{"success": true}')
    self.respond_to('https://api.github.com/repos/org/repo/git/refs/heads/master', '{"ref": "refs/heads/master", "object": {"sha": "mastersha"}}')
    response = self.app.post('/api/ondemand', params={'url': 'https://github.com/org/repo'})
    self.assertEqual(response.status_int, 200)
    self.assertEqual(response.normal_body, 'mastersha')

  def test_resolve_pullsha(self):
    self.respond_to('https://www.google.com/recaptcha/api/siteverify', '{"success": true}')
    response = self.app.post('/api/ondemand', params={'url': 'https://github.com/org/repo/pull/1/commits/pullcommitsha'})
    self.assertEqual(response.status_int, 200)
    self.assertEqual(response.normal_body, 'pullcommitsha')

if __name__ == '__main__':
  unittest.main()
