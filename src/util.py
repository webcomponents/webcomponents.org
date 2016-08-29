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

def publish_analysis_request(owner, repo, version):
  try:
    get_topic().publish(
        "",
        owner=owner,
        repo=repo,
        version=version,
        responseTopic=os.environ['ANALYSIS_RESPONSE_TOPIC'])
  # TODO: Which exception is this for?
  # pylint: disable=bare-except
  except:
    logging.error('Failed to publish %s', logging.error(sys.exc_info()[0]))

def github_url(prefix, owner=None, repo=None, detail=None):
  if owner is None:
    result = 'https://api.github.com/%s' % (prefix,)
  else:
    result = 'https://api.github.com/%s/%s/%s' % (prefix, owner, repo)
  if detail is not None:
    result = result + '/' + detail
  return result

def content_url(owner, repo, version, path):
  return 'https://raw.githubusercontent.com/%s/%s/%s/%s' % (owner, repo, version, path)

def ingest_library_task(owner, repo, kind):
  return '/task/ingest/library/%s/%s/%s' % (owner, repo, kind)

def ingest_commit_task(owner, repo):
  return '/task/ingest/commit/%s/%s' % (owner, repo)

def ingest_webhook_task(owner, repo):
  return '/task/ingest/webhook/%s/%s' % (owner, repo)

def ingest_version_task(owner, repo, version):
  return '/task/ingest/version/%s/%s/%s' % (owner, repo, version)

def ingest_dependencies_task(owner, repo, version):
  return '/task/ingest/dependencies/%s/%s/%s' % (owner, repo, version)

def new_task(url, params=None, target=None):
  if params is None:
    params = {}
  return taskqueue.add(method='GET', url=url, params=params, target=target)

def inline_demo_transform(markdown):
  return re.sub(r'<!---?\n*(```(?:html)?\n<custom-element-demo.*?```)\n-->', r'\1', markdown, flags=re.DOTALL)

class GithubQuotaExceededError(Exception):
  pass

class GithubServerError(Exception):
  pass

def github_rate_limit():
  headers = {}
  add_authorization_header(headers)
  response = urlfetch.fetch(github_url('rate_limit'), headers=headers, validate_certificate=True)
  return {
      'x-ratelimit-reset': response.headers.get('x-ratelimit-reset', 'unknown'),
      'x-ratelimit-limit': response.headers.get('x-ratelimit-limit', 'unknown'),
      'x-ratelimit-remaining': response.headers.get('x-ratelimit-remaining', 'unknown'),
  }

def github_markdown(content):
  headers = {}
  add_authorization_header(headers)
  response = urlfetch.fetch(github_url('markdown'), method='POST', validate_certificate=True, headers=headers,
                            payload=json.dumps({'text': inline_demo_transform(content)}))
  if response.status_code == 403:
    raise GithubQuotaExceededError('reservation exceeded')
  elif response.status_code >= 500:
    raise GithubServerError(response.status_code)
  return response

def github_resource(name, owner=None, repo=None, context=None, etag=None, access_token=None):
  headers = {}
  add_authorization_header(headers, access_token)
  if etag is not None:
    headers['If-None-Match'] = etag
  response = urlfetch.fetch(github_url(name, owner, repo, context), headers=headers, validate_certificate=True)
  if response.status_code == 403:
    raise GithubQuotaExceededError('reservation exceeded')
  elif response.status_code >= 500:
    raise GithubServerError(response.status_code)
  return response

def github_post(name, owner, repo, context=None, payload=None, access_token=None):
  headers = {}
  add_authorization_header(headers, access_token)
  url = github_url(name, owner, repo, context)
  response = urlfetch.fetch(url, payload=json.dumps(payload), headers=headers, validate_certificate=True, method='POST')
  if response.status_code == 403:
    raise GithubQuotaExceededError('reservation exceeded')
  elif response.status_code >= 500:
    raise GithubServerError(response.status_code)
  return response
