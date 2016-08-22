from gcloud import pubsub
from google.appengine.api import taskqueue
from google.appengine.api import urlfetch

import json
import logging
import os
import re
import sys
import yaml

GITHUB_TOKEN = None
try:
  with open('secrets.yaml', 'r') as f:
    GITHUB_TOKEN = yaml.load(f)['github_token']
except (OSError, IOError):
  logging.error("No Secret Token")

def add_secret(url):
  access = ''
  if GITHUB_TOKEN is not None:
    access = '?access_token=' + GITHUB_TOKEN
  return url + access

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
  return add_secret(result)

def content_url(owner, repo, version, path):
  return 'https://raw.githubusercontent.com/%s/%s/%s/%s' % (owner, repo, version, path)

def ingest_library_task(owner, repo, kind):
  return '/task/ingest/library/%s/%s/%s' % (owner, repo, kind)

def ingest_commit_task(owner, repo, kind):
  return '/task/ingest/commit/%s/%s/%s' % (owner, repo, kind)

def ingest_version_task(owner, repo, version):
  return '/task/ingest/version/%s/%s/%s' % (owner, repo, version)

def ingest_dependencies_task(owner, repo, version):
  return '/task/ingest/dependencies/%s/%s/%s' % (owner, repo, version)

def new_task(url, params=None):
  if params is None:
    params = {}
  return taskqueue.add(method='GET', url=url, params=params)

def inline_demo_transform(markdown):
  return re.sub(r'<!---?\n*(```(?:html)?\n<custom-element-demo.*?```)\n-->', r'\1', markdown, flags=re.DOTALL)

class GithubQuotaExceededError(Exception):
  pass

class GithubServerError(Exception):
  pass

def github_rate_limit():
  response = urlfetch.fetch(github_url('rate_limit'))
  return {
      'x-ratelimit-reset': response.headers.get('x-ratelimit-reset', 'unknown'),
      'x-ratelimit-limit': response.headers.get('x-ratelimit-limit', 'unknown'),
      'x-ratelimit-remaining': response.headers.get('x-ratelimit-remaining', 'unknown'),
  }

def github_markdown(content):
  response = urlfetch.fetch(github_url('markdown'), method='POST',
                            payload=json.dumps({'text': inline_demo_transform(content)}))
  if response.status_code == 403:
    raise GithubQuotaExceededError('reservation exceeded')
  elif response.status_code >= 500:
    raise GithubServerError(response.status_code)
  return response

def github_resource(name, owner, repo, context=None, etag=None):
  headers = {}
  if etag is not None:
    headers['If-None-Match'] = etag
  response = urlfetch.fetch(github_url(name, owner, repo, context), headers=headers)
  if response.status_code == 403:
    raise GithubQuotaExceededError('reservation exceeded')
  elif response.status_code >= 500:
    raise GithubServerError(response.status_code)
  return response
