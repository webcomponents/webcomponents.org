from google.appengine.api import urlfetch

import logging
import webapp2
import re

class FilterUserAgent(webapp2.RequestHandler):
  def get(self, path):
    filtered = r'baiduspider|facebookexternalhit|twitterbot|rogerbot|linkedinbot|embedly|quora\ link\ preview|showyoubot|outbrain|pinterest|slackbot|vkShare|W3C_Validator';
    filter = re.search(filtered, str(self.request.headers['User-Agent']))

    if filter:
      try:
        # Set deadline for fetch to 10 seconds
        urlfetch.set_default_fetch_deadline(20)
        result = urlfetch.fetch('https://bot-render.appspot.com/?url=%s' % self.request.url)
        if result.status_code == 200:
          self.response.write(result.content)
        else:
          self.response.status_code = result.status_code
        return
      except urlfetch.Error:
          logging.exception('Caught exception fetching url')


    file = open('index.html', 'r')
    self.response.out.write(file.read())
    file.close()

# pylint: disable=invalid-name
app = webapp2.WSGIApplication([
    webapp2.Route(r'/<:.*>', handler=FilterUserAgent),
], debug=False)
