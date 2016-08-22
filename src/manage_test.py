import json
import re
import unittest
import webtest

from datamodel import Library, Version, Content
from manage import app
import util

from google.appengine.api import urlfetch_stub
from google.appengine.ext import ndb
from google.appengine.ext import testbed


class ManageTestBase(unittest.TestCase):
  def setUp(self):
    self.testbed = testbed.Testbed()
    self.testbed.activate()
    self.testbed.init_datastore_v3_stub()
    self.testbed.init_urlfetch_stub()
    self.testbed.init_memcache_stub()
    self.testbed.init_taskqueue_stub()
    self.testbed.init_search_stub()

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
    self.assertEqual(self._expected_fetches, [])

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
      response.set_statuscode(int(result.get('status', 200)))
      response.set_content(result.get('content', ''))
      for (name, value) in result.get('headers', {}).items():
        header = response.add_header()
        header.set_key(name)
        header.set_value(value)
    self._expected_fetches.append((match, handle))

class ManageUpdateTest(ManageTestBase):
  def test_update_respects_304(self):
    library = Library(id='org/repo', metadata_etag='a', contributors_etag='b', tags_etag='c')
    library.put()
    self.respond_to_github('https://api.github.com/repos/org/repo', {'status': 304})
    self.respond_to_github('https://api.github.com/repos/org/repo/contributors', {'status': 304})
    self.respond_to_github('https://api.github.com/repos/org/repo/git/refs/tags', {'status': 304})

    response = self.app.get('/task/update/org/repo')
    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual(len(tasks), 0)

  def test_update_deletes(self):
    library = Library(id='org/repo', metadata_etag='a', contributors_etag='b', tags_etag='c')
    library.put()
    version = Version(parent=library.key, id='v1.0.0', sha='lol')
    version.put()

    self.respond_to_github('https://api.github.com/repos/org/repo', {'status': 404})
    response = self.app.get('/task/update/org/repo')

    version = Version.get_by_id('v1.0.0', parent=library.key)
    library = Library.get_by_id('org/repo')

    self.assertIsNone(library)
    self.assertIsNone(version)

class ManageAddTest(ManageTestBase):
  def test_add_element(self):
    response = self.app.get('/manage/add/element/org/repo')
    self.assertEqual(response.status_int, 200)
    self.assertEqual(response.normal_body, 'OK')

    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual(len(tasks), 1)
    self.assertEqual(tasks[0].url, util.ingest_library_task('org', 'repo', 'element'))

    self.respond_to_github('https://api.github.com/repos/org/repo', 'metadata bits')
    self.respond_to_github('https://api.github.com/repos/org/repo/contributors', '["a"]')
    self.respond_to_github('https://api.github.com/repos/org/repo/git/refs/tags', '[{"ref": "refs/tags/v1.0.0", "object": {"sha": "lol"}}]')
    response = self.app.get(util.ingest_library_task('org', 'repo', 'element'))
    self.assertEqual(response.status_int, 200)
    library = Library.get_by_id('org/repo')
    self.assertIsNotNone(library)
    self.assertIsNone(library.error)
    self.assertEqual(library.kind, 'element')
    self.assertEqual(library.metadata, 'metadata bits')
    self.assertEqual(library.contributors, '["a"]')
    self.assertEqual(library.contributor_count, 1)

    version = ndb.Key(Library, 'org/repo', Version, 'v1.0.0').get()
    self.assertIsNone(version.error)
    self.assertEqual(version.sha, 'lol')

    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual(len(tasks), 2)
    self.assertEqual(tasks[1].url, util.ingest_version_task('org', 'repo', 'v1.0.0') + '?latestVersion=True')

  def test_ingest_version(self):
    library = Library(id='org/repo', metadata='{"full_name": "NSS Bob", "stargazers_count": 420, "subscribers_count": 419, "forks": 418, "updated_at": "2011-8-10T13:47:12Z"}', contributor_count=417)
    version = Version(parent=library.key, id='v1.0.0', sha='lol')
    library.put()
    version.put()

    self.respond_to('https://raw.githubusercontent.com/org/repo/v1.0.0/README.md', 'README')
    self.respond_to('https://raw.githubusercontent.com/org/repo/v1.0.0/bower.json', '{}')
    self.respond_to_github('https://api.github.com/markdown', '<html>README</html>')

    response = self.app.get(util.ingest_version_task('org', 'repo', 'v1.0.0'))
    self.assertEqual(response.status_int, 200)

    version = version.key.get()
    self.assertIsNone(version.error)

    readme = ndb.Key(Library, 'org/repo', Version, 'v1.0.0', Content, 'readme').get()
    self.assertEqual(readme.content, 'README')
    readme_html = ndb.Key(Library, 'org/repo', Version, 'v1.0.0', Content, 'readme.html').get()
    self.assertEqual(readme_html.content, '<html>README</html>')
    bower = ndb.Key(Library, 'org/repo', Version, 'v1.0.0', Content, 'bower').get()
    self.assertEqual(bower.content, '{}')

  def test_ingest_version_falls_back(self):
    library = Library(id='org/repo', metadata='{"full_name": "NSS Bob", "stargazers_count": 420, "subscribers_count": 419, "forks": 418, "updated_at": "2011-8-10T13:47:12Z"}', contributor_count=417)
    library.tags = json.dumps(["v1.0.0", "v1.0.1"])
    library.put()
    version1 = Version(parent=library.key, id='v1.0.0', sha='lol')
    version1.put()
    version2 = Version(parent=library.key, id='v1.0.1', sha='lol')
    version2.put()

    self.respond_to('https://raw.githubusercontent.com/org/repo/v1.0.1/README.md', chr(248))

    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual(len(tasks), 0)

    self.app.get(util.ingest_version_task('org', 'repo', 'v1.0.1'), params={'latestVersion': 'True'})

    version2 = version2.key.get()
    self.assertEqual(version2.error, "Could not store README.md as a utf-8 string")

    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual(len(tasks), 1)
    self.assertEqual(tasks[0].url, util.ingest_version_task('org', 'repo', 'v1.0.0') + '?latestVersion=True')

  def test_ingest_commit(self):
    self.respond_to_github('https://api.github.com/repos/org/repo', 'metadata bits')
    self.respond_to_github('https://api.github.com/repos/org/repo/contributors', '["a"]')
    self.app.get(util.ingest_commit_task('org', 'repo', 'element'), params={'commit': 'commit-sha', 'url': 'url'})

    library = Library.get_by_id('org/repo')
    self.assertIsNotNone(library)
    self.assertIsNone(library.error)
    self.assertFalse(library.ingest_versions)

    version = Version.get_by_id(parent=library.key, id='commit-sha')
    self.assertEqual(version.sha, 'commit-sha')
    self.assertEqual(version.url, 'url')

    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual(len(tasks), 1)
    self.assertEqual(tasks[0].url, util.ingest_version_task('org', 'repo', 'commit-sha'))

if __name__ == '__main__':
  unittest.main()
