import json
import unittest
import webtest

from datamodel import Library, Version, Content
from manage import app
import util

from google.appengine.ext import ndb

from test_base import TestBase

class ManageTestBase(TestBase):
  def setUp(self):
    TestBase.setUp(self)
    self.app = webtest.TestApp(app)

class XsrfTest(ManageTestBase):
  def test_xsrf_protected(self):
    self.app.get('/manage/token', status=200)
    self.respond_to('https://api.github.com/rate_limit', '')
    self.app.get('/manage/github', status=200)
    self.app.get('/manage/update-all', status=403)
    self.app.get('/manage/add/element/org/repo', status=403)
    self.app.get('/manage/delete/element/org', status=403)
    self.app.get('/manage/delete_everything/yes_i_know_what_i_am_doing', status=403)
    self.app.get('/task/update/owner/repo', status=403)
    self.app.get('/task/ingest/commit/owner/repo/kind', status=403)
    self.app.get('/task/ingest/library/owner/repo/kind', status=403)
    self.app.get('/task/ingest/dependencies/owner/repo/version', status=403)
    self.app.get('/task/ingest/version/owner/repo/version', status=403)

  def test_token_only_valid_once(self):
    token = self.app.get('/manage/token').normal_body
    self.app.get('/manage/update-all', status=200, params={'token': token})
    self.app.get('/manage/update-all', status=403, params={'token': token})

class ManageUpdateTest(ManageTestBase):
  def test_update_respects_304(self):
    library = Library(id='org/repo', metadata_etag='a', contributors_etag='b', tags_etag='c')
    library.put()
    self.respond_to_github('https://api.github.com/repos/org/repo', {'status': 304})
    self.respond_to_github('https://api.github.com/repos/org/repo/contributors', {'status': 304})
    self.respond_to_github('https://api.github.com/repos/org/repo/git/refs/tags', {'status': 304})

    response = self.app.get('/task/update/org/repo', headers={'X-AppEngine-QueueName': 'default'})
    self.assertEqual(response.status_int, 200)
    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual(len(tasks), 0)

  def test_update_deletes(self):
    library = Library(id='org/repo', metadata_etag='a', contributors_etag='b', tags_etag='c')
    library.put()
    version = Version(parent=library.key, id='v1.0.0', sha='lol')
    version.put()

    self.respond_to_github('https://api.github.com/repos/org/repo', {'status': 404})
    response = self.app.get('/task/update/org/repo', headers={'X-AppEngine-QueueName': 'default'})
    self.assertEqual(response.status_int, 200)

    version = Version.get_by_id('v1.0.0', parent=library.key)
    library = Library.get_by_id('org/repo')

    self.assertIsNone(library)
    self.assertIsNone(version)

class ManageAddTest(ManageTestBase):
  def test_add_element(self):
    token = self.app.get('/manage/token').normal_body
    response = self.app.get('/manage/add/element/org/repo', params={'token': token})
    self.assertEqual(response.status_int, 200)
    self.assertEqual(response.normal_body, 'OK')

    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual(len(tasks), 1)
    self.assertEqual(tasks[0].url, util.ingest_library_task('org', 'repo', 'element'))

    self.respond_to_github('https://api.github.com/repos/org/repo', 'metadata bits')
    self.respond_to_github('https://api.github.com/repos/org/repo/contributors', '["a"]')
    self.respond_to_github('https://api.github.com/repos/org/repo/git/refs/tags', '[{"ref": "refs/tags/v1.0.0", "object": {"sha": "lol"}}]')
    response = self.app.get(util.ingest_library_task('org', 'repo', 'element'), headers={'X-AppEngine-QueueName': 'default'})
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

    response = self.app.get(util.ingest_version_task('org', 'repo', 'v1.0.0'), headers={'X-AppEngine-QueueName': 'default'})
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

    response = self.app.get(util.ingest_version_task('org', 'repo', 'v1.0.1'), params={'latestVersion': 'True'}, headers={'X-AppEngine-QueueName': 'default'})
    self.assertEqual(response.status_int, 200)

    version2 = version2.key.get()
    self.assertEqual(version2.error, "Could not store README.md as a utf-8 string")

    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual(len(tasks), 1)
    self.assertEqual(tasks[0].url, util.ingest_version_task('org', 'repo', 'v1.0.0') + '?latestVersion=True')

  def test_ingest_commit(self):
    self.respond_to_github('https://api.github.com/repos/org/repo', 'metadata bits')
    self.respond_to_github('https://api.github.com/repos/org/repo/contributors', '["a"]')
    response = self.app.get(util.ingest_commit_task('org', 'repo'), params={'commit': 'commit-sha', 'url': 'url'}, headers={'X-AppEngine-QueueName': 'default'})
    self.assertEqual(response.status_int, 200)

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
