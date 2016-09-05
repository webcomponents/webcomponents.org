from google.appengine.ext import ndb
from google.appengine.api import search
from google.appengine.api import urlfetch

import logging
import json
import re
import urllib
from urlparse import urlparse
import webapp2

from datamodel import Library, Version, Content, Dependency, Status
import versiontag

import util

TIME_FORMAT = '%Y-%m-%dT%H:%M:%SZ'

class SearchContents(webapp2.RequestHandler):
  def get(self, terms):
    index = search.Index('repo')
    limit = int(self.request.get('limit', 20))
    offset = int(self.request.get('offset', 0))
    search_results = index.search(
        search.Query(query_string=terms,
                     options=search.QueryOptions(limit=limit, offset=offset, number_found_accuracy=100)))
    result_futures = []
    for result in search_results.results:
      (owner, repo) = result.doc_id.split('/')
      version = None
      for field in result.fields:
        if field.name == 'version':
          version = field.value
          break
      result_futures.append(brief_library_metadata_async(owner, repo, version))
    results = [result_future.get_result() for result_future in result_futures]

    self.response.headers['Access-Control-Allow-Origin'] = '*'
    self.response.write(json.dumps({
        'results': results,
        'count': search_results.number_found,
    }))

@ndb.tasklet
def brief_library_metadata_async(owner, repo, tag=None):
  metadata = yield library_metadata_async(owner, repo, tag=tag, brief=True)
  result = {
      'owner': metadata['owner'],
      'repo': metadata['repo'],
      'version': metadata['version'],
      # TODO: Resolve this difference.
      'description': metadata['bower']['description'],
      'keywords': metadata['bower']['keywords'],
      'stars': metadata['stars'],
      'subscribers': metadata['subscribers'],
      'forks': metadata['forks'],
      'contributors': metadata['contributors'],
      'updated_at': metadata['updated_at'],
  }
  raise ndb.Return(result)

@ndb.tasklet
def library_metadata_async(owner, repo, tag=None, brief=False):
  assert owner == owner.lower()
  assert repo == repo.lower()

  library_key = ndb.Key(Library, '%s/%s' % (owner, repo))
  library_future = library_key.get_async()

  versions_future = Library.versions_for_key_async(library_key)
  if tag is None:
    versions = yield versions_future
    version_key = None if len(versions) == 0 else ndb.Key(Library, library_key.id(), Version, versions[0])
  else:
    version_key = ndb.Key(Library, library_key.id(), Version, tag)

  if version_key is not None:
    version_future = version_key.get_async()
    readme_future = Content.get_by_id_async('readme.html', parent=version_key)
    bower_future = Content.get_by_id_async('bower', parent=version_key)
  else:
    none_future = ndb.Future()
    none_future.set_result(None)
    version_future = none_future
    readme_future = none_future
    bower_future = none_future

  library = yield library_future
  if library is None:
    raise ndb.Return(None)

  result = {}
  result['status'] = library.status
  if library.status == Status.error:
    result['error'] = library.error

  if not brief:
    versions = yield versions_future
    result['versions'] = versions

  version = yield version_future
  if version is not None:
    result['version'] = version.key.id()
    result['version_status'] = version.status
    if version.status == Status.error:
      result['version_error'] = version.error

  if library.metadata is not None:
    metadata = json.loads(library.metadata)
    result['subscribers'] = metadata['subscribers_count']
    result['stars'] = metadata['stargazers_count']
    result['forks'] = metadata['forks']
    result['contributors'] = library.contributor_count
    result['open_issues'] = metadata['open_issues']
    result['updated_at'] = metadata['updated_at']
    result['owner'] = metadata['owner']['login']
    result['avatar_url'] = metadata['owner']['avatar_url']
    result['repo'] = metadata['name']

  readme = yield readme_future
  result['readme'] = None if readme is None else readme.content

  bower = yield bower_future
  if bower is not None:
    try:
      bower_json = json.loads(bower.content)
    except ValueError:
      bower_json = None

    if bower_json is not None:
      result['bower'] = {
          'description': bower_json.get('description', ''),
          'license': bower_json.get('license', ''),
          'dependencies': bower_json.get('dependencies', []),
          'keywords': bower_json.get('keywords', []),
      }

  # TODO: Reimplement collections and dependencies as tasklets so that they can
  # be triggered in parallel with the other requests above.
  if not brief:
    result['collections'] = []
    if version is not None:
      for collection in library.collections:
        if not versiontag.match(version.id, collection.semver):
          continue
        collection_version = collection.version.id()
        # TODO: Parallel fetch these.
        collection_library = collection.version.parent().get()
        collection_metadata = json.loads(collection_library.metadata)
        collection_name_match = re.match(r'(.*)/(.*)', collection_metadata['full_name'])
        result['collections'].append({
            'owner': collection_name_match.groups()[0],
            'repo': collection_name_match.groups()[1],
            'version': collection_version
        })

  if not brief and library.kind == 'collection':
    version_futures = []
    for dep in version.dependencies:
      parsed_dep = Dependency.fromString(dep)
      dep_key = ndb.Key(Library, "%s/%s" % (parsed_dep.owner.lower(), parsed_dep.repo.lower()))
      version_futures.append(Library.versions_for_key_async(dep_key))
    dependency_futures = []
    for i, dep in enumerate(version.dependencies):
      parsed_dep = Dependency.fromString(dep)
      versions = version_futures[i].get_result()
      versions.reverse()
      while len(versions) > 0 and not versiontag.match(versions[0], parsed_dep.version):
        versions.pop()
      if len(versions) == 0:
        error_future = ndb.Future()
        error_future.set_result({
            'error': 'unsatisfyable dependency',
            'owner': parsed_dep.owner,
            'repo': parsed_dep.repo,
            'versionSpec': parsed_dep.version
        })
        dependency_futures.append(error_future)
      else:
        dependency_futures.append(brief_library_metadata_async(parsed_dep.owner, parsed_dep.repo, versions[0]))
    result['dependencies'] = [future.get_result() for future in dependency_futures]

  raise ndb.Return(result)


class GetDataMeta(webapp2.RequestHandler):
  def get(self, owner, repo, ver=None):
    owner == owner.lower()
    repo == repo.lower()
    result = library_metadata_async(owner, repo, ver).get_result()

    self.response.headers['Access-Control-Allow-Origin'] = '*'
    self.response.headers['Content-Type'] = 'application/json'
    self.response.write(json.dumps(result))

class GetHydroData(webapp2.RequestHandler):
  def get(self, owner, repo, ver=None):

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

class RegisterPreview(webapp2.RequestHandler):
  def post(self):
    code = self.request.get('code')
    full_name = self.request.get('repo').lower()
    split = full_name.split('/')
    owner = split[0]
    repo = split[1]

    # Exchange code for an access token from Github
    headers = {'Accept': 'application/json'}
    access_token_url = 'https://github.com/login/oauth/access_token'
    params = {
        'client_id': util.SECRETS['github_client_id'],
        'client_secret': util.SECRETS['github_client_secret'],
        'code': code
    }
    access_response = urlfetch.fetch(access_token_url, payload=urllib.urlencode(params), headers=headers, method='POST', validate_certificate=True)
    access_token_response = json.loads(access_response.content)

    if access_response.status_code != 200 or not access_token_response or access_token_response.get('error'):
      self.response.set_status(401)
      self.response.write('Authorization failed')
      return
    access_token = access_token_response['access_token']

    # Validate access token against repo
    repos_response = util.github_resource('user/repos', access_token=access_token)
    if repos_response.status_code != 200:
      self.response.set_status(401)
      self.response.write('Cannot access user\'s repos')
      return

    repos = json.loads(repos_response.content)
    has_access = False
    for entry in repos:
      if entry['full_name'] == full_name:
        has_access = True
        break

    if not has_access:
      self.response.set_status(401)
      self.response.write('Do not have access to the repo')
      return

    parsed_url = urlparse(self.request.url)
    params = {'name': 'web', 'events': ['pull_request']}
    params['config'] = {
        'url': '%s://%s/api/preview/event' % (parsed_url.scheme, parsed_url.netloc),
        'content_type': 'json',
    }

    # Check if the webhook exists
    list_webhooks_response = util.github_post('repos', owner, repo, 'hooks', access_token=access_token)
    if list_webhooks_response.status_code != 200:
      logging.error('Unable to query existing webhooks, continuing anyway. Github %s: %s',
                    list_webhooks_response.status_code, list_webhooks_response.content)
    else:
      webhooks = json.loads(list_webhooks_response.content)
      for webhook in webhooks:
        if webhook['active'] and webhook['config'] == params['config']:
          self.response.write('Webhook is already configured')
          return

    # Create the webhook
    create_webhook_response = util.github_post('repos', owner, repo, 'hooks', params, access_token)
    if create_webhook_response.status_code != 201:
      self.response.set_status(500)
      self.response.write('Failed to create webhook.')
      logging.error('Failed to create webhook. Github %s: %s',
                    create_webhook_response.status_code, create_webhook_response.content)
      return

    # Trigger shallow ingestion of the library so we can store the access token.
    util.new_task(util.ingest_webhook_task(owner, repo), params={'access_token': access_token}, target='manage')
    self.response.write('Created webhook')

class PreviewEventHandler(webapp2.RequestHandler):
  def post(self):
    if self.request.headers.get('X-Github-Event') != 'pull_request':
      self.response.set_status(202) # Accepted
      self.response.write('Payload was not for a pull_request, aborting.')
      return

    payload = json.loads(self.request.body)
    if payload['action'] != 'opened' and payload['action'] != 'synchronize':
      self.response.set_status(202) # Accepted
      self.response.write('Payload was not opened or synchronize, aborting.')
      return

    owner = payload['repository']['owner']['login']
    repo = payload['repository']['name']
    full_name = payload['repository']['full_name']

    key = ndb.Key(Library, full_name)
    library = key.get(read_policy=ndb.EVENTUAL_CONSISTENCY)

    if library is None:
      logging.error('No library object found for %s', full_name)
      self.response.set_status(400) # Bad request
      self.response.write('It does not seem like this repository was registered')
      return

    sha = payload['pull_request']['head']['sha']
    parsed_url = urlparse(self.request.url)
    params = {
        'state': 'success',
        'target_url': '%s://%s/element/%s/%s/%s' % (parsed_url.scheme, parsed_url.netloc, owner, repo, sha),
        'description': 'Preview is ready!', # TODO: Don't lie
        'context': 'custom-elements/preview'
    }

    response = util.github_post('repos', owner, repo, 'statuses/%s' % sha, params, library.github_access_token)
    if response.status_code != 201:
      logging.error('Failed to set status on Github PR. Github returned %s:%s', response.status_code, response.content)
      self.response.set_status(500)
      self.response.write('Failed to set status on PR.')
      return

    pull_request_url = payload['pull_request']['url']
    util.new_task(util.ingest_commit_task(owner, repo), params={'commit': sha, 'url': pull_request_url}, target='manage')

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
    webapp2.Route(r'/api/preview', handler=RegisterPreview),
    webapp2.Route(r'/api/preview/event', handler=PreviewEventHandler),
    webapp2.Route(r'/api/meta/<owner>/<repo>', handler=GetDataMeta),
    webapp2.Route(r'/api/meta/<owner>/<repo>/<ver>', handler=GetDataMeta),
    webapp2.Route(r'/api/docs/<owner>/<repo>', handler=GetHydroData),
    webapp2.Route(r'/api/docs/<owner>/<repo>/<ver>', handler=GetHydroData),
    webapp2.Route(r'/api/search/<terms>', handler=SearchContents, name='search'),
    webapp2.Route(r'/api/ondemand', handler=OnDemand),
], debug=True)
