from google.appengine.ext import ndb
from google.appengine.api import urlfetch

import json
import logging

import util

class QuotaRecord(ndb.Model):
  # our best estimate of how many requests we have left
  remaining = ndb.IntegerProperty(required=True)
  # the number of remaining requests which have already been reserved
  reserved = ndb.IntegerProperty(required=True)

key = ndb.Key('QuotaRecord', 'Quota')

@ndb.transactional
def reserve(count):
  instance = QuotaRecord.get_or_insert(key.id(), remaining=10000, reserved=0)
  if instance.remaining - instance.reserved < count:
    response = urlfetch.fetch(util.githubUrl('rate_limit'))
    instance.remaining = int(response.headers['X-RateLimit-Remaining'])
    if instance.remaining - instance.reserved < count:
      return False
  instance.reserved += count
  instance.put()
  return True

@ndb.transactional
def used(used_count=1, new_remaining=None):
  instance = QuotaRecord.get_or_insert(key.id(), remaining=10000, reserved=0)
  if not new_remaining == None:
    instance.remaining = new_remaining
  instance.reserved -= used_count
  instance.put()

class GitHub:
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
    response = urlfetch.fetch(util.githubUrl('markdown'), method='POST',
                              payload=json.dumps({'text': util.inlineDemoTransform(content)}))
    used(1, int(response.headers['X-RateLimit-Remaining']))
    if response.status_code == 403:
      raise Exception('reservation exceeded')
    return response

  def githubResource(self, name, owner, repo, context=None):
    if self.reservation == 0:
      raise Exception('reservation exceeded')
    response = urlfetch.fetch(util.githubUrl('repos', owner, repo, context))
    used(1, int(response.headers['X-RateLimit-Remaining']))
    if response.status_code == 403:
      raise Exception('reservation exceeded')
    return response

  def release(self):
    used(self.reservation)
    self.reservation = 0
