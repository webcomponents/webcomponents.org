import re
import unittest

from google.appengine.api import apiproxy_stub_map
from google.appengine.api import urlfetch_stub
from google.appengine.ext import ndb
from google.appengine.ext import testbed

class TestBase(unittest.TestCase):
  def setUp(self):
    self.testbed = testbed.Testbed()
    self.testbed.activate()
    self.testbed.init_datastore_v3_stub()
    self.testbed.init_urlfetch_stub()
    self.testbed.init_memcache_stub()
    self.testbed.init_taskqueue_stub()
    self.testbed.init_search_stub()

    self._expected_fetches = []
    apiproxy_stub_map.apiproxy.ReplaceStub(
        testbed.URLFETCH_SERVICE_NAME,
        urlfetch_stub.URLFetchServiceStub(
            urlmatchers_to_fetch_functions=[(lambda a: True, self._fetch)]))

    self.tasks = self.testbed.get_stub(
        testbed.TASKQUEUE_SERVICE_NAME)

  def tearDown(self):
    self.testbed.deactivate()
    ndb.get_context().clear_cache()
    self.assertEqual(self._expected_fetches, [])

  def _fetch(self, url, payload, method, headers, request, response, **params):
    for idx, (match, handler) in enumerate(self._expected_fetches):
      if re.match(match, url):
        del self._expected_fetches[idx]
        params['payload'] = payload
        params['method'] = method
        params['headers'] = headers
        params['request'] = request
        handler(url, response, params)
        return
    # TODO: assert not reached?
    raise Exception('Unexpected fetch of %s' % url)

  def _normalize_response(self, result):
    if isinstance(result, str):
      return {'content': result}
    return result

  def respond_to_github(self, match, result, remaining='42'):
    result = self._normalize_response(result)
    result['headers'] = result.get('headers', {})
    result['headers']['X-RateLimit-Remaining'] = remaining
    self.respond_to(match, result)

  def respond_to(self, match, result):
    result = self._normalize_response(result)
    def handle(url, response, _):
      assert re.match(match, url)
      response.set_statuscode(int(result.get('status', 200)))
      response.set_content(result.get('content', ''))
      for (name, value) in result.get('headers', {}).items():
        header = response.add_header()
        header.set_key(name)
        header.set_value(value)
    self._expected_fetches.append((match, handle))
