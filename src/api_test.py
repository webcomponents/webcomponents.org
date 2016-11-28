import json
import unittest
import webtest

from datamodel import Library
from api import app
import util

from test_base import TestBase

class ApiTestBase(TestBase):
  def setUp(self):
    TestBase.setUp(self)
    self.app = webtest.TestApp(app)

class PreviewCommitTest(ApiTestBase):
  def setUp(self):
    ApiTestBase.setUp(self)
    util.SECRETS['recaptcha'] = 'secret'

  def test_resolve_pull(self):
    self.respond_to('https://www.google.com/recaptcha/api/siteverify', '{"success": true}')
    self.respond_to('https://api.github.com/repos/org/repo/git/refs/pull/1/head', '{"ref": "refs/pull/1/head", "object": {"sha": "pullsha"}}')
    response = self.app.post('/api/preview-commit', params={'url': 'https://github.com/org/repo/pull/1'})
    self.assertEqual(response.status_int, 200)
    self.assertEqual(response.normal_body, 'org/repo/pullsha')

  def test_resolve_commitsha(self):
    self.respond_to('https://www.google.com/recaptcha/api/siteverify', '{"success": true}')
    response = self.app.post('/api/preview-commit', params={'url': 'https://github.com/org/repo/commit/commitsha'})
    self.assertEqual(response.status_int, 200)
    self.assertEqual(response.normal_body, 'org/repo/commitsha')

  def test_resolve_treebranch(self):
    self.respond_to('https://www.google.com/recaptcha/api/siteverify', '{"success": true}')
    self.respond_to('https://api.github.com/repos/org/repo/git/refs/heads/branch', '{"ref": "refs/heads/branch", "object": {"sha": "branchsha"}}')
    response = self.app.post('/api/preview-commit', params={'url': 'https://github.com/org/repo/tree/branch'})
    self.assertEqual(response.status_int, 200)
    self.assertEqual(response.normal_body, 'org/repo/branchsha')

  def test_resolve_repo(self):
    self.respond_to('https://www.google.com/recaptcha/api/siteverify', '{"success": true}')
    self.respond_to('https://api.github.com/repos/org/repo/git/refs/heads/master', '{"ref": "refs/heads/master", "object": {"sha": "mastersha"}}')
    response = self.app.post('/api/preview-commit', params={'url': 'https://github.com/org/repo'})
    self.assertEqual(response.status_int, 200)
    self.assertEqual(response.normal_body, 'org/repo/mastersha')

  def test_resolve_pullsha(self):
    self.respond_to('https://www.google.com/recaptcha/api/siteverify', '{"success": true}')
    response = self.app.post('/api/preview-commit', params={'url': 'https://github.com/org/repo/pull/1/commits/pullcommitsha'})
    self.assertEqual(response.status_int, 200)
    self.assertEqual(response.normal_body, 'org/repo/pullcommitsha')

class PreviewTest(ApiTestBase):
  def setUp(self):
    ApiTestBase.setUp(self)

  def test_normal(self):
    self.respond_to('https://github.com/login/oauth/access_token', '{"access_token": "access_token"}')
    self.respond_to('https://api.github.com/repos/owner/repo', '{"permissions": {"admin": true}}')
    self.respond_to('https://api.github.com/repos/owner/repo/hooks', '[]')
    self.respond_to('https://api.github.com/repos/owner/repo/hooks', {'status': 201})
    self.app.post('/api/preview', params={'code': 'code', 'repo': 'owner/repo'}, status=200)
    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual(len(tasks), 1)

  def test_bad_code(self):
    self.respond_to('https://github.com/login/oauth/access_token', '{"error": "error"}')
    self.app.post('/api/preview', params={'code': 'code', 'repo': 'owner/repo'}, status=401)
    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual(len(tasks), 0)

  def test_no_repo_access(self):
    self.respond_to('https://github.com/login/oauth/access_token', '{"access_token": "access_token"}')
    self.respond_to('https://api.github.com/repos/owner/repo', '{"permissions": {"admin": false}}')
    self.app.post('/api/preview', params={'code': 'code', 'repo': 'owner/repo'}, status=401)
    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual(len(tasks), 0)

  def test_existing_webhook(self):
    self.respond_to('https://github.com/login/oauth/access_token', '{"access_token": "access_token"}')
    self.respond_to('https://api.github.com/repos/owner/repo', '{"permissions": {"admin": true}}')
    hooks = [{'active': True, 'config': {'url': 'http://localhost/api/preview-event', 'content_type': 'json'}}]
    self.respond_to('https://api.github.com/repos/owner/repo/hooks', json.dumps(hooks))
    self.app.post('/api/preview', params={'code': 'code', 'repo': 'owner/repo'}, status=200)
    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual(len(tasks), 0)

class PreviewEventHandler(ApiTestBase):
  def setUp(self):
    ApiTestBase.setUp(self)
    util.SECRETS['github_client_id'] = 'github_client_id'
    util.SECRETS['github_client_secret'] = 'github_client_secret'

  def test_normal(self):
    headers = {'X-Github-Event': 'pull_request'}
    payload = {
        'action': 'opened',
        'repository': {
            'owner': {'login': 'owner'},
            'name': 'repo',
            'full_name': 'owner/repo'
        },
        'pull_request': {
            'head': {
                'sha': 'sha',
                'repo': {
                    'owner': {'login': 'pull_owner'},
                    'name': 'pull_repo',
                    'full_name': 'pull_owner/pull_repo'
                }
            },
            'url': 'github_pr_url'
        }
    }
    library = Library(id='owner/repo')
    library.put()

    self.respond_to('https://api.github.com/repos/owner/repo/statuses', {'status': 201})
    self.app.post('/api/preview-event', params=json.dumps(payload), headers=headers, status=200)
    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual(len(tasks), 1)

  def test_no_header(self):
    self.app.post('/api/preview-event', status=202)
    tasks = self.tasks.get_filtered_tasks()
    self.assertEqual(len(tasks), 0)

class StarTest(ApiTestBase):
  def setUp(self):
    ApiTestBase.setUp(self)

  def test_normal(self):
    self.respond_to('https://github.com/login/oauth/access_token', '{"access_token": "access_token"}')
    self.respond_to('https://api.github.com/user/starred/owner/repo', {'status': 404})
    self.respond_to('https://api.github.com/user/starred/owner/repo', {'status': 204})
    self.app.post('/api/star/owner/repo', params={'code': 'code'}, status=204)

  def test_already_starred(self):
    self.respond_to('https://github.com/login/oauth/access_token', '{"access_token": "access_token"}')
    self.respond_to('https://api.github.com/user/starred/owner/repo', {'status': 204})
    self.app.post('/api/star/owner/repo', params={'code': 'code'}, status=202)

  def test_bad_code(self):
    self.respond_to('https://github.com/login/oauth/access_token', '{"error": "error"}')
    self.app.post('/api/star/owner/repo', params={'code': 'code'}, status=401)

if __name__ == '__main__':
  unittest.main()
