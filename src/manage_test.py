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
    self.app.get('/manage/add/element/org/repo', status=403)
    self.app.get('/manage/delete/element/org', status=403)
    self.app.get('/manage/delete_everything/yes_i_know_what_i_am_doing', status=403)
    self.app.get('/task/update/owner', status=403)
    self.app.get('/task/update/owner/repo', status=403)
    self.app.get('/task/delete/owner/repo/version', status=403)
    self.app.get('/task/ingest/author/owner', status=403)
    self.app.get('/task/ingest/commit/owner/repo', status=403)
    self.app.get('/task/ingest/webhook/owner/repo', status=403)
    self.app.get('/task/ingest/library/owner/repo/kind', status=403)
    self.app.get('/task/update-indexes/owner/repo', status=403)
    self.app.get('/task/ingest/version/owner/repo/version', status=403)

  def test_token_only_valid_once(self):
    token = self.app.get('/manage/token').normal_body
    self.app.get('/manage/update-all', status=200, params={'token': token})
    self.app.get('/manage/update-all', status=403, params={'token': token})

  def test_invalid_token(self):
    self.app.get('/manage/update-all', status=403, params={'token': 'hello'})

class DeleteTest(ManageTestBase):
  def test_delete_version(self):
    library_key = ndb.Key(Library, 'owner/repo')
    version_key = Version(id='v1.0.0', parent=library_key, sha='1', status=Status.ready).put()
    VersionCache.update(library_key)

    response = self.app.get('/task/delete/owner/repo/v1.0.0', headers={'X-AppEngine-QueueName': 'default'})
    self.assertEqual(response.status_int, 200)
    version = version_key.get()
    self.assertIsNone(version)
    self.assertEqual(Library.versions_for_key_async(library_key).get_result(), [])

class ManageUpdateTest(ManageTestBase):
  def test_update_respects_304(self):
    library = Library(id='org/repo', metadata_etag='a', contributors_etag='b', tags_etag='c')
    library.put()
    self.respond_to_github('https://api.github.com/repos/org/repo', {'status': 304})
    self.respond_to_github('https://api.github.com/repos/org/repo/contributors', {'status': 304})
    self.respond_to_github('https://api.github.com/repos/org/repo/git/refs/tags', {'status': 304})
    self.respond_to_github('https://api.github.com/repos/org/repo/stats/participation', '{}')

    response = self.app.get('/task/update/org/repo', headers={'X-AppEngine-QueueName': 'default'})
    self.assertEqual(response.status_int, 200)
    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual(len(tasks), 0)

  def test_update_deletes_missing_repo(self):
    library = Library(id='org/repo', metadata_etag='a', contributors_etag='b', tags_etag='c')
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
    library_key = Library(id='org/repo', tags=['v0.1.0', 'v1.0.0', 'v2.0.0']).put()
    Version(id='v0.1.0', parent=library_key, sha="old", status=Status.ready).put()
    Version(id='v1.0.0', parent=library_key, sha="old", status=Status.ready).put()
    Version(id='v2.0.0', parent=library_key, sha="old", status=Status.ready).put()

    self.respond_to_github('https://api.github.com/repos/org/repo', {'status': 304})
    self.respond_to_github('https://api.github.com/repos/org/repo/contributors', {'status': 304})
    self.respond_to_github('https://api.github.com/repos/org/repo/git/refs/tags', """[
        {"ref": "refs/tags/v1.0.0", "object": {"sha": "new"}},
        {"ref": "refs/tags/v2.0.0", "object": {"sha": "old"}},
        {"ref": "refs/tags/v3.0.0", "object": {"sha": "new"}}
    ]""")
    self.respond_to_github('https://api.github.com/repos/org/repo/stats/participation', '{}')

    response = self.app.get('/task/update/org/repo', headers={'X-AppEngine-QueueName': 'default'})
    self.assertEqual(response.status_int, 200)

    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual([
        util.delete_task('org', 'repo', 'v0.1.0'),
        util.ingest_version_task('org', 'repo', 'v3.0.0') + '?sha=new',
        # We intentionally don't update tags that have changed to point to different commits.
    ], [task.url for task in tasks])

class ManageAuthorTest(ManageTestBase):
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

class ManageAddTest(ManageTestBase):
  def test_add_element(self):
    token = self.app.get('/manage/token').normal_body
    response = self.app.get('/manage/add/element/org/repo', params={'token': token})
    self.assertEqual(response.status_int, 200)
    self.assertEqual(response.normal_body, 'OK')

    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual(len(tasks), 1)
    self.assertEqual(tasks[0].url, util.ingest_library_task('org', 'repo', 'element'))

  def test_ingest_library(self):
    self.respond_to_github('https://api.github.com/repos/org/repo', '{"metadata": "bits"}')
    self.respond_to_github('https://api.github.com/repos/org/repo/contributors', '["a"]')
    self.respond_to_github('https://api.github.com/repos/org/repo/git/refs/tags', '[{"ref": "refs/tags/v1.0.0", "object": {"sha": "lol"}}]')
    self.respond_to_github('https://api.github.com/repos/org/repo/stats/participation', '{}')
    response = self.app.get(util.ingest_library_task('org', 'repo', 'element'), headers={'X-AppEngine-QueueName': 'default'})

    self.assertEqual(response.status_int, 200)
    library = Library.get_by_id('org/repo')
    self.assertIsNotNone(library)
    self.assertIsNone(library.error)
    self.assertEqual(library.kind, 'element')
    self.assertEqual(library.metadata, '{"metadata": "bits"}')
    self.assertEqual(library.contributors, '["a"]')
    self.assertEqual(library.tags, ['v1.0.0'])

    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual([
        util.ingest_version_task('org', 'repo', 'v1.0.0') + '?sha=lol',
        util.ingest_author_task('org'),
    ], [task.url for task in tasks])

  def test_github_error_fails_gracefully(self):
    self.respond_to_github('https://api.github.com/repos/org/repo', {'status': '500'})
    response = self.app.get(util.ingest_library_task('org', 'repo', 'element'), headers={'X-AppEngine-QueueName': 'default'}, status=502)
    self.assertEqual(response.status_int, 502)

  def test_ingest_version(self):
    library = Library(id='org/repo', metadata='{"full_name": "NSS Bob", "stargazers_count": 420, "subscribers_count": 419, "forks": 418, "updated_at": "2011-8-10T13:47:12Z"}')
    library.put()

    self.respond_to('https://raw.githubusercontent.com/org/repo/v1.0.0/README.md', 'README')
    self.respond_to('https://raw.githubusercontent.com/org/repo/v1.0.0/bower.json', '{}')
    self.respond_to_github('https://api.github.com/markdown', '<html>README</html>')

    response = self.app.get(util.ingest_version_task('org', 'repo', 'v1.0.0'), params={'latestVersion': 'True', 'sha': 'lol'}, headers={'X-AppEngine-QueueName': 'default'})
    self.assertEqual(response.status_int, 200)

    version = Version.get_by_id('v1.0.0', parent=library.key)
    self.assertIsNone(version.error)
    self.assertEqual(version.status, Status.ready)

    versions = Library.versions_for_key_async(library.key).get_result()
    self.assertEqual(['v1.0.0'], versions)

    readme = ndb.Key(Library, 'org/repo', Version, 'v1.0.0', Content, 'readme').get()
    self.assertEqual(readme.content, 'README')
    readme_html = ndb.Key(Library, 'org/repo', Version, 'v1.0.0', Content, 'readme.html').get()
    self.assertEqual(readme_html.content, '<html>README</html>')
    bower = ndb.Key(Library, 'org/repo', Version, 'v1.0.0', Content, 'bower').get()
    self.assertEqual(bower.content, '{}')

  def fix_test_ingest_version_falls_back(self):
    library = Library(id='org/repo', metadata='{"full_name": "NSS Bob", "stargazers_count": 420, "subscribers_count": 419, "forks": 418, "updated_at": "2011-8-10T13:47:12Z"}')
    library.tags = ["v1.0.0", "v1.0.1"]
    library.put()
    version1 = Version(parent=library.key, id='v1.0.0', sha='lol')
    version1.put()
    version2 = Version(parent=library.key, id='v1.0.1', sha='lol')
    version2.put()

    self.respond_to('https://raw.githubusercontent.com/org/repo/v1.0.1/README.md', chr(248))

    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual(len(tasks), 0)

    response = self.app.get(util.ingest_version_task('org', 'repo', 'v1.0.1'), params={'sha': 'sha'}, headers={'X-AppEngine-QueueName': 'default'})
    self.assertEqual(response.status_int, 200)

    version2 = version2.key.get()
    self.assertEqual(version2.status, Status.error)
    self.assertEqual(version2.error, "Could not store README.md as a utf-8 string")

    versions = Library.versions_for_key_async(library.key).get_result()
    self.assertEqual([], versions)

    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual(len(tasks), 1)
    self.assertEqual(tasks[0].url, util.ingest_version_task('org', 'repo', 'v1.0.0'))

  def test_ingest_commit(self):
    self.respond_to_github('https://api.github.com/repos/org/repo', '{}')
    self.respond_to_github('https://api.github.com/repos/org/repo/contributors', '["a"]')
    self.respond_to_github('https://api.github.com/repos/org/repo/stats/participation', '{}')
    response = self.app.get(util.ingest_commit_task('org', 'repo'), params={'commit': 'commit-sha', 'url': 'url'}, headers={'X-AppEngine-QueueName': 'default'})
    self.assertEqual(response.status_int, 200)

    library = Library.get_by_id('org/repo')
    self.assertIsNotNone(library)
    self.assertIsNone(library.error)
    self.assertTrue(library.shallow_ingestion)

    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual(len(tasks), 1)
    self.assertEqual(tasks[0].url, util.ingest_version_task('org', 'repo', 'commit-sha') + '?url=url&sha=commit-sha')

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
        util.ingest_library_task('org', 'element-1', 'element'),
        util.ingest_library_task('org', 'element-2', 'element'),
    ], [task.url for task in tasks])

    # Ensures collection references
    ref1 = CollectionReference.get_by_id(id="my/collection/v1.0.0", parent=ndb.Key(Library, "org/element-1"))
    self.assertIsNotNone(ref1)

    ref2 = CollectionReference.get_by_id(id="my/collection/v1.0.0", parent=ndb.Key(Library, "org/element-2"))
    self.assertIsNotNone(ref2)

    # TODO: Validate search index is updated correctly.

if __name__ == '__main__':
  unittest.main()
