import webapp2
import re

class RedirectResource(webapp2.RequestHandler):
  def get(self, path):
    path = re.sub(r'/$', '', path)
    self.redirect('/community/%s' % path, permanent=True)

# pylint: disable=invalid-name
app = webapp2.WSGIApplication([
    webapp2.Route(r'/<:.*>', handler=RedirectResource),
], debug=True)
