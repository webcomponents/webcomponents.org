from gcloud import pubsub
from google.appengine.api import taskqueue

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

# TODO: Make newTask take a task URL instead of components and start using
# functions like this
def library_ingestion_task(owner, repo, kind):
  return '/task/ingest/library/%s/%s/%s' % (owner, repo, kind)

def new_task(url, owner, repo, **kw):
  if kw.has_key('detail'):
    detail = '/' + kw['detail']
  else:
    detail = ''
  return taskqueue.add(method='GET', url='/task/' + url + '/' + owner + '/' + repo + detail)

def inline_demo_transform(markdown):
  return re.sub(r'<!---?\n*(```(?:html)?\n<custom-element-demo.*?```)\n-->', r'\1', markdown, flags=re.DOTALL)
