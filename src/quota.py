from google.appengine.ext import ndb
from google.appengine.api import urlfetch

import json

import util

class QuotaRecord(ndb.Model):
  # our best estimate of how many requests we have left
  remaining = ndb.IntegerProperty(required=True)
  # the number of remaining requests which have already been reserved
  reserved = ndb.IntegerProperty(required=True)

KEY = ndb.Key('QuotaRecord', 'Quota')

@ndb.transactional
def reserve(count):
  instance = QuotaRecord.get_or_insert(KEY.id(), remaining=10000, reserved=0)
  if instance.remaining - instance.reserved < count:
    response = urlfetch.fetch(util.github_url('rate_limit'))
    instance.remaining = int(response.headers['X-RateLimit-Remaining'])
    if instance.remaining - instance.reserved < count:
      return False
  instance.reserved += count
  instance.put()
  return True

@ndb.transactional
def used(used_count=1, new_remaining=None):
  instance = QuotaRecord.get_or_insert(KEY.id(), remaining=10000, reserved=0)
  if new_remaining is not None:
    instance.remaining = new_remaining
  instance.reserved -= used_count
  instance.put()

def rate_limit():
  response = urlfetch.fetch(util.github_url('rate_limit'))
  return {
      'x-ratelimit-reset': response.headers.get('x-ratelimit-reset', 'unknown'),
      'x-ratelimit-limit': response.headers.get('x-ratelimit-limit', 'unknown'),
      'x-ratelimit-remaining': response.headers.get('x-ratelimit-remaining', 'unknown'),
  }

class GitHub(object):
  def __init__(self):
    self.reservation = 0

  def reserve(self, reservation):
    if reserve(reservation):
      self.reservation += reservation
      return True
    return False

  def markdown(self, content):
    if self.reservation == 0:
      raise Exception('reservation exceeded')
    response = urlfetch.fetch(util.github_url('markdown'), method='POST',
                              payload=json.dumps({'text': util.inline_demo_transform(content)}))
    used(1, int(response.headers['X-RateLimit-Remaining']))
    if response.status_code == 403:
      raise Exception('reservation exceeded')
    return response

  def github_resource(self, name, owner, repo, context=None, etag=None):
    if self.reservation == 0:
      raise Exception('reservation exceeded')
    headers = {}
    if etag is not None:
      headers['If-None-Match'] = etag
    response = urlfetch.fetch(util.github_url(name, owner, repo, context), headers=headers)
    used(1, int(response.headers['X-RateLimit-Remaining']))
    if response.status_code == 403:
      raise Exception('reservation exceeded')
    return response

  def release(self):
    used(self.reservation)
    self.reservation = 0
