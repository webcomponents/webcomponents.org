from google.appengine.api import urlfetch

import logging
import webapp2
import re

class FilterUserAgent(webapp2.RequestHandler):
  def get(self, path):
    filtered = ['Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)']
    agent = str(self.request.headers['User-Agent'])
    filter = False
    for filter in filtered:
      if agent.find(filter) is not -1:
        filter = True

    ## TODO
    filter = True
    if filter:
      try:
        # Set deadline for fetch to 10 seconds
        urlfetch.set_default_fetch_deadline(20)
        url = 'https://dynamic-meta.appspot.com'
        result = urlfetch.fetch('https://bot-render.appspot.com/?url=%s' % url)
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
], debug=True)
