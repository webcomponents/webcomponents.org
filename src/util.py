from google.appengine.api import taskqueue
from google.appengine.api import urlfetch

import json
import logging
import re
import urllib
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

def github_url(prefix, owner=None, repo=None, detail=None, params=None):
  parts = [part for part in [prefix, owner, repo, detail] if part is not None]
  params = '?' + urllib.urlencode(params) if params is not None else ''
  return 'https://api.github.com/' + '/'.join(parts) + params

def content_url(owner, repo, version, path):
  return 'https://raw.githubusercontent.com/%s/%s/%s/%s' % (owner, repo, version, path)

def analyze_library_task(owner, repo):
  return '/manage/analyze/%s/%s' % (owner, repo)

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

def ingest_preview_task(owner, repo):
  return '/task/ingest-preview/%s/%s' % (owner, repo)

def ingest_webhook_task(owner, repo):
  return '/task/ingest-webhook/%s/%s' % (owner, repo)

def ingest_analysis_task(owner, repo, version, sha=None):
  if sha is not None:
    return '/task/analyze/%s/%s/%s/%s' % (owner, repo, version, sha)
  return '/task/analyze/%s/%s/%s' % (owner, repo, version)

def delete_task(owner, repo, version):
  return '/task/delete/%s/%s/%s' % (owner, repo, version)

def new_task(url, params=None, target=None, transactional=False, queue_name='default'):
  if params is None:
    params = {}
  return taskqueue.add(method='GET', url=url, params=params, target=target, transactional=transactional, queue_name=queue_name)

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

def github_get(name, owner=None, repo=None, context=None, etag=None, access_token=None, headers=None, params=None):
  return github_request(name, owner=owner, repo=repo, context=context, etag=etag, access_token=access_token, headers=headers, params=params)

def github_post(name, owner=None, repo=None, context=None, payload=None, access_token=None):
  return github_request(name, owner=owner, repo=repo, context=context, access_token=access_token, method='POST', payload=payload)

def github_request(name, owner=None, repo=None, context=None, etag=None, access_token=None, method='GET', payload=None, headers=None, params=None):
  if headers is None:
    headers = {}
  add_authorization_header(headers, access_token)
  if etag is not None:
    headers['If-None-Match'] = etag
  url = github_url(name, owner, repo, context, params)
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

caps_subber = re.compile('([A-Z][a-z])')
def tokenise_more(string):
  # split "AndyMutton" into ["Andy", "Mutton"]
  return caps_subber.sub(r' \1', string).split()

def generate_prefixes(string):
  # split "AndyMutton" into ["And", "Andy", "AndyM", "AndyMu", "AndyMut" ...]
  prefixes = []
  # minimum prefix length is 3, so only words at least 4 chars long are valid here
  if len(string) < 4:
    return []

  for char in string:
    if len(prefixes) > 0:
      prefixes.append(prefixes[-1] + char)
    else:
      prefixes.append(char)
  # skip the first two (too small) and the last (indexed elsewhere)
  return prefixes[2:-1]

def generate_prefixes_from_list(list_of_strings):
  prefixes = []
  for string in list_of_strings:
    tokens = tokenise_more(string) + [string]
    for token in tokens:
      prefixes = prefixes + generate_prefixes(token.lower())
  return list(set(prefixes))

def safesplit(item):
  if item is None:
    return []
  if not isinstance(item, basestring):
    item = str(item)
  return item.split()
