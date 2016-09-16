from gcloud import pubsub
from google.appengine.api import taskqueue
from google.appengine.api import urlfetch

import json
import logging
import os
import re
import sys
import yaml

SECRETS = {}
GITHUB_TOKEN = None
try:
  with open('secrets.yaml', 'r') as f:
    SECRETS = yaml.load(f)
    GITHUB_TOKEN = SECRETS.get('github_token', None)
except (OSError, IOError):
  logging.error('No more secrets.')

def add_authorization_header(headers, access_token=None):
  if access_token is None:
    access_token = GITHUB_TOKEN

  if access_token is not None:
    headers['Authorization'] = 'token %s' % access_token

ANALYSIS = {}
def get_topic():
  if 'topic' not in ANALYSIS:
    topic = pubsub.Client().topic(os.environ['ANALYSIS_REQUEST_TOPIC'])
    if not topic.exists():
      topic.create()
      assert topic.exists()
    ANALYSIS['topic'] = topic
  return ANALYSIS['topic']

def publish_analysis_request(owner, repo, version, sha=None):
  try:
    get_topic().publish(
        "",
        owner=owner,
        repo=repo,
        version=version,
        sha=sha,
        responseTopic=os.environ['ANALYSIS_RESPONSE_TOPIC'])
  # TODO: Which exception is this for?
  # pylint: disable=bare-except
  except:
    logging.error('Failed to publish %s', logging.error(sys.exc_info()[0]))

def github_url(prefix, owner=None, repo=None, detail=None):
  parts = [part for part in [prefix, owner, repo, detail] if part is not None]
  return 'https://api.github.com/' + '/'.join(parts)

def content_url(owner, repo, version, path):
  return 'https://raw.githubusercontent.com/%s/%s/%s/%s' % (owner, repo, version, path)

def update_author_task(name):
  return '/task/update/%s' % name

def update_library_task(library_id):
  assert '/' in library_id
  return '/task/update/%s' % library_id

def update_indexes_task(owner, repo):
  return '/task/update-indexes/%s/%s' % (owner, repo)

def ensure_author_task(name):
  return '/task/ensure/%s' % name

def ensure_library_task(owner, repo):
  return '/task/ensure/%s/%s' % (owner, repo)

def ingest_author_task(name):
  return '/task/ingest/%s' % name

def ingest_library_task(owner, repo):
  return '/task/ingest/%s/%s' % (owner, repo)

def ingest_version_task(owner, repo, version):
  return '/task/ingest/%s/%s/%s' % (owner, repo, version)

def ingest_commit_task(owner, repo):
  return '/task/ingest-commit/%s/%s' % (owner, repo)

def ingest_webhook_task(owner, repo):
  return '/task/ingest-webhook/%s/%s' % (owner, repo)

def delete_task(owner, repo, version):
  return '/task/delete/%s/%s/%s' % (owner, repo, version)

def new_task(url, params=None, target=None, transactional=False):
  if params is None:
    params = {}
  return taskqueue.add(method='GET', url=url, params=params, target=target, transactional=transactional)

def inline_demo_transform(markdown):
  return re.sub(r'<!---?\n*(```(?:html)?\n<custom-element-demo.*?```)\n-->', r'\1', markdown, flags=re.DOTALL)

class GitHubError(Exception):
  pass

class GitHubQuotaExceededError(GitHubError):
  pass

class GitHubServerError(GitHubError):
  pass

def github_rate_limit():
  headers = {}
  add_authorization_header(headers)
  response = github_get('rate_limit')
  return {
      'x-ratelimit-reset': response.headers.get('x-ratelimit-reset', 'unknown'),
      'x-ratelimit-limit': response.headers.get('x-ratelimit-limit', 'unknown'),
      'x-ratelimit-remaining': response.headers.get('x-ratelimit-remaining', 'unknown'),
  }

def github_markdown(content):
  return github_post('markdown', payload={'text': inline_demo_transform(content)})

def github_get(name, owner=None, repo=None, context=None, etag=None, access_token=None):
  return github_request(name, owner=owner, repo=repo, context=context, etag=etag, access_token=access_token)

def github_post(name, owner=None, repo=None, context=None, payload=None, access_token=None):
  return github_request(name, owner=owner, repo=repo, context=context, access_token=access_token, method='POST', payload=payload)

def github_request(name, owner=None, repo=None, context=None, etag=None, access_token=None, method='GET', payload=None):
  headers = {}
  add_authorization_header(headers, access_token)
  if etag is not None:
    headers['If-None-Match'] = etag
  url = github_url(name, owner, repo, context)
  response = urlfetch.fetch(url, headers=headers, validate_certificate=True, payload=json.dumps(payload), method=method)
  ratelimit_remaining = response.headers.get('x-ratelimit-remaining', None)
  if ratelimit_remaining is not None:
    logging.info('GitHub ratelimit remaining %s', ratelimit_remaining)
  if response.status_code == 403:
    logging.warning('GitHub quota exceeded for %s %s', method, url)
    raise GitHubQuotaExceededError('reservation exceeded')
  elif response.status_code >= 500:
    logging.error('GitHub returned unexpected response for %s %s', method, url)
    raise GitHubServerError(response.status_code)
  logging.info('GitHub %s %s %d', method, url, response.status_code)
  return response
