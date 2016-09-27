import unittest
import webtest

from datamodel import Author, Library, Version, Content, Status, VersionCache, CollectionReference
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
    self.app.get('/manage/add/org/repo', status=403)
    self.app.get('/manage/analyze/owner/repo', status=403)
    self.app.get('/manage/delete/org/repo', status=403)
    self.app.get('/manage/delete_everything/yes_i_know_what_i_am_doing', status=403)
    self.app.get('/task/update/owner', status=403)
    self.app.get('/task/update/owner/repo', status=403)
    self.app.get('/task/ensure/owner', status=403)
    self.app.get('/task/ensure/owner/repo', status=403)
    self.app.get('/task/delete/owner/repo/version', status=403)
    self.app.get('/task/ingest/owner', status=403)
    self.app.get('/task/ingest/owner/repo', status=403)
    self.app.get('/task/ingest/owner/repo/version', status=403)
    self.app.get('/task/ingest-commit/owner/repo', status=403)
    self.app.get('/task/ingest-webhook/owner/repo', status=403)
    self.app.get('/task/update-indexes/owner/repo', status=403)

  def test_token_only_valid_once(self):
    token = self.app.get('/manage/token').normal_body
    self.app.get('/manage/update-all', status=200, params={'token': token})
    self.app.get('/manage/update-all', status=403, params={'token': token})

  def test_invalid_token(self):
    self.app.get('/manage/update-all', status=403, params={'token': 'hello'})

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
    Version(id='v1.1.1', parent=library_key, sha='sha', status='ready').put()

    response = self.app.get('/manage/analyze/owner/repo', headers={'X-AppEngine-QueueName': 'default'})
    self.assertEqual(response.status_int, 200)

    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual([
        util.ingest_analysis_task('owner', 'repo', 'v1.1.1'),
    ], [task.url for task in tasks])

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
  def test_update_respects_304(self):
    library = Library(id='org/repo', metadata_etag='a', contributors_etag='b', tags_etag='c', spdx_identifier='MIT')
    library.put()
    self.respond_to_github('https://api.github.com/repos/org/repo', {'status': 304})
    self.respond_to_github('https://api.github.com/repos/org/repo/contributors', {'status': 304})
    self.respond_to_github('https://api.github.com/repos/org/repo/tags', {'status': 304})
    self.respond_to_github('https://api.github.com/repos/org/repo/stats/participation', '{}')

    response = self.app.get('/task/update/org/repo', headers={'X-AppEngine-QueueName': 'default'})
    self.assertEqual(response.status_int, 200)
    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual(len(tasks), 0)

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

    self.respond_to_github('https://api.github.com/repos/org/repo', {'status': 304})
    self.respond_to_github('https://api.github.com/repos/org/repo/contributors', {'status': 304})
    self.respond_to_github('https://api.github.com/repos/org/repo/tags', """[
        {"name": "v1.0.0", "commit": {"sha": "new"}},
        {"name": "v2.0.0", "commit": {"sha": "old"}},
        {"name": "v3.0.0", "commit": {"sha": "new"}}
    ]""")
    self.respond_to_github('https://api.github.com/repos/org/repo/stats/participation', '{}')

    response = self.app.get(util.update_library_task('org/repo'), headers={'X-AppEngine-QueueName': 'default'})
    self.assertEqual(response.status_int, 200)

    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual([
        util.delete_task('org', 'repo', 'v0.1.0'),
        util.ingest_version_task('org', 'repo', 'v3.0.0'),
        util.ingest_analysis_task('org', 'repo', 'v3.0.0'),
        # We intentionally don't update tags that have changed to point to different commits.
    ], [task.url for task in tasks])

  def test_update_collection(self):
    library_key = Library(id='org/repo', tags=['v0.0.1'], collection_sequence_number=1, kind='collection', spdx_identifier='MIT').put()
    Version(id='v0.0.1', parent=library_key, sha="old", status=Status.ready).put()

    self.respond_to_github('https://api.github.com/repos/org/repo', {'status': 304})
    self.respond_to_github('https://api.github.com/repos/org/repo/contributors', {'status': 304})
    self.respond_to_github('https://api.github.com/repos/org/repo/stats/participation', '{}')
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
        util.delete_task('org', 'repo', 'v0.0.1'),
        util.ingest_version_task('org', 'repo', 'v0.0.2'),
        util.ingest_analysis_task('org', 'repo', 'v0.0.2', 'new-master-sha'),
    ], [task.url for task in tasks])

    version = Version.get_by_id('v0.0.2', parent=library_key)
    self.assertEqual(version.sha, 'new-master-sha')
    self.assertEqual(version.status, Status.pending)

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

class AddTest(ManageTestBase):
  def test_add(self):
    token = self.app.get('/manage/token').normal_body
    response = self.app.get('/manage/add/org/repo', params={'token': token})
    self.assertEqual(response.status_int, 200)
    self.assertEqual(response.normal_body, 'OK')

    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual(len(tasks), 1)
    self.assertEqual(tasks[0].url, util.ingest_library_task('org', 'repo'))

class IngestLibraryTest(ManageTestBase):
  def test_ingest_element(self):
    self.respond_to_github('https://raw.githubusercontent.com/org/repo/master/bower.json', '{"license": "MIT"}')
    self.respond_to_github('https://api.github.com/repos/org/repo', '{"metadata": "bits"}')
    self.respond_to_github('https://api.github.com/repos/org/repo/contributors', '["a"]')
    self.respond_to_github('https://api.github.com/repos/org/repo/tags', '[{"name": "v1.0.0", "commit": {"sha": "lol"}}]')
    self.respond_to_github('https://api.github.com/repos/org/repo/stats/participation', '{}')
    response = self.app.get(util.ingest_library_task('org', 'repo'), headers={'X-AppEngine-QueueName': 'default'})

    self.assertEqual(response.status_int, 200)
    library = Library.get_by_id('org/repo')
    self.assertIsNotNone(library)
    self.assertIsNone(library.error)
    self.assertEqual(library.metadata, '{"metadata": "bits"}')
    self.assertEqual(library.contributors, '["a"]')
    self.assertEqual(library.tags, ['v1.0.0'])

    version = ndb.Key(Library, 'org/repo', Version, 'v1.0.0').get()
    self.assertIsNone(version.error)
    self.assertEqual(version.sha, 'lol')

    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual([
        util.ingest_version_task('org', 'repo', 'v1.0.0'),
        util.ingest_analysis_task('org', 'repo', 'v1.0.0'),
        util.ensure_author_task('org'),
    ], [task.url for task in tasks])

  def test_ingest_collection(self):
    self.respond_to_github('https://raw.githubusercontent.com/org/repo/master/bower.json', '{"keywords": ["element-collection"], "license": "MIT"}')
    self.respond_to_github('https://api.github.com/repos/org/repo', '{"metadata": "bits"}')
    self.respond_to_github('https://api.github.com/repos/org/repo/contributors', '["a"]')
    self.respond_to_github('https://api.github.com/repos/org/repo/git/refs/heads/master', '{"ref": "refs/heads/master", "object": {"sha": "master-sha"}}')
    self.respond_to_github('https://api.github.com/repos/org/repo/stats/participation', '{}')
    response = self.app.get(util.ingest_library_task('org', 'repo'), headers={'X-AppEngine-QueueName': 'default'})

    self.assertEqual(response.status_int, 200)
    library = Library.get_by_id('org/repo')
    self.assertIsNotNone(library)
    self.assertIsNone(library.error)
    self.assertEqual(library.metadata, '{"metadata": "bits"}')
    self.assertEqual(library.contributors, '["a"]')
    self.assertEqual(library.tags, ['v0.0.1'])

    version = ndb.Key(Library, 'org/repo', Version, 'v0.0.1').get()
    self.assertIsNone(version.error)
    self.assertEqual(version.status, Status.pending)
    self.assertEqual(version.sha, 'master-sha')

    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual([
        util.ingest_version_task('org', 'repo', 'v0.0.1'),
        util.ingest_analysis_task('org', 'repo', 'v0.0.1', 'master-sha'),
        util.ensure_author_task('org'),
    ], [task.url for task in tasks])

  def test_github_error_fails_gracefully(self):
    self.respond_to_github('https://api.github.com/repos/org/repo', {'status': '500'})
    response = self.app.get(util.ingest_library_task('org', 'repo'), headers={'X-AppEngine-QueueName': 'default'}, status=502)
    self.assertEqual(response.status_int, 502)

  def test_ingest_version(self):
    library_key = Library(id='org/repo', metadata='{"full_name": "NSS Bob", "stargazers_count": 420, "subscribers_count": 419, "forks": 418, "updated_at": "2011-8-10T13:47:12Z"}').put()
    Version(id='v1.0.0', parent=library_key, sha='sha').put()

    self.respond_to('https://raw.githubusercontent.com/org/repo/sha/README.md', 'README')
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
    self.assertEqual(bower.content, '{}')

  def test_ingest_commit(self):
    self.respond_to_github('https://api.github.com/repos/org/repo', '{}')
    self.respond_to_github('https://api.github.com/repos/org/repo/contributors', '["a"]')
    self.respond_to_github('https://api.github.com/repos/org/repo/stats/participation', '{}')
    self.respond_to_github('https://raw.githubusercontent.com/org/repo/master/bower.json', '{"license": "MIT"}')
    response = self.app.get(util.ingest_commit_task('org', 'repo'), params={'commit': 'commit-sha', 'url': 'url'}, headers={'X-AppEngine-QueueName': 'default'})
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
        util.ingest_version_task('org', 'repo', 'commit-sha'),
        util.ingest_analysis_task('org', 'repo', 'commit-sha'),
    ], [task.url for task in tasks])

  def test_ingest_license_fallback(self):
    self.respond_to_github('https://api.github.com/repos/org/repo', '{}')
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

  def test_ingest_bad_license(self):
    self.respond_to_github('https://api.github.com/repos/org/repo', '{"license": {"key": "INVALID"}}')
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
    self.respond_to_github('https://api.github.com/repos/org/repo', '{"license": null}')
    self.respond_to_github('https://api.github.com/repos/org/repo/contributors', '["a"]')
    self.respond_to_github('https://api.github.com/repos/org/repo/stats/participation', '{}')
    self.respond_to_github('https://raw.githubusercontent.com/org/repo/master/bower.json', '{}')
    response = self.app.get(util.ingest_library_task('org', 'repo'), headers={'X-AppEngine-QueueName': 'default'})

    self.assertEqual(response.status_int, 200)
    library = Library.get_by_id('org/repo')
    self.assertIsNotNone(library)
    self.assertIsNotNone(library.error)
    self.assertEqual(library.status, Status.error)

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

    # TODO: Validate search index is updated correctly.

if __name__ == '__main__':
  unittest.main()
