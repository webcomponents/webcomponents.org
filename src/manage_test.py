import unittest
import webtest
import re

from manage import app
from datamodel import Library
import quota
import util

from google.appengine.api import urlfetch_stub
from google.appengine.ext import ndb
from google.appengine.ext import testbed


class ManageTestBase(unittest.TestCase):
  def setUp(self):
    self.testbed = testbed.Testbed()
    self.testbed.activate()
    self.testbed.init_all_stubs()

    self._expected_fetches = []
    # pylint: disable=protected-access
    self.testbed._register_stub(
        testbed.URLFETCH_SERVICE_NAME,
        urlfetch_stub.URLFetchServiceStub(
            urlmatchers_to_fetch_functions=[(lambda a: True, self._fetch)]))

    self.tasks = self.testbed.get_stub(
        testbed.TASKQUEUE_SERVICE_NAME)
    self.app = webtest.TestApp(app)

  def tearDown(self):
    self.testbed.deactivate()
    ndb.get_context().clear_cache()

  def _fetch(self, url, payload, method, headers, request, response, **params):
    for idx, (match, handler) in enumerate(self._expected_fetches):
      if re.match(match, url):
        del self._expected_fetches[idx]
        params['payload'] = payload
        params['method'] = method
        params['headers'] = headers
        params['request'] = request
        handler(url, response, params)
        return
    # TODO: assert not reached?
    raise Exception('Unexpected fetch of %s' % url)

  def _normalize_response(self, result):
    if isinstance(result, str):
      return {'content': result}
    return result

  def respond_to_github(self, match, result, remaining='42'):
    result = self._normalize_response(result)
    result['headers'] = result.get('headers', {})
    result['headers']['X-RateLimit-Remaining'] = remaining
    self.respond_to(match, result)

  def respond_to(self, match, result):
    result = self._normalize_response(result)
    def handle(url, response, _):
      assert re.match(match, url)
      response.set_statuscode(result.get('status', 200))
      response.set_content(result.get('content', ''))
      for (name, value) in result.get('headers', {}).items():
        header = response.add_header()
        header.set_key(name)
        header.set_value(value)
    self._expected_fetches.append((match, handle))

class GithubRateLimitTest(ManageTestBase):
  def respond_to_rate_limit(self, limit):
    self.respond_to('https://api.github.com/rate_limit', {
        'headers': {'X-RateLimit-Remaining': limit},
    })

  def test_request_without_reserve(self):
    github = quota.GitHub()
    with self.assertRaises(quota.QuotaExceededError):
      github.github_resource('repos', 'org', 'repo')

  def test_limit_exceeded(self):
    quota.used(used_count=0, new_remaining=1)
    github = quota.GitHub()
    github.reserve(1)
    self.respond_to_github('https://api.github.com/repos/org/repo', {
        'status': 403,
    }, remaining='0')
    with self.assertRaises(quota.QuotaExceededError):
      github.github_resource('repos', 'org', 'repo')

  def test_limit_reset(self):
    github = quota.GitHub()
    github.reserve(1)
    quota.used(used_count=0, new_remaining=0)
    self.respond_to_rate_limit('1')
    self.respond_to_github('https://api.github.com/repos/org/repo', '')
    github.github_resource('repos', 'org', 'repo')

class ManageAddTest(ManageTestBase):
  def test_add_element(self):
    response = self.app.get('/manage/add/element/org/repo')
    self.assertEqual(response.status_int, 200)
    self.assertEqual(response.normal_body, 'OK')

    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual(len(tasks), 1)
    self.assertEqual(tasks[0].url, util.library_ingestion_task('org', 'repo', 'element'))


    self.respond_to_github('https://api.github.com/repos/org/repo', 'metadata bits')
    self.respond_to_github('https://api.github.com/repos/org/repo/contributors', '["a"]')
    self.respond_to_github('https://api.github.com/repos/org/repo/git/refs/tags', '[{"ref": "v1.0.0"}]')
    response = self.app.get(util.library_ingestion_task('org', 'repo', 'element'))
    self.assertEqual(response.status_int, 200)
    library = Library.get_by_id('org/repo')
    self.assertIsNotNone(library)
    self.assertEqual(library.kind, 'element')
    self.assertEquals(library.metadata, 'metadata bits')
    self.assertEquals(library.contributors, '["a"]')
    self.assertEquals(library.contributor_count, 1)

if __name__ == '__main__':
  unittest.main()
