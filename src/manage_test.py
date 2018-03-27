from base64 import b64encode
import json
import unittest
import webtest

from datamodel import Author, Library, Version, Content, Status, VersionCache, CollectionReference
from manage import app
import util

from google.appengine.ext import ndb
from google.appengine.api import search

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
    self.app.get('/manage/analyze-all', status=403)
    self.app.get('/manage/index-all', status=403)
    self.app.get('/manage/update-all', status=403)
    self.app.get('/manage/add/org/repo', status=403)
    self.app.get('/manage/delete/org/repo', status=403)
    self.app.get('/manage/delete_everything/yes_i_know_what_i_am_doing', status=403)
    self.app.get('/task/analyze/owner/repo', status=403)
    self.app.get('/task/analyze/owner/repo/True', status=403)
    self.app.get('/task/update/owner', status=403)
    self.app.get('/task/update/owner/repo', status=403)
    self.app.get('/task/ensure/owner', status=403)
    self.app.get('/task/ensure/owner/repo', status=403)
    self.app.get('/task/migrate/owner/repo/scope/package', status=403)
    self.app.get('/task/delete/owner/repo/version', status=403)
    self.app.get('/task/ingest/owner', status=403)
    self.app.get('/task/ingest/owner/repo', status=403)
    self.app.get('/task/ingest/owner/repo/version', status=403)
    self.app.get('/task/ingest-preview/owner/repo', status=403)
    self.app.get('/task/ingest-webhook/owner/repo', status=403)
    self.app.get('/task/update-indexes/owner/repo', status=403)

  def test_token_only_valid_once(self):
    token = self.app.get('/manage/token').normal_body
    self.app.get('/manage/update-all', status=200, params={'token': token})
    self.app.get('/manage/update-all', status=403, params={'token': token})

  def test_invalid_token(self):
    self.app.get('/manage/update-all', status=403, params={'token': 'hello'})

class AnalyzeAllTest(ManageTestBase):
  def test_analyze_all(self):
    Library(id='owner/repo').put()

    response = self.app.get('/manage/analyze-all', headers={'X-AppEngine-QueueName': 'default'})
    self.assertEqual(response.status_int, 200)

    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual([
        util.analyze_library_task('owner', 'repo')
    ], [task.url for task in tasks])

  def test_analyze_all_latest(self):
    Library(id='owner/repo').put()

    response = self.app.get('/manage/analyze-all', headers={'X-AppEngine-QueueName': 'default'}, params={'latest': ''})
    self.assertEqual(response.status_int, 200)

    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual([
        util.analyze_library_task('owner', 'repo', True)
    ], [task.url for task in tasks])

class UpdateAllTest(ManageTestBase):
  def test_update_all(self):
    library_key = Library(id='owner/repo').put()
    author_key = Author(id='owner').put()

    response = self.app.get('/manage/update-all', headers={'X-AppEngine-QueueName': 'default'})
    self.assertEqual(response.status_int, 200)

    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual([
        util.update_library_task(library_key.id()),
        util.update_author_task(author_key.id()),
    ], [task.url for task in tasks])

class AnalyzeTest(ManageTestBase):
  def test_analyze(self):
    library_key = Library(id='owner/repo').put()
    version_key = Version(id='v1.1.1', parent=library_key, sha='sha', status='ready').put()

    response = self.app.get('/task/analyze/owner/repo', headers={'X-AppEngine-QueueName': 'default'})
    self.assertEqual(response.status_int, 200)

    content = Content.get_by_id('analysis', parent=version_key)
    self.assertEqual(content.get_json(), None)
    self.assertEqual(content.status, Status.pending)

    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual([
        util.ingest_analysis_task('owner', 'repo', 'v1.1.1'),
    ], [task.url for task in tasks])

  def test_analyze_leaves_existing_content_when_reanalyzing(self):
    library_key = Library(id='owner/repo').put()
    version_key = Version(id='v1.1.1', parent=library_key, sha='sha', status='ready').put()

    content = Content(id='analysis', parent=version_key, status=Status.pending)
    data = {"data": "existing data"}
    content.json = data
    content.status = Status.ready
    content.put()

    response = self.app.get('/task/analyze/owner/repo', headers={'X-AppEngine-QueueName': 'default'})
    self.assertEqual(response.status_int, 200)

    content = Content.get_by_id('analysis', parent=version_key)
    self.assertEqual(content.get_json(), data)
    self.assertEqual(content.status, Status.ready)

    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual([
        util.ingest_analysis_task('owner', 'repo', 'v1.1.1'),
    ], [task.url for task in tasks])

  def test_analyze_resets_error_content_when_reanalyzing(self):
    library_key = Library(id='owner/repo').put()
    version_key = Version(id='v1.1.1', parent=library_key, sha='sha', status='ready').put()

    content = Content(id='analysis', parent=version_key, status=Status.pending)
    content.status = Status.error
    content.put()

    response = self.app.get('/task/analyze/owner/repo', headers={'X-AppEngine-QueueName': 'default'})
    self.assertEqual(response.status_int, 200)

    content = Content.get_by_id('analysis', parent=version_key)
    self.assertEqual(content.status, Status.pending)

    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual([
        util.ingest_analysis_task('owner', 'repo', 'v1.1.1'),
    ], [task.url for task in tasks])

  def test_analyze_latest(self):
    library_key = Library(id='owner/repo').put()
    Version(id='v1.1.1', parent=library_key, sha='sha', status='ready').put()
    version_key = Version(id='v1.1.2', parent=library_key, sha='sha', status='ready').put()
    VersionCache.update(library_key)

    response = self.app.get('/task/analyze/owner/repo/True', headers={'X-AppEngine-QueueName': 'default'})
    self.assertEqual(response.status_int, 200)

    content = Content.get_by_id('analysis', parent=version_key)
    self.assertEqual(content.get_json(), None)
    self.assertEqual(content.status, Status.pending)

    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual([
        util.ingest_analysis_task('owner', 'repo', 'v1.1.2'),
    ], [task.url for task in tasks])

class MigrateLibraryTest(ManageTestBase):
  def test_migrate_library(self):
    library_key = Library(id='owner/repo').put()
    Version(id='v1.0.0', parent=library_key, sha='sha', status=Status.ready).put()
    library = Library.get_by_id('owner/repo')
    self.assertIsNone(library.npm_package)

    response = self.app.get('/task/migrate/owner/repo/@scope/package', headers={'X-AppEngine-QueueName': 'default'})
    self.assertEqual(response.status_int, 200)

    library = Library.get_by_id('owner/repo')
    self.assertEqual(library.npm_package, '@scope/package')

    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual(len(tasks), 0)

  def test_migrate_no_library(self):
    response = self.app.get('/task/migrate/noowner/norepo/@scope/package', headers={'X-AppEngine-QueueName': 'default'})
    self.assertEqual(response.status_int, 200)

class DeleteLibraryTest(ManageTestBase):
  def test_delete_library(self):
    library_key = Library(id='owner/repo').put()
    Version(id='v1.0.0', parent=library_key, sha='sha', status=Status.ready).put()
    Version(id='v2.0.0', parent=library_key, sha='sha', status=Status.ready).put()
    VersionCache.update(library_key)

    self.assertEqual(Library.versions_for_key_async(library_key).get_result(), ['v1.0.0', 'v2.0.0'])

    response = self.app.get('/manage/delete/owner/repo', headers={'X-AppEngine-QueueName': 'default'})
    self.assertEqual(response.status_int, 200)

    self.assertIsNone(Library.get_by_id('owner/repo'))
    self.assertEqual(Library.versions_for_key_async(library_key).get_result(), [])

    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual(len(tasks), 0)

  def test_delete_no_library(self):
    response = self.app.get('/manage/delete/noowner/norepo', headers={'X-AppEngine-QueueName': 'default'})
    self.assertEqual(response.status_int, 200)

class DeleteVersionTest(ManageTestBase):
  def test_delete_version(self):
    library_key = ndb.Key(Library, 'owner/repo')
    version_key = Version(id='v1.0.0', parent=library_key, sha='1', status=Status.ready).put()
    VersionCache.update(library_key)

    response = self.app.get('/task/delete/owner/repo/v1.0.0', headers={'X-AppEngine-QueueName': 'default'})
    self.assertEqual(response.status_int, 200)
    version = version_key.get()
    self.assertIsNone(version)
    self.assertEqual(Library.versions_for_key_async(library_key).get_result(), [])

class EnsureLibraryTest(ManageTestBase):
  def test_ensure_when_present(self):
    Library(id=Library.id('owner', 'repo')).put()
    response = self.app.get(util.ensure_library_task('owner', 'repo'), headers={'X-AppEngine-QueueName': 'default'})

    self.assertEqual(response.status_int, 200)

    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual([], [task.url for task in tasks])

  def test_ensure_when_missing(self):
    response = self.app.get(util.ensure_library_task('owner', 'repo'), headers={'X-AppEngine-QueueName': 'default'})

    self.assertEqual(response.status_int, 200)

    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual([
        util.ingest_library_task('owner', 'repo'),
    ], [task.url for task in tasks])

class EnsureAuthorTest(ManageTestBase):
  def test_ensure_when_present(self):
    Author(id='author').put()
    response = self.app.get(util.ensure_author_task('author'), headers={'X-AppEngine-QueueName': 'default'})

    self.assertEqual(response.status_int, 200)

    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual([], [task.url for task in tasks])

  def test_ensure_when_missing(self):
    response = self.app.get(util.ensure_author_task('author'), headers={'X-AppEngine-QueueName': 'default'})

    self.assertEqual(response.status_int, 200)

    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual([
        util.ingest_author_task('author'),
    ], [task.url for task in tasks])

class UpdateLibraryTest(ManageTestBase):
  def test_update_suppressed_is_noop(self):
    library = Library(id='org/repo', status=Status.suppressed, spdx_identifier='MIT')
    library.put()
    response = self.app.get('/task/update/org/repo', headers={'X-AppEngine-QueueName': 'default'})
    self.assertEqual(response.status_int, 200)
    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual(len(tasks), 0)

    library = library.key.get()
    self.assertEqual(library.status, Status.suppressed)

  def test_update_respects_304(self):
    library = Library(id='org/repo', metadata='{"owner":{"login":"org"},"name":"repo", "license": {"spdx_id": "MIT"}}', metadata_etag='a', contributors_etag='b', tags_etag='c', tag_map='{}', spdx_identifier='MIT')
    library.put()
    self.respond_to_github('https://api.github.com/repos/org/repo', {'status': 304})
    self.respond_to_github('https://api.github.com/repos/org/repo/contributors', {'status': 304})
    self.respond_to_github('https://api.github.com/repos/org/repo/tags', {'status': 304})
    self.respond_to_github('https://api.github.com/repos/org/repo/stats/participation', '{}')
    self.respond_to_github('https://raw.githubusercontent.com/org/repo/master/bower.json', '{}')

    response = self.app.get('/task/update/org/repo', headers={'X-AppEngine-QueueName': 'default'})
    self.assertEqual(response.status_int, 200)
    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual(len(tasks), 0)

  def test_renamed_repo_is_renamed(self):
    library = Library(id='org/repo', metadata_etag='a', contributors_etag='b', tags_etag='c', tag_map='{}', spdx_identifier='MIT')
    library.put()
    self.respond_to_github('https://api.github.com/repos/org/repo', json.dumps({
        "name": "newname",
        "owner": {"login": "newowner"},
    }))

    response = self.app.get('/task/update/org/repo', headers={'X-AppEngine-QueueName': 'default'})
    self.assertEqual(response.status_int, 200)

    library = library.key.get()
    self.assertIsNone(library)

    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual([
        util.ensure_library_task('newowner', 'newname'),
    ], [task.url for task in tasks])

  def test_update_deletes_missing_repo(self):
    library = Library(id='org/repo', metadata_etag='a', contributors_etag='b', tags_etag='c', spdx_identifier='MIT')
    library.put()
    version = Version(parent=library.key, id='v1.0.0', sha='lol')
    version.put()

    self.respond_to_github('https://api.github.com/repos/org/repo', {'status': 404})
    response = self.app.get('/task/update/org/repo', headers={'X-AppEngine-QueueName': 'default'})
    self.assertEqual(response.status_int, 200)

    version = version.key.get()
    library = library.key.get()

    self.assertIsNone(library)
    self.assertIsNone(version)

  def test_update_triggers_version_ingestion(self):
    library_key = Library(id='org/repo', tags=['v0.1.0', 'v1.0.0', 'v2.0.0'], spdx_identifier='MIT').put()
    Version(id='v0.1.0', parent=library_key, sha="old", status=Status.ready).put()
    Version(id='v1.0.0', parent=library_key, sha="old", status=Status.ready).put()
    Version(id='v2.0.0', parent=library_key, sha="old", status=Status.ready).put()
    VersionCache.update(library_key)

    self.respond_to_github('https://api.github.com/repos/org/repo', '{"owner":{"login":"org"},"name":"repo", "license": {"spdx_id": "MIT"}}')
    self.respond_to_github('https://api.github.com/repos/org/repo/contributors', {'status': 304})
    self.respond_to_github('https://api.github.com/repos/org/repo/tags', """[
        {"name": "v1.0.0", "commit": {"sha": "new"}},
        {"name": "v2.0.0", "commit": {"sha": "old"}},
        {"name": "v3.0.0", "commit": {"sha": "new"}}
    ]""")
    self.respond_to_github('https://api.github.com/repos/org/repo/stats/participation', '{}')
    self.respond_to_github('https://raw.githubusercontent.com/org/repo/master/bower.json', '{}')

    response = self.app.get(util.update_library_task('org/repo'), headers={'X-AppEngine-QueueName': 'default'})
    self.assertEqual(response.status_int, 200)

    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual([
        util.ingest_analysis_task('org', 'repo', 'v3.0.0'),
        util.ingest_version_task('org', 'repo', 'v3.0.0'),
    ], [task.url for task in tasks])

  def test_update_triggers_version_ingestion_npm(self):
    library_key = Library(id='org/repo', tags=['v0.1.0', 'v1.0.0', 'v2.0.0'], spdx_identifier='MIT').put()
    Version(id='v0.1.0', parent=library_key, sha="old", status=Status.ready).put()
    Version(id='v1.0.0', parent=library_key, sha="old", status=Status.ready).put()
    Version(id='v2.0.0', parent=library_key, sha="old", status=Status.ready).put()
    VersionCache.update(library_key)

    self.respond_to_github('https://api.github.com/repos/org/repo', '{"owner":{"login":"org"},"name":"repo", "license": {"spdx_id": "MIT"}}')
    self.respond_to_github('https://api.github.com/repos/org/repo/contributors', {'status': 304})
    self.respond_to_github('https://api.github.com/repos/org/repo/tags', """[
        {"name": "v1.0.0", "commit": {"sha": "new"}},
        {"name": "v2.0.0", "commit": {"sha": "old"}},
        {"name": "v3.0.0", "commit": {"sha": "new"}}
    ]""")
    self.respond_to_github('https://api.github.com/repos/org/repo/stats/participation', '{}')
    self.respond_to_github('https://raw.githubusercontent.com/org/repo/master/bower.json', '{}')

    response = self.app.get(util.update_library_task('org/repo'), headers={'X-AppEngine-QueueName': 'default'})
    self.assertEqual(response.status_int, 200)

    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual([
        util.ingest_analysis_task('org', 'repo', 'v3.0.0'),
        util.ingest_version_task('org', 'repo', 'v3.0.0'),
    ], [task.url for task in tasks])

  def test_update_doesnt_ingest_older_versions(self):
    library_key = Library(id='org/repo', tags=['v0.1.0', 'v1.0.0', 'v2.0.0'], spdx_identifier='MIT').put()
    Version(id='v1.0.0', parent=library_key, sha="old", status=Status.ready).put()
    VersionCache.update(library_key)

    self.respond_to_github('https://api.github.com/repos/org/repo', '{"owner":{"login":"org"},"name":"repo", "license": {"spdx_id": "MIT"}}')
    self.respond_to_github('https://api.github.com/repos/org/repo/contributors', {'status': 304})
    self.respond_to_github('https://api.github.com/repos/org/repo/tags', """[
        {"name": "v0.5.0", "commit": {"sha": "new"}},
        {"name": "v1.0.0", "commit": {"sha": "old"}}
    ]""")
    self.respond_to_github('https://api.github.com/repos/org/repo/stats/participation', '{}')
    self.respond_to_github('https://raw.githubusercontent.com/org/repo/master/bower.json', '{}')

    response = self.app.get(util.update_library_task('org/repo'), headers={'X-AppEngine-QueueName': 'default'})
    self.assertEqual(response.status_int, 200)

    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual([
    ], [task.url for task in tasks])

  def test_subsequent_update_triggers_version_ingestion(self):
    library_key = Library(id='org/repo', spdx_identifier='MIT', tag_map='{"v1.0.0":"new","v2.0.0":"old","v3.0.0":"new"}').put()
    Version(id='v0.1.0', parent=library_key, sha="old", status=Status.ready).put()
    Version(id='v1.0.0', parent=library_key, sha="old", status=Status.ready).put()
    Version(id='v2.0.0', parent=library_key, sha="old", status=Status.ready).put()
    VersionCache.update(library_key)

    self.respond_to_github('https://api.github.com/repos/org/repo', '{"owner":{"login":"org"},"name":"repo", "license": {"spdx_id": "MIT"}}')
    self.respond_to_github('https://api.github.com/repos/org/repo/contributors', {'status': 304})
    self.respond_to_github('https://api.github.com/repos/org/repo/tags', {'status': 304})
    self.respond_to_github('https://api.github.com/repos/org/repo/stats/participation', '{}')
    self.respond_to_github('https://raw.githubusercontent.com/org/repo/master/bower.json', '{}')

    response = self.app.get(util.update_library_task('org/repo'), headers={'X-AppEngine-QueueName': 'default'})
    self.assertEqual(response.status_int, 200)

    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual([
        util.ingest_analysis_task('org', 'repo', 'v3.0.0'),
        util.ingest_version_task('org', 'repo', 'v3.0.0'),
    ], [task.url for task in tasks])

  def test_update_triggers_version_deletion(self):
    library_key = Library(id='org/repo', spdx_identifier='MIT').put()
    Version(id='v0.1.0', parent=library_key, sha="old", status=Status.ready).put()
    Version(id='v1.0.0', parent=library_key, sha="old", status=Status.ready).put()
    Version(id='v2.0.0', parent=library_key, sha="old", status=Status.ready).put()
    VersionCache.update(library_key)

    self.respond_to_github('https://api.github.com/repos/org/repo', '{"owner":{"login":"org"},"name":"repo", "license": {"spdx_id": "MIT"}}')
    self.respond_to_github('https://api.github.com/repos/org/repo/contributors', {'status': 304})
    self.respond_to_github('https://api.github.com/repos/org/repo/tags', """[
        {"name": "v1.0.0", "commit": {"sha": "old"}},
        {"name": "v2.0.0", "commit": {"sha": "old"}}
    ]""")
    self.respond_to_github('https://api.github.com/repos/org/repo/stats/participation', '{}')
    self.respond_to_github('https://raw.githubusercontent.com/org/repo/master/bower.json', '{}')

    response = self.app.get(util.update_library_task('org/repo'), headers={'X-AppEngine-QueueName': 'default'})
    self.assertEqual(response.status_int, 200)

    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual([
        util.delete_version_task('org', 'repo', 'v0.1.0'),
    ], [task.url for task in tasks])

  def test_subsequent_update_triggers_version_deletion(self):
    library_key = Library(id='org/repo', spdx_identifier='MIT', tag_map='{"v1.0.0":"old","v2.0.0":"old"}').put()
    Version(id='v0.1.0', parent=library_key, sha="old", status=Status.ready).put()
    Version(id='v1.0.0', parent=library_key, sha="old", status=Status.ready).put()
    Version(id='v2.0.0', parent=library_key, sha="old", status=Status.ready).put()
    VersionCache.update(library_key)

    self.respond_to_github('https://api.github.com/repos/org/repo', '{"owner":{"login":"org"},"name":"repo", "license": {"spdx_id": "MIT"}}')
    self.respond_to_github('https://api.github.com/repos/org/repo/contributors', {'status': 304})
    self.respond_to_github('https://api.github.com/repos/org/repo/tags', {'status': 304})
    self.respond_to_github('https://api.github.com/repos/org/repo/stats/participation', '{}')
    self.respond_to_github('https://raw.githubusercontent.com/org/repo/master/bower.json', '{}')

    response = self.app.get(util.update_library_task('org/repo'), headers={'X-AppEngine-QueueName': 'default'})
    self.assertEqual(response.status_int, 200)

    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual([
        util.delete_version_task('org', 'repo', 'v0.1.0'),
    ], [task.url for task in tasks])

  def test_update_collection(self):
    library_key = Library(id='org/repo', tags=['v0.0.1'], collection_sequence_number=1, kind='collection', spdx_identifier='MIT').put()
    Version(id='v0.0.1', parent=library_key, sha="old", status=Status.ready).put()

    self.respond_to_github('https://api.github.com/repos/org/repo', '{"owner":{"login":"org"},"name":"repo", "license": {"spdx_id": "MIT"}}')
    self.respond_to_github('https://api.github.com/repos/org/repo/contributors', {'status': 304})
    self.respond_to_github('https://api.github.com/repos/org/repo/stats/participation', '{}')
    self.respond_to_github('https://raw.githubusercontent.com/org/repo/master/bower.json', '{"keywords": ["element-collection"]}')
    self.respond_to_github('https://api.github.com/repos/org/repo/git/refs/heads/master', """{
      "ref": "refs/heads/master",
      "object": {"sha": "new-master-sha"}
    }""")

    response = self.app.get(util.update_library_task('org/repo'), headers={'X-AppEngine-QueueName': 'default'})
    self.assertEqual(response.status_int, 200)
    library = library_key.get()
    self.assertEqual(library.error, None)
    self.assertEqual(library.status, Status.ready)

    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual([
        util.ingest_analysis_task('org', 'repo', 'v0.0.2', 'new-master-sha'),
        util.ingest_version_task('org', 'repo', 'v0.0.2'),
    ], [task.url for task in tasks])

    version = Version.get_by_id('v0.0.2', parent=library_key)
    self.assertEqual(version.sha, 'new-master-sha')
    self.assertEqual(version.status, Status.pending)

  def test_update_element_license(self):
    library_key = Library(id='org/repo', tag_map='{"v1.0.0":"old"}', spdx_identifier='MIT').put()
    Version(id='v1.0.0', parent=library_key, sha='old', status=Status.ready).put()
    VersionCache.update(library_key)

    self.respond_to_github('https://api.github.com/repos/org/repo', '{"owner":{"login":"org"},"name":"repo", "license": {"spdx_id": "Apache-2.0"}}')
    self.respond_to_github('https://api.github.com/repos/org/repo/contributors', {'status': 304})
    self.respond_to_github('https://api.github.com/repos/org/repo/tags', {'status': 304})
    self.respond_to_github('https://api.github.com/repos/org/repo/stats/participation', '{}')
    self.respond_to_github('https://raw.githubusercontent.com/org/repo/master/bower.json', '{}')

    response = self.app.get(util.update_library_task('org/repo'), headers={'X-AppEngine-QueueName': 'default'})
    self.assertEqual(response.status_int, 200)

    library = library_key.get()
    self.assertEqual(library.error, None)
    self.assertEqual(library.status, Status.ready)
    self.assertEqual(library.spdx_identifier, 'Apache-2.0')

    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual([], tasks)

  def test_update_element_null_license(self):
    library_key = Library(id='org/repo', tag_map='{"v1.0.0":"old"}', spdx_identifier='MIT').put()
    Version(id='v1.0.0', parent=library_key, sha='old', status=Status.ready).put()
    VersionCache.update(library_key)

    self.respond_to_github('https://api.github.com/repos/org/repo', '{"owner":{"login":"org"},"name":"repo", "license": {"spdx_id": null}}')
    self.respond_to_github('https://api.github.com/repos/org/repo/contributors', {'status': 304})
    self.respond_to_github('https://api.github.com/repos/org/repo/tags', {'status': 304})
    self.respond_to_github('https://api.github.com/repos/org/repo/stats/participation', '{}')
    self.respond_to_github('https://raw.githubusercontent.com/org/repo/master/bower.json', '{"license": "MIT"}')

    response = self.app.get(util.update_library_task('org/repo'), headers={'X-AppEngine-QueueName': 'default'})
    self.assertEqual(response.status_int, 200)

    library = library_key.get()
    self.assertEqual(library.error, None)
    self.assertEqual(library.status, Status.ready)
    self.assertEqual(library.spdx_identifier, 'MIT')

    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual([], tasks)

class AuthorTest(ManageTestBase):
  def test_ingest_author(self):
    metadata = '{HI}'
    self.respond_to_github('https://api.github.com/users/name', metadata)
    response = self.app.get(util.ingest_author_task('NAME'), headers={'X-AppEngine-QueueName': 'default'})
    self.assertEqual(response.status_int, 200)

    author = Author.get_by_id('name')
    self.assertIsNone(author.error)
    self.assertEqual(author.status, 'ready')
    self.assertEqual(author.metadata, metadata)

  def test_delete_missing_author(self):
    author = Author(id='test')
    author.put()
    self.respond_to_github('https://api.github.com/users/test', {'status': 404})
    response = self.app.get(util.update_author_task('TEST'), headers={'X-AppEngine-QueueName': 'default'})
    self.assertEqual(response.status_int, 200)

    author = Author.get_by_id('test')
    self.assertIsNone(author)

  def test_update_suppressed_is_noop(self):
    author = Author(id='test', status=Status.suppressed)
    author.put()
    response = self.app.get('/task/update/test', headers={'X-AppEngine-QueueName': 'default'})
    self.assertEqual(response.status_int, 200)
    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual(len(tasks), 0)

    author = author.key.get()
    self.assertEqual(author.status, Status.suppressed)

class AddTest(ManageTestBase):
  def test_add(self):
    token = self.app.get('/manage/token').normal_body
    response = self.app.get('/manage/add/org/repo', params={'token': token})
    self.assertEqual(response.status_int, 200)
    self.assertEqual(response.normal_body, 'OK')

    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual(len(tasks), 1)
    self.assertEqual(tasks[0].url, util.ingest_library_task('org', 'repo'))

  def test_add_scope(self):
    token = self.app.get('/manage/token').normal_body
    response = self.app.get('/manage/add/@scope/package', params={'token': token})
    self.assertEqual(response.status_int, 200)
    self.assertEqual(response.normal_body, 'OK')

    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual(len(tasks), 1)
    self.assertEqual(tasks[0].url, util.ingest_library_task('@scope', 'package'))

  def test_add_no_scope(self):
    token = self.app.get('/manage/token').normal_body
    response = self.app.get('/manage/add/@@npm/package', params={'token': token})
    self.assertEqual(response.status_int, 200)
    self.assertEqual(response.normal_body, 'OK')

    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual(len(tasks), 1)
    self.assertEqual(tasks[0].url, util.ingest_library_task('@@npm', 'package'))

class IngestLibraryTest(ManageTestBase):
  def test_ingest_element(self):
    self.respond_to_github('https://raw.githubusercontent.com/org/repo/master/bower.json', '{"license": "MIT"}')
    self.respond_to_github('https://api.github.com/repos/org/repo', '{"owner":{"login":"org"},"name":"repo"}')
    self.respond_to_github('https://api.github.com/repos/org/repo/contributors', '["a"]')
    self.respond_to_github('https://api.github.com/repos/org/repo/tags', '''[{"name": "v0.5.0", "commit": {"sha": "old"}},{"name": "v1.0.0", "commit": {"sha": "lol"}}]''')
    self.respond_to_github('https://api.github.com/repos/org/repo/stats/participation', '{}')
    response = self.app.get(util.ingest_library_task('org', 'repo'), headers={'X-AppEngine-QueueName': 'default'})

    self.assertEqual(response.status_int, 200)
    library = Library.get_by_id('org/repo')
    self.assertIsNotNone(library)
    self.assertIsNone(library.error)
    self.assertEqual(library.metadata, '{"owner":{"login":"org"},"name":"repo"}')
    self.assertEqual(library.contributors, '["a"]')
    self.assertEqual(library.tags, ['v0.5.0', 'v1.0.0'])

    version = ndb.Key(Library, 'org/repo', Version, 'v1.0.0').get()
    self.assertIsNotNone(version)
    self.assertIsNone(version.error)
    self.assertEqual(version.sha, 'lol')

    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual([
        util.ingest_analysis_task('org', 'repo', 'v1.0.0'),
        util.ensure_author_task('org'),
        util.ingest_version_task('org', 'repo', 'v1.0.0'),
    ], [task.url for task in tasks])

  def test_ingest_element_no_versions(self):
    self.respond_to_github('https://raw.githubusercontent.com/org/repo/master/bower.json', '{"license": "MIT"}')
    self.respond_to_github('https://api.github.com/repos/org/repo', '{"owner":{"login":"org"},"name":"repo"}')
    self.respond_to_github('https://api.github.com/repos/org/repo/contributors', '["a"]')
    self.respond_to_github('https://api.github.com/repos/org/repo/tags', '''[]''')
    self.respond_to_github('https://api.github.com/repos/org/repo/stats/participation', '{}')
    response = self.app.get(util.ingest_library_task('org', 'repo'), headers={'X-AppEngine-QueueName': 'default'})

    self.assertEqual(response.status_int, 200)
    library = Library.get_by_id('org/repo')
    self.assertIsNotNone(library)
    self.assertIsNotNone(library.error)
    self.assertIsNotNone(json.loads(library.error).get('code', None))

    self.assertEqual(library.metadata, '{"owner":{"login":"org"},"name":"repo"}')
    self.assertEqual(library.contributors, '["a"]')
    self.assertEqual(library.tags, [])

    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual([
        util.ensure_author_task('org'),
    ], [task.url for task in tasks])


  def test_ingest_collection(self):
    self.respond_to_github('https://raw.githubusercontent.com/org/repo/master/bower.json', '{"keywords": ["element-collection"], "license": "MIT"}')
    self.respond_to_github('https://api.github.com/repos/org/repo', '{"owner":{"login":"org"},"name":"repo"}')
    self.respond_to_github('https://api.github.com/repos/org/repo/contributors', '["a"]')
    self.respond_to_github('https://api.github.com/repos/org/repo/git/refs/heads/master', '{"ref": "refs/heads/master", "object": {"sha": "master-sha"}}')
    self.respond_to_github('https://api.github.com/repos/org/repo/stats/participation', '{}')
    response = self.app.get(util.ingest_library_task('org', 'repo'), headers={'X-AppEngine-QueueName': 'default'})

    self.assertEqual(response.status_int, 200)
    library = Library.get_by_id('org/repo')
    self.assertIsNotNone(library)
    self.assertIsNone(library.error)
    self.assertEqual(library.metadata, '{"owner":{"login":"org"},"name":"repo"}')
    self.assertEqual(library.contributors, '["a"]')
    self.assertEqual(library.tags, ['v0.0.1'])

    version = ndb.Key(Library, 'org/repo', Version, 'v0.0.1').get()
    self.assertIsNone(version.error)
    self.assertEqual(version.status, Status.pending)
    self.assertEqual(version.sha, 'master-sha')

    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual([
        util.ingest_analysis_task('org', 'repo', 'v0.0.1', 'master-sha'),
        util.ensure_author_task('org'),
        util.ingest_version_task('org', 'repo', 'v0.0.1'),
    ], [task.url for task in tasks])

  def test_github_error_fails_gracefully(self):
    self.respond_to_github('https://api.github.com/repos/org/repo', {'status': '500'})
    response = self.app.get(util.ingest_library_task('org', 'repo'), headers={'X-AppEngine-QueueName': 'default'}, status=502)
    self.assertEqual(response.status_int, 502)

  def test_ingest_version(self):
    library_key = Library(id='org/repo', metadata='{"full_name": "NSS Bob", "stargazers_count": 420, "subscribers_count": 419, "forks": 418, "updated_at": "2011-8-10T13:47:12Z"}').put()
    Version(id='v1.0.0', parent=library_key, sha='sha').put()

    self.respond_to_github(r'https://api.github.com/repos/org/repo/readme\?ref=sha', '{"content":"%s"}' % b64encode('README'))
    self.respond_to('https://raw.githubusercontent.com/org/repo/sha/bower.json', '{}')
    self.respond_to_github('https://api.github.com/markdown', '<html>README</html>')

    response = self.app.get(util.ingest_version_task('org', 'repo', 'v1.0.0'), headers={'X-AppEngine-QueueName': 'default'})
    self.assertEqual(response.status_int, 200)

    version = Version.get_by_id('v1.0.0', parent=library_key)
    self.assertIsNone(version.error)
    self.assertEqual(version.status, Status.ready)
    self.assertFalse(version.preview)

    versions = Library.versions_for_key_async(library_key).get_result()
    self.assertEqual(['v1.0.0'], versions)

    readme = ndb.Key(Library, 'org/repo', Version, 'v1.0.0', Content, 'readme').get()
    self.assertEqual(readme.content, 'README')
    readme_html = ndb.Key(Library, 'org/repo', Version, 'v1.0.0', Content, 'readme.html').get()
    self.assertEqual(readme_html.content, '<html>README</html>')
    bower = ndb.Key(Library, 'org/repo', Version, 'v1.0.0', Content, 'bower').get()
    self.assertEqual(bower.get_json(), {})

  def test_ingest_version_npm(self):
    library_key = Library(id='@scope/package', metadata='{"full_name": "NSS Bob", "stargazers_count": 420, "subscribers_count": 419, "forks": 418, "updated_at": "2011-8-10T13:47:12Z"}').put()
    Version(id='1.0.0', parent=library_key, sha='sha').put()

    self.respond_to('https://registry.npmjs.org/@scope%2fpackage', '{"versions": {"1.0.0": {"readme": "readme as markdown"}}}')
    self.respond_to_github('https://api.github.com/markdown', '<html>Converted readme</html>')

    response = self.app.get(util.ingest_version_task('@scope', 'package', '1.0.0'), headers={'X-AppEngine-QueueName': 'default'})
    self.assertEqual(response.status_int, 200)

    version = Version.get_by_id('1.0.0', parent=library_key)
    self.assertIsNone(version.error)
    self.assertEqual(version.status, Status.ready)
    self.assertFalse(version.preview)

    versions = Library.versions_for_key_async(library_key).get_result()
    self.assertEqual(['1.0.0'], versions)

    readme = ndb.Key(Library, '@scope/package', Version, '1.0.0', Content, 'readme').get()
    self.assertEqual(readme.content, 'readme as markdown')
    readme_html = ndb.Key(Library, '@scope/package', Version, '1.0.0', Content, 'readme.html').get()
    self.assertEqual(readme_html.content, '<html>Converted readme</html>')

  def test_ingest_preview(self):
    self.respond_to_github('https://api.github.com/repos/org/repo', '{"owner":{"login":"org"},"name":"repo"}')
    self.respond_to_github('https://api.github.com/repos/org/repo/contributors', '["a"]')
    self.respond_to_github('https://api.github.com/repos/org/repo/stats/participation', '{}')
    self.respond_to_github('https://raw.githubusercontent.com/org/repo/master/bower.json', '{"license": "MIT"}')
    response = self.app.get(util.ingest_preview_task('org', 'repo'), params={'commit': 'commit-sha', 'url': 'url'}, headers={'X-AppEngine-QueueName': 'default'})
    self.assertEqual(response.status_int, 200)

    library = Library.get_by_id('org/repo')
    self.assertIsNotNone(library)
    self.assertIsNone(library.error)
    self.assertTrue(library.shallow_ingestion)

    version = Version.get_by_id('commit-sha', parent=library.key)
    self.assertEquals(version.status, Status.pending)
    self.assertEquals(version.sha, 'commit-sha')
    self.assertEquals(version.url, 'url')
    self.assertTrue(version.preview)

    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual(len(tasks), 2)
    self.assertEqual([
        util.ingest_analysis_task('org', 'repo', 'commit-sha'),
        util.ingest_version_task('org', 'repo', 'commit-sha'),
    ], [task.url for task in tasks])

  def test_ingest_license_fallback(self):
    self.respond_to_github('https://api.github.com/repos/org/repo', '{"owner":{"login":"org"},"name":"repo"}')
    self.respond_to_github('https://api.github.com/repos/org/repo/contributors', '["a"]')
    self.respond_to_github('https://api.github.com/repos/org/repo/stats/participation', '{}')
    self.respond_to_github('https://raw.githubusercontent.com/org/repo/master/bower.json', '{"license": "MIT"}')
    self.respond_to_github('https://api.github.com/repos/org/repo/tags', '[{"name": "v1.0.0", "commit": {"sha": "lol"}}]')
    response = self.app.get(util.ingest_library_task('org', 'repo'), headers={'X-AppEngine-QueueName': 'default'})

    self.assertEqual(response.status_int, 200)
    library = Library.get_by_id('org/repo')
    self.assertIsNotNone(library)
    self.assertIsNone(library.error)
    self.assertEqual(library.status, Status.ready)
    self.assertEqual(library.spdx_identifier, 'MIT')

  def test_ingest_license_object(self):
    self.respond_to_github('https://api.github.com/repos/org/repo', '{"owner":{"login":"org"},"name":"repo", "license": {"spdx_id": "MIT"}}')
    self.respond_to_github('https://api.github.com/repos/org/repo/contributors', '["a"]')
    self.respond_to_github('https://api.github.com/repos/org/repo/stats/participation', '{}')
    self.respond_to_github('https://raw.githubusercontent.com/org/repo/master/bower.json', '{}')
    self.respond_to_github('https://api.github.com/repos/org/repo/tags', '[{"name": "v1.0.0", "commit": {"sha": "lol"}}]')
    response = self.app.get(util.ingest_library_task('org', 'repo'), headers={'X-AppEngine-QueueName': 'default'})

    self.assertEqual(response.status_int, 200)
    library = Library.get_by_id('org/repo')
    self.assertIsNotNone(library)
    self.assertIsNone(library.error)
    self.assertEqual(library.status, Status.ready)
    self.assertEqual(library.spdx_identifier, 'MIT')

  def test_ingest_bad_license(self):
    self.respond_to_github('https://api.github.com/repos/org/repo', '{"license": {"key": "INVALID"}, "owner":{"login":"org"},"name":"repo"}')
    self.respond_to_github('https://api.github.com/repos/org/repo/contributors', '["a"]')
    self.respond_to_github('https://api.github.com/repos/org/repo/stats/participation', '{}')
    self.respond_to_github('https://raw.githubusercontent.com/org/repo/master/bower.json', '{}')
    response = self.app.get(util.ingest_library_task('org', 'repo'), headers={'X-AppEngine-QueueName': 'default'})

    self.assertEqual(response.status_int, 200)
    library = Library.get_by_id('org/repo')
    self.assertIsNotNone(library)
    self.assertIsNotNone(library.error)
    self.assertEqual(library.status, Status.error)

  def test_ingest_no_license(self):
    self.respond_to_github('https://api.github.com/repos/org/repo', '{"license": null, "owner":{"login":"org"},"name":"repo"}')
    self.respond_to_github('https://api.github.com/repos/org/repo/contributors', '["a"]')
    self.respond_to_github('https://api.github.com/repos/org/repo/stats/participation', '{}')
    self.respond_to_github('https://raw.githubusercontent.com/org/repo/master/bower.json', '{}')
    response = self.app.get(util.ingest_library_task('org', 'repo'), headers={'X-AppEngine-QueueName': 'default'})

    self.assertEqual(response.status_int, 200)
    library = Library.get_by_id('org/repo')
    self.assertIsNotNone(library)
    self.assertIsNotNone(library.error)
    self.assertEqual(library.status, Status.error)

  def test_ingest_version_pages(self):
    library_key = Library(id='org/repo', metadata='{"full_name": "NSS Bob", "stargazers_count": 420, "subscribers_count": 419, "forks": 418, "updated_at": "2011-8-10T13:47:12Z"}').put()
    Version(id='v1.0.0', parent=library_key, sha='sha').put()

    self.respond_to_github(r'https://api.github.com/repos/org/repo/readme\?ref=sha', '{"content":"%s"}' % b64encode('README'))
    self.respond_to('https://raw.githubusercontent.com/org/repo/sha/bower.json', '{"pages":{"custom doc":"doc.md"}}')
    self.respond_to_github('https://api.github.com/markdown', '<html>README</html>')
    self.respond_to_github(r'https://api.github.com/repos/org/repo/contents/doc.md\?ref=sha', '{"content":"%s", "type":"file"}' % b64encode('doc.md'))
    self.respond_to_github('https://api.github.com/markdown', '<html>doc.md</html>')

    response = self.app.get(util.ingest_version_task('org', 'repo', 'v1.0.0'), headers={'X-AppEngine-QueueName': 'default'})
    self.assertEqual(response.status_int, 200)

    page = ndb.Key(Library, 'org/repo', Version, 'v1.0.0', Content, 'page-doc.md').get()
    self.assertEqual(page.content, '<html>doc.md</html>')

class IngestNPMLibraryTest(ManageTestBase):
  def test_ingest_element(self):
    self.respond_to('https://registry.npmjs.org/@scope%2fpackage', '{"repository": {"url": "git+https://github.com/org/repo.git"}, "license": "BSD-3-Clause", "versions": {"1.0.0": {"gitHead": "lol"}}}')
    self.respond_to_github('https://api.github.com/repos/org/repo', '{"owner":{"login":"org"},"name":"repo"}')
    self.respond_to_github('https://api.github.com/repos/org/repo/contributors', '["a"]')
    self.respond_to_github('https://api.github.com/repos/org/repo/stats/participation', '{}')
    response = self.app.get(util.ingest_library_task('@scope', 'package'), headers={'X-AppEngine-QueueName': 'default'})

    self.assertEqual(response.status_int, 200)
    library = Library.get_by_id('@scope/package')
    self.assertIsNotNone(library)
    self.assertIsNone(library.error)
    self.assertEqual(library.metadata, '{"owner":{"login":"org"},"name":"repo"}')
    self.assertEqual(library.contributors, '["a"]')
    self.assertEqual(library.tags, ['1.0.0'])

    version = ndb.Key(Library, '@scope/package', Version, '1.0.0').get()
    self.assertIsNotNone(version)
    self.assertIsNone(version.error)
    self.assertEqual(version.sha, 'lol')

    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual([
        util.ingest_analysis_task('@scope', 'package', '1.0.0'),
        util.migrate_library_task('org', 'repo', '@scope', 'package'),
        util.ensure_author_task('org'),
        util.ingest_version_task('@scope', 'package', '1.0.0'),
    ], [task.url for task in tasks])

  def test_ingest_no_package(self):
    self.respond_to('https://registry.npmjs.org/nopackage', {'status': 404})
    response = self.app.get(util.ingest_library_task('@@npm', 'nopackage'), headers={'X-AppEngine-QueueName': 'default'})

    self.assertEqual(response.status_int, 200)
    library = Library.get_by_id('@@npm/nopackage')
    self.assertIsNotNone(library)
    self.assertIsNotNone(library.error)

    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual(len(tasks), 0)

  def test_ingest_repository_shorthand(self):
    self.respond_to('https://registry.npmjs.org/package', '{"repository": "org/repo", "license": "BSD-3-Clause", "versions": {"1.0.0": {"gitHead": "lol"}, "0.5.0": {"gitHead": "sha"}}}')
    self.respond_to_github('https://api.github.com/repos/org/repo', '{"owner":{"login":"org"},"name":"repo"}')
    self.respond_to_github('https://api.github.com/repos/org/repo/contributors', '["a"]')
    self.respond_to_github('https://api.github.com/repos/org/repo/stats/participation', '{}')
    response = self.app.get(util.ingest_library_task('@@npm', 'package'), headers={'X-AppEngine-QueueName': 'default'})

    self.assertEqual(response.status_int, 200)
    library = Library.get_by_id('@@npm/package')
    self.assertIsNotNone(library)
    self.assertIsNone(library.error)
    self.assertEqual(library.metadata, '{"owner":{"login":"org"},"name":"repo"}')
    self.assertEqual(library.contributors, '["a"]')
    self.assertEqual(library.tags, ['0.5.0', '1.0.0'])

    version = ndb.Key(Library, '@@npm/package', Version, '1.0.0').get()
    self.assertIsNotNone(version)
    self.assertIsNone(version.error)
    self.assertEqual(version.sha, 'lol')

    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual([
        util.ingest_analysis_task('@@npm', 'package', '1.0.0'),
        util.migrate_library_task('org', 'repo', '@@npm', 'package'),
        util.ensure_author_task('org'),
        util.ingest_version_task('@@npm', 'package', '1.0.0'),
    ], [task.url for task in tasks])

  def test_ingest_npm_deletes_bower(self):
    bower_library_key = Library(id='org/repo', spdx_identifier='MIT').put()
    Version(id='v0.1.0', parent=bower_library_key, sha='sha', status=Status.ready).put()
    Version(id='v1.0.0', parent=bower_library_key, sha='sha', status=Status.ready).put()

    self.respond_to('https://registry.npmjs.org/@scope%2fpackage', '{"repository": {"url": "git+https://github.com/org/repo.git"}, "license": "BSD-3-Clause", "versions": {"1.0.0": {"gitHead": "lol"}}}')
    self.respond_to_github('https://api.github.com/repos/org/repo', '{"owner":{"login":"org"},"name":"repo"}')
    self.respond_to_github('https://api.github.com/repos/org/repo/contributors', '["a"]')
    self.respond_to_github('https://api.github.com/repos/org/repo/stats/participation', '{}')
    response = self.app.get(util.ingest_library_task('@scope', 'package'), headers={'X-AppEngine-QueueName': 'default'})

    self.assertEqual(response.status_int, 200)
    library = Library.get_by_id('@scope/package')
    self.assertIsNotNone(library)
    self.assertIsNone(library.error)
    self.assertEqual(library.metadata, '{"owner":{"login":"org"},"name":"repo"}')
    self.assertEqual(library.contributors, '["a"]')
    self.assertEqual(library.tags, ['1.0.0'])
    self.assertTrue(library.migrated_from_bower)

    version = ndb.Key(Library, '@scope/package', Version, '1.0.0').get()
    self.assertIsNotNone(version)
    self.assertIsNone(version.error)
    self.assertEqual(version.sha, 'lol')

    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual([
        util.ingest_analysis_task('@scope', 'package', '1.0.0'),
        util.migrate_library_task('org', 'repo', '@scope', 'package'),
        util.ensure_author_task('org'),
        util.ingest_version_task('@scope', 'package', '1.0.0'),
    ], [task.url for task in tasks])

    response = self.app.get(util.migrate_library_task('org', 'repo', '@scope', 'package'), headers={'X-AppEngine-QueueName': 'default'})
    self.assertEqual(response.status_int, 200)
    library = Library.get_by_id('org/repo')
    self.assertTrue(library.npm_package, '@scope/package')

class UpdateIndexesTest(ManageTestBase):
  def test_update_indexes(self):
    metadata = """{
      "full_name": "full-name"
    }"""
    collection_library_key = Library(id='my/collection', status=Status.ready, kind='collection', metadata=metadata).put()
    collection_version_key = Version(id='v1.0.0', parent=collection_library_key, sha='sha', status=Status.ready).put()
    Content(id='bower', parent=collection_version_key, content="""{"dependencies": {
      "a": "org/element-1#1.0.0",
      "b": "org/element-2#1.0.0"
    }}""").put()
    VersionCache.update(collection_library_key)

    response = self.app.get(util.update_indexes_task('my', 'collection'), headers={'X-AppEngine-QueueName': 'default'})
    self.assertEqual(response.status_int, 200)

    # Triggers ingestions
    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual([
        util.ensure_library_task('org', 'element-1'),
        util.ensure_library_task('org', 'element-2'),
    ], [task.url for task in tasks])

    # Ensures collection references
    ref1 = CollectionReference.get_by_id(id="my/collection/v1.0.0", parent=ndb.Key(Library, "org/element-1"))
    self.assertIsNotNone(ref1)

    ref2 = CollectionReference.get_by_id(id="my/collection/v1.0.0", parent=ndb.Key(Library, "org/element-2"))
    self.assertIsNotNone(ref2)

    # Validate search index
    index = search.Index('repo')
    document = index.get('my/collection')
    self.assertIsNotNone(document)
    self.assertTrue(len(document.fields) > 0)

  def test_hydrolysis_index(self):
    metadata = """{
      "full_name": "full-name"
    }"""
    library_key = Library(id='owner/repo', metadata=metadata).put()
    version_key = Version(id='v1.1.1', parent=library_key, sha='sha', status='ready').put()

    content = Content(id='analysis', parent=version_key, status=Status.pending)
    data = {"elementsByTagName": {"my-element": "some data"}}
    content.json = data
    content.status = Status.ready
    content.put()

    VersionCache.update(library_key)

    response = self.app.get(util.update_indexes_task('owner', 'repo'), headers={'X-AppEngine-QueueName': 'default'})
    self.assertEqual(response.status_int, 200)

    index = search.Index('repo')
    document = index.get('owner/repo')
    self.assertIsNotNone(document)
    self.assertTrue(len(document.fields) > 0)

    elements = [field for field in document.fields if field.name == 'element']
    self.assertEqual(len(elements), 1)
    self.assertEqual(len(elements[0].value.split(' ')), 1)

  def test_analyzer_index(self):
    metadata = """{
      "full_name": "full-name"
    }"""
    library_key = Library(id='owner/repo', metadata=metadata).put()
    version_key = Version(id='v1.1.1', parent=library_key, sha='sha', status='ready').put()

    content = Content(id='analysis', parent=version_key, status=Status.pending)
    data = {
        "analyzerData": {
            "elements": [{"tagname": "my-element"}, {"classname": "another-element"}],
            "metadata": {
                "polymer": {"behaviors": [{"name": "polymer-behavior"}]}
            }
        }
    }
    content.json = data
    content.status = Status.ready
    content.put()

    VersionCache.update(library_key)

    response = self.app.get(util.update_indexes_task('owner', 'repo'), headers={'X-AppEngine-QueueName': 'default'})
    self.assertEqual(response.status_int, 200)

    index = search.Index('repo')
    document = index.get('owner/repo')
    self.assertIsNotNone(document)
    self.assertTrue(len(document.fields) > 0)

    elements = [field for field in document.fields if field.name == 'element']
    self.assertEqual(len(elements), 1)
    self.assertEqual(len(elements[0].value.split(' ')), 2)

    behaviors = [field for field in document.fields if field.name == 'behavior']
    self.assertEqual(len(behaviors), 1)
    self.assertEqual(len(behaviors[0].value.split(' ')), 1)

  def test_analyzer_index_empty(self):
    metadata = """{
      "full_name": "full-name"
    }"""
    library_key = Library(id='owner/repo', metadata=metadata).put()
    version_key = Version(id='v1.1.1', parent=library_key, sha='sha', status='ready').put()

    content = Content(id='analysis', parent=version_key, status=Status.pending)
    data = {"analyzerData": {}}
    content.json = data
    content.status = Status.ready
    content.put()

    VersionCache.update(library_key)

    response = self.app.get(util.update_indexes_task('owner', 'repo'), headers={'X-AppEngine-QueueName': 'default'})
    self.assertEqual(response.status_int, 200)

    index = search.Index('repo')
    document = index.get('owner/repo')
    self.assertIsNotNone(document)
    self.assertTrue(len(document.fields) > 0)

    elements = [field for field in document.fields if field.name == 'element']
    self.assertEqual(len(elements), 0)

    behaviors = [field for field in document.fields if field.name == 'behavior']
    self.assertEqual(len(behaviors), 0)

  def test_npm_index(self):
    metadata = """{
      "full_name": "full-name"
    }"""
    registry_metadata = """{
      "description": "mydescription",
      "keywords": ["my-keyword"]
    }"""
    library_key = Library(id='@@npm/package', registry_metadata=registry_metadata, metadata=metadata).put()
    version_key = Version(id='v1.1.1', parent=library_key, sha='sha', status='ready').put()

    Content(id='bower', parent=version_key, content="""{"dependencies": {
      "a": "org/element-1#1.0.0",
      "b": "org/element-2#1.0.0"
    }}""").put()

    VersionCache.update(library_key)

    response = self.app.get(util.update_indexes_task('@@npm', 'package'), headers={'X-AppEngine-QueueName': 'default'})
    self.assertEqual(response.status_int, 200)

    index = search.Index('repo')
    document = index.get('@@npm/package')
    self.assertIsNotNone(document)
    self.assertTrue(len(document.fields) > 0)

    self.assertEqual(document.field('npm_keywords').value, 'my-keyword')
    self.assertEqual(document.field('npm_description').value, 'mydescription')

if __name__ == '__main__':
  unittest.main()
