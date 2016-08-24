from google.appengine.ext import ndb
from google.appengine.api import search
from google.appengine.api import urlfetch

import logging
import json
import re
import urllib
import webapp2
import yaml

from datamodel import Library, Version, Content, Dependency
import versiontag

import util

TIME_FORMAT = '%Y-%m-%dT%H:%M:%SZ'

def brief_metadata_from_searchdoc(document):
  result = {}
  for field in document.fields:
    if field.name == 'full_name':
      match = re.match(r'(.*)/(.*)', field.value)
      result['owner'] = match.group(1)
      result['repo'] = match.group(2)
    if field.name in ['owner', 'repo', 'repoparts']:
      continue
    if field.name == 'updated_at':
      result[field.name] = field.value.strftime(TIME_FORMAT)
    else:
      result[field.name] = field.value
  return result

# TODO(shans): This is expensive. We can
# a) eliminate it in the common case where the requested version is the most recent, as we can
#    directly extract the metadata from the index using briefMetaDataFromSearchDocument.
# b) amortize the rare case where the requested version is not the most recent, by indexing that
#    version once into a secondary index (which we don't search over), *then* using
#    briefMetaDataFromSearchDocument.
def brief_metadata_from_datastore(owner, repo, version):
  key = ndb.Key(Library, "%s/%s" % (owner.lower(), repo.lower()))
  library = key.get(read_policy=ndb.EVENTUAL_CONSISTENCY)
  metadata = json.loads(library.metadata)
  bower_key = ndb.Key(Library, "%s/%s" % (owner.lower(), repo.lower()), Version, version, Content, "bower.json")
  bower = bower_key.get(read_policy=ndb.EVENTUAL_CONSISTENCY)
  if not bower is None:
    bower = json.loads(bower.content)
  else:
    bower = {}
  description = bower.get('description', metadata.get('description', ''))
  return {
      'owner': owner,
      'repo': repo,
      'version': version,
      'description': description,
      'keywords': ' '.join(bower.get('keywords', [])),
      'stars': metadata.get('stargazers_count'),
      'subscribers': metadata.get('subscribers_count'),
      'forks': metadata.get('forks'),
      'contributors': library.contributor_count,
      'updated_at': metadata.get('updated_at')
  }

class SearchContents(webapp2.RequestHandler):
  def get(self, terms):
    index = search.Index('repo')
    limit = int(self.request.get('limit', 20))
    offset = int(self.request.get('offset', 0))
    search_results = index.search(
        search.Query(query_string=terms,
                     options=search.QueryOptions(limit=limit, offset=offset)))
    results = []
    for result in search_results.results:
      results.append(brief_metadata_from_searchdoc(result))
    self.response.headers['Access-Control-Allow-Origin'] = '*'
    self.response.write(json.dumps(results))

class GetDataMeta(webapp2.RequestHandler):
  def get(self, owner, repo, ver=None):
    owner = owner.lower()
    repo = repo.lower()
    library = Library.get_by_id('%s/%s' % (owner, repo), read_policy=ndb.EVENTUAL_CONSISTENCY)
    if library is None or library.error is not None:
      self.response.write(str(library))
      self.response.set_status(404)
      return
    versions = library.versions()
    if ver is None:
      ver = versions[-1]
    version = Version.get_by_id(ver, parent=library.key, read_policy=ndb.EVENTUAL_CONSISTENCY)
    if version is None or version.error is not None:
      self.response.write(str(version))
      self.response.set_status(404)
      return
    metadata = json.loads(library.metadata)
    dependencies = []
    bower = Content.get_by_id('bower', parent=version.key, read_policy=ndb.EVENTUAL_CONSISTENCY)
    if bower is not None:
      try:
        bower_json = json.loads(bower.content)
      # TODO: Which exception is this for?
      # pylint: disable=bare-except
      except:
        bower_json = {}
    readme = Content.get_by_id('readme.html', parent=version.key, read_policy=ndb.EVENTUAL_CONSISTENCY)
    result = {
        'version': ver,
        'versions': versions,
        'readme': None if readme is None else readme.content,
        'subscribers': metadata['subscribers_count'],
        'stars': metadata['stargazers_count'],
        'forks': metadata['forks'],
        'contributors': library.contributor_count,
        'open_issues': metadata['open_issues'],
        'updated_at': metadata['updated_at'],
        'owner': metadata['owner']['login'],
        'avatar_url': metadata['owner']['avatar_url'],
        'repo': metadata['name'],
        'bower': None if bower is None else {
            'description': bower_json.get('description', ''),
            'license': bower_json.get('license', ''),
            'dependencies': bower_json.get('dependencies', []),
            'keywords': bower_json.get('keywords', []),
        },
        'collections': []
    }
    for collection in library.collections:
      if not versiontag.match(ver, collection.semver):
        continue
      collection_version = collection.version.id()
      collection_library = collection.version.parent().get()
      collection_metadata = json.loads(collection_library.metadata)
      collection_name_match = re.match(r'(.*)/(.*)', collection_metadata['full_name'])
      result['collections'].append({
          'owner': collection_name_match.groups()[0],
          'repo': collection_name_match.groups()[1],
          'version': collection_version
      })
    if library.kind == 'collection':
      dependencies = []
      version_futures = []
      for dep in version.dependencies:
        parsed_dep = Dependency.fromString(dep)
        dep_key = ndb.Key(Library, "%s/%s" % (parsed_dep.owner.lower(), parsed_dep.repo.lower()))
        version_futures.append(Library.versions_for_key_async(dep_key))
      for i, dep in enumerate(version.dependencies):
        parsed_dep = Dependency.fromString(dep)
        versions = version_futures[i].get_result()
        versions.reverse()
        while len(versions) > 0 and not versiontag.match(versions[0], parsed_dep.version):
          versions.pop()
        if len(versions) == 0:
          dependencies.append({
              'error': 'unsatisfyable dependency',
              'owner': parsed_dep.owner,
              'repo': parsed_dep.repo,
              'versionSpec': parsed_dep.version
          })
        else:
          dependencies.append(brief_metadata_from_datastore(parsed_dep.owner, parsed_dep.repo, versions[0]))
      result['dependencies'] = dependencies
    self.response.headers['Access-Control-Allow-Origin'] = '*'
    self.response.headers['Content-Type'] = 'application/json'
    self.response.write(json.dumps(result))

class GetHydroData(webapp2.RequestHandler):
  def get(self, owner, repo, ver=None):
    # TODO: Share all of this boilerplate between GetDataMeta and GetHydroData
    self.response.headers['Access-Control-Allow-Origin'] = '*'
    owner = owner.lower()
    repo = repo.lower()
    library_key = ndb.Key(Library, '%s/%s' % (owner, repo))
    # TODO: version shouldn't be optional here
    if ver is None:
      versions = Version.query(ancestor=library_key).map(lambda v: v.key.id())
      versions.sort(versiontag.compare)
      if versions == []:
        self.response.set_status(404)
        return
      ver = versions[-1]
    version_key = ndb.Key(Library, '%s/%s' % (owner, repo), Version, ver)
    analysis = Content.get_by_id('analysis', parent=version_key, read_policy=ndb.EVENTUAL_CONSISTENCY)
    if analysis is None:
      self.response.set_status(404)
      return

    self.response.headers['Content-Type'] = 'application/json'
    self.response.write(analysis.content)

class GetAccessToken(webapp2.RequestHandler):
  def post(self):
    code = self.request.get('code')

    client_id = None
    client_secret = None
    try:
      with open('secrets.yaml', 'r') as secrets:
        config = yaml.load(secrets)
        client_id = config['github_client_id']
        client_secret = config['github_client_secret']
    except (OSError, IOError):
      logging.error('No Github client id/secret configured in secrets.yaml')

    response = urlfetch.fetch('https://github.com/login/oauth/access_token?client_id=%s&client_secret=%s&code=%s' %
                              (client_id, client_secret, code), method='POST', validate_certificate=True)

    self.response.write(response.content)

def validate_captcha(handler):
  recaptcha = handler.request.get('recaptcha')
  params = {
      'secret': util.SECRETS['recaptcha'],
      'response': recaptcha,
      'remoteip': handler.request.remote_addr,
  }
  response = urlfetch.fetch('https://www.google.com/recaptcha/api/siteverify', payload=urllib.urlencode(params), method='POST', validate_certificate=True)
  if not json.loads(response.content).get('success', False):
    handler.response.set_status(403)
    return False
  return True

class OnDemand(webapp2.RequestHandler):
  def post(self):
    if not validate_captcha(self):
      return

    url = self.request.get('url')
    match = re.match(r'https://github.com/(.*?)/([^/]*)(.*)', url)
    owner = match.group(1)
    repo = match.group(2)
    tail = match.group(3)

    # SHA already defined
    match = re.match(r'.*commits?/(.*)', tail)
    if match:
      self.response.headers['Access-Control-Allow-Origin'] = '*'
      self.response.headers['Content-Type'] = 'application/json'
      self.response.write('%s/%s/%s' % (owner, repo, match.group(1)))
      util.new_task(util.ingest_commit_task(owner, repo), params={'commit': match.group(1), 'url': url}, target='manage')
      return

    # Resolve SHA using these patterns and Github API
    tail = re.sub(r'/pull/(.*)', r'pull/\1/head', tail)
    tail = re.sub(r'/tree/(.*)', r'heads/\1', tail)
    tail = re.sub(r'^$', r'heads/master', tail)

    if not tail:
      self.response.set_status(400)
      self.response.write('Unable to understand url (%s)', url)

    response = util.github_resource('repos', owner, repo, 'git/refs/' + tail)

    if response.status_code == 404:
      self.response.set_status(400)
      self.response.write('Error resolving url (%s)', url)

    sha = json.loads(response.content)['object']['sha']
    util.new_task(util.ingest_commit_task(owner, repo), params={'commit': sha, 'url': url}, target='manage')
    self.response.headers['Access-Control-Allow-Origin'] = '*'
    self.response.headers['Content-Type'] = 'application/json'
    self.response.write('%s/%s/%s' % (owner, repo, sha))


# pylint: disable=invalid-name
app = webapp2.WSGIApplication([
    webapp2.Route(r'/api/add', handler=GetAccessToken),
    webapp2.Route(r'/api/meta/<owner>/<repo>', handler=GetDataMeta),
    webapp2.Route(r'/api/meta/<owner>/<repo>/<ver>', handler=GetDataMeta),
    webapp2.Route(r'/api/docs/<owner>/<repo>', handler=GetHydroData),
    webapp2.Route(r'/api/docs/<owner>/<repo>/<ver>', handler=GetHydroData),
    webapp2.Route(r'/api/search/<terms>', handler=SearchContents, name='search'),
    webapp2.Route(r'/api/ondemand', handler=OnDemand),
], debug=True)
