import webapp2

class Redirect(webapp2.RequestHandler):
  def get(self, path):
    self.redirect(uri='https://www.webcomponents.org/%s' % path, permanent=True)

# pylint: disable=invalid-name
app = webapp2.WSGIApplication([
    webapp2.Route(r'/<path:.*>', handler=Redirect),
], debug=True)
