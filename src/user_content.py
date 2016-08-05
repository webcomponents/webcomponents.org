from google.appengine.api import urlfetch
from google.appengine.ext import ndb

import json
import webapp2

from datamodel import Library, Version, Content

class GetResource(webapp2.RequestHandler):
  def get(self, owner, repo, tag, name=None, path=None):
    self.response.headers['Access-Control-Allow-Origin'] = '*'
    self.response.headers['Content-Type'] = 'application/json'

    owner = owner.lower()
    repo = repo.lower()
    version_key = ndb.Key(Library, '%s/%s' % (owner, repo), Version, tag)

    hydro = Content.get_by_id('hydrolyzer', parent=version_key, read_policy=ndb.EVENTUAL_CONSISTENCY)
    if hydro is None:
      self.response.set_status(404)
      return

    dependencies = json.loads(hydro.content).get('bowerDependencies', None)
    if dependencies is None:
      self.response.set_status(404)
      return

    config_map = {}
    for dependency in dependencies:
      config_map[dependency['name']] = '%s/%s/%s' % (dependency['owner'], dependency['repo'], dependency['version'])

    # Ensure the repo serves its own version.
    config_map[repo] = '%s/%s/%s' % (owner, repo, tag)

    def resolve(name, path):
      return 'https://cdn.rawgit.com/%s%s' % (config_map[name], path) if name in config_map else None

    # debug mode
    if name is None or path is None:
      for k in config_map:
        self.response.write('/%s/%s/%s/components/%s/... -> %s\n' % (owner, repo, tag, k, resolve(k, '/...')))
      self.response.write('\n')
      return

    resolved = resolve(name, path)
    if resolved is None:
      self.response.write('%s is not a valid dependency for %s/%s#%s' % (name, owner, repo, tag))
      self.response.set_status(400)
      return

    # TODO: Figure out what other types this is necessary for. eg. do we need it for CSS @import?
    # We need to serve html files from the same origin, so that relative urls load correctly.
    if path.endswith('.html'):
      # TODO: Decide whether this should be memcached. Appengine's urlfetch already does caching.
      response = urlfetch.fetch(resolved)
      if response.status_code == 200:
        self.response.write(response.content)
        self.response.headers['cache-control'] = response.headers.get('cache-control', 'max-age=315569000')
        self.response.headers['content-type'] = response.headers.get('content-type', 'text/html')
      else:
        self.response.write('could not fetch: %s' % resolved)
        self.response.set_status(400)
    else:
      self.response.set_status(301)
      self.response.headers['Location'] = str(resolved)
      self.response.headers['cache-control'] = 'max-age=315569000'

# pylint: disable=invalid-name
app = webapp2.WSGIApplication([
    webapp2.Route(r'/<owner>/<repo>/<tag>', handler=GetResource),
    webapp2.Route(r'/<owner>/<repo>/<tag>/<name><path:/.*>', handler=GetResource),
], debug=True)
