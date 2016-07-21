from gcloud import pubsub
from google.appengine.api import taskqueue

import logging
import os
import random
import re
import sys
import yaml

github_token = None
try:
  with open('secrets.yaml', 'r') as f:
    secrets = yaml.load(f)
    github_token = secrets['github_token']
except:
  logging.error("No Secret Token")

def addSecret(url):
  access = ''
  if github_token is not None:
    access = '?access_token=' + github_token
  return url + access

def chooseTopic():
  hydro_prefix = os.environ['HYDRO_TOPIC_PREFIX']
  client = pubsub.Client()
  topics_with_active_subscriptions = []
  topics, topics_token = client.list_topics()
  while True:
    for topic in topics:
      if topic.name.startswith(hydro_prefix):
        topics_with_active_subscriptions.append(topic)
    if topics_token is None:
      break
    topics, topics_token = client.list_topics(page_token=topics_token)
  if not topics_with_active_subscriptions:
    # Create the 1st instance's topic
    topic = client.topic('%s1' % hydro_prefix)
    if not topic.exists():
      topic.create()
      assert topic.exists()
    topics_with_active_subscriptions.append(topic)

  return random.choice(topics_with_active_subscriptions)

def publishHydrolyzePending(url, owner, repo, version):
  try:
    topic = chooseTopic()
    topic.publish("", url=url, owner=owner, repo=repo, version=version, responseTopic=os.environ['HYDRO_RESPONSE_TOPIC'])
  except:
    logging.error('Failed to publish %s' % logging.error(sys.exc_info()[0]))

def githubUrl(prefix, owner=None, repo=None, detail=None):
  if owner is None:
    result = 'https://api.github.com/%s' % (prefix,)
  else:
    result = 'https://api.github.com/%s/%s/%s' % (prefix, owner, repo)
  if detail is not None:
    result = result + '/' + detail
  return addSecret(result)

def contentUrl(owner, repo, version, path):
  return 'https://raw.githubusercontent.com/%s/%s/%s/%s' % (owner, repo, version, path)

# TODO: Make newTask take a task URL instead of components and start using
# functions like this
def libraryIngestionTask(owner, repo, kind):
  return '/task/ingest/library/%s/%s/%s/0' % (owner, repo, kind)

def newTask(url, owner, repo, **kw):
  if kw.has_key('stage'):
    stage = kw['stage']
  else:
    stage = 0
  if kw.has_key('detail'):
    detail = '/' + kw['detail']
  else:
    detail = ''
  return taskqueue.add(method='GET', url='/task/' + url + '/' + owner + '/' + repo + detail + '/' + str(stage))

def inlineDemoTransform(markdown):
  return re.sub(r'<!---?\n*(```(?:html)?\n<custom-element-demo.*?```)\n-->', r'\1', markdown, flags=re.DOTALL)
