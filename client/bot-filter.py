from google.appengine.api import urlfetch

import logging
import webapp2
import re

class FilterUserAgent(webapp2.RequestHandler):
  def get(self, path):
    filtered = r'baiduspider|facebookexternalhit|twitterbot|rogerbot|linkedinbot|embedly|quora\ link\ preview|showyoubot|outbrain|pinterest|slackbot|vkShare|W3C_Validator|bingbot';
    filter = re.search(filtered, str(self.request.headers.get('User-Agent', '')), flags=re.IGNORECASE)

    if filter:
      try:
        # Set deadline for fetch to 15 seconds
        urlfetch.set_default_fetch_deadline(15)
        result = urlfetch.fetch('https://web-components-render.appspot.com/render/%s' % self.request.url)
        if result.status_code == 200:
          self.response.write(result.content)
          return
        else:
          logging.error('Bot-render failed with status %d and content %s', result.status_code, result.content)
      except urlfetch.Error:
        logging.exception('Caught exception fetching url')

    file = open('index.html', 'r')
    self.response.out.write(file.read())
    file.close()

# pylint: disable=invalid-name
app = webapp2.WSGIApplication([
    webapp2.Route(r'/<:.*>', handler=FilterUserAgent),
], debug=False)
