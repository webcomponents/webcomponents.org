from google.appengine.ext import ndb
from google.appengine.api import search
from google.appengine.api import urlfetch

import logging
import json
import re
import urllib
from urlparse import urlparse
import webapp2

from datamodel import Author, Library, Version, Content, Dependency, Status
import versiontag

import util

class SearchContents(webapp2.RequestHandler):
  @ndb.toplevel
  def get(self, terms):
    self.response.headers['Access-Control-Allow-Origin'] = '*'

    try:
      limit = int(self.request.get('limit', 20))
      offset = int(self.request.get('offset', 0))
    except ValueError:
      self.response.set_status(400)
      return
    index = search.Index('repo')
    try:
      search_results = index.search(
          search.Query(query_string=terms,
                       options=search.QueryOptions(limit=limit, offset=offset, number_found_accuracy=100)))
    except search.QueryError:
      self.response.set_status(400)
      self.response.write('bad query')
      return
    result_futures = []
    for result in search_results.results:
      (owner, repo) = result.doc_id.split('/')
      version = None
      for field in result.fields:
        if field.name == 'version':
          version = field.value
          break
      library_key = ndb.Key(Library, Library.id(owner, repo))
      result_futures.append(LibraryMetadata.brief_async(library_key, version))
    results = []
    for future in result_futures:
      result = yield future
      if result is not None:
        results.append(result)

    self.response.headers['Content-Type'] = 'application/json'
    self.response.write(json.dumps({
        'results': results,
        'count': search_results.number_found,
    }))

class LibraryMetadata(object):
  @staticmethod
  @ndb.tasklet
  def brief_async(library_key, tag=None):
    metadata = yield LibraryMetadata.full_async(library_key, tag=tag, brief=True)
    if metadata is None or metadata['status'] != Status.ready or metadata['version_status'] != Status.ready:
      raise ndb.Return(None)
    result = {
        'owner': metadata['owner'],
        'repo': metadata['repo'],
        'version': metadata['version'],
        'kind': metadata['kind'],
        'description': metadata['description'],
        'stars': metadata['stars'],
        'subscribers': metadata['subscribers'],
        'forks': metadata['forks'],
        'updated_at': metadata['updated_at'],
        'dependency_count': metadata['dependency_count'],
        'avatar_url': metadata['avatar_url'],
    }
    raise ndb.Return(result)

  @staticmethod
  @ndb.tasklet
  def full_async(library_key, tag=None, brief=False):
    library_future = library_key.get_async()

    # TODO: Restrict based on version status == ready when tag != None.
    versions_future = Library.versions_for_key_async(library_key)
    if tag is None:
      versions = yield versions_future
      version_key = None if len(versions) == 0 else ndb.Key(Library, library_key.id(), Version, versions[-1])
    else:
      version_key = ndb.Key(Library, library_key.id(), Version, tag)

    if version_key is not None:
      version_future = version_key.get_async()
      bower_future = Content.get_by_id_async('bower', parent=version_key)
      if not brief:
        readme_future = Content.get_by_id_async('readme.html', parent=version_key)

    library = yield library_future
    if library is None:
      raise ndb.Return(None)

    result = {}
    result['status'] = library.status
    if library.status == Status.error:
      result['error'] = library.error

    if not brief and version_key is not None:
      versions = yield versions_future
      result['versions'] = versions

    if not brief and library.participation is not None:
      result['activity'] = json.loads(library.participation).get('all', [])

    if not brief and library.contributors is not None:
      contributors = []
      raw = json.loads(library.contributors)
      for contributor in raw:
        contributors.append({
            'login': contributor['login'],
            'avatar_url': contributor['avatar_url'],
            'contributions': contributor['contributions'],
        })
      result['contributors'] = contributors

    if library.metadata is not None:
      metadata = json.loads(library.metadata)
      result['description'] = metadata['description']
      result['subscribers'] = metadata['subscribers_count']
      result['stars'] = metadata['stargazers_count']
      result['forks'] = metadata['forks']
      result['open_issues'] = metadata['open_issues']
      result['updated_at'] = metadata['updated_at']
      result['owner'] = metadata['owner']['login']
      result['avatar_url'] = metadata['owner']['avatar_url']
      result['repo'] = metadata['name']

    version = None
    if version_key is not None:
      version = yield version_future

    if version is None:
      raise ndb.Return(None)

    result['version'] = version.key.id()
    result['kind'] = library.kind
    result['version_status'] = version.status
    if version.status == Status.error:
      result['version_error'] = version.error


    if not brief:
      readme = yield readme_future
      result['readme'] = None if readme is None else readme.content

    bower = yield bower_future
    if bower is not None:
      bower_json = json.loads(bower.content)
      dependencies = bower_json.get('dependencies', [])
      result['dependency_count'] = len(dependencies)
      result['bower'] = {
          'license': bower_json.get('license', ''),
          'dependencies': dependencies,
          'keywords': bower_json.get('keywords', []),
      }
      if result.get('description', '') == '':
        result['description'] = bower_json.get('description', '')

    raise ndb.Return(result)

class GetCollections(webapp2.RequestHandler):
  @ndb.toplevel
  def get(self, owner, repo, version=None):
    self.response.headers['Access-Control-Allow-Origin'] = '*'
    self.response.headers['Content-Type'] = 'application/json'

    library_key = ndb.Key(Library, Library.id(owner, repo))

    if version is None:
      version = yield Library.latest_version_for_key_async(library_key)
      if version is None:
        self.response.set_status(404)
        return

    version_key = ndb.Key(Library, library_key.id(), Version, version)

    collection_versions = yield Version.collections_for_key_async(version_key)
    collection_futures = []
    for collection_version in collection_versions:
      collection_futures.append(LibraryMetadata.brief_async(collection_version.key.parent(), collection_version.key.id()))
    collections = []
    for future in collection_futures:
      collection_result = yield future
      collections.append(collection_result)

    self.response.write(json.dumps(collections))

class GetDependencies(webapp2.RequestHandler):
  @ndb.toplevel
  def get(self, owner, repo, version=None):
    self.response.headers['Access-Control-Allow-Origin'] = '*'
    self.response.headers['Content-Type'] = 'application/json'

    library_key = ndb.Key(Library, Library.id(owner, repo))

    if version is None:
      version = yield Library.latest_version_for_key_async(library_key)
      if version is None:
        self.response.set_status(404)
        return

    version_key = ndb.Key(Library, library_key.id(), Version, version)

    bower = yield Content.get_by_id_async('bower', parent=version_key)
    bower_json = json.loads(bower.content)
    bower_dependencies = bower_json.get('dependencies', {})

    dependencies = []
    version_futures = []
    for name in bower_dependencies.keys():
      dependency = Dependency.from_string(bower_dependencies[name])
      dependencies.append(dependency)
      dependency_library_key = ndb.Key(Library, Library.id(dependency.owner, dependency.repo))
      version_futures.append(Library.versions_for_key_async(dependency_library_key))

    dependency_futures = []
    for i, dependency in enumerate(dependencies):
      versions = yield version_futures[i]
      while len(versions) > 0 and not versiontag.match(versions[-1], dependency.version):
        versions.pop()
      if len(versions) == 0:
        error_future = ndb.Future()
        error_future.set_result({
            'error': 'unsatisfyable dependency',
            'owner': dependency.owner,
            'repo': dependency.repo,
            'versionSpec': dependency.version
        })
        dependency_futures.append(error_future)
      else:
        dependency_library_key = ndb.Key(Library, Library.id(dependency.owner.lower(), dependency.repo.lower()))
        dependency_futures.append(LibraryMetadata.brief_async(dependency_library_key, versions[-1]))

    results = []
    for future in dependency_futures:
      dependency_result = yield future
      if dependency_result is not None:
        results.append(dependency_result)

    self.response.write(json.dumps(results))

class GetMetadata(webapp2.RequestHandler):
  @ndb.toplevel
  def get(self, owner, repo, ver=None):
    self.response.headers['Access-Control-Allow-Origin'] = '*'
    self.response.headers['Content-Type'] = 'application/json'

    owner = owner.lower()
    repo = repo.lower()
    library_key = ndb.Key(Library, Library.id(owner, repo))
    result = yield LibraryMetadata.full_async(library_key, ver)
    if result is None:
      self.response.set_status(404)
    else:
      self.response.write(json.dumps(result))

class GetDocs(webapp2.RequestHandler):
  @ndb.toplevel
  def get(self, owner, repo, ver=None):
    # TODO: Share all of this boilerplate between API handlers
    self.response.headers['Access-Control-Allow-Origin'] = '*'
    owner = owner.lower()
    repo = repo.lower()
    library_key = ndb.Key(Library, Library.id(owner, repo))
    if ver is None:
      ver = yield Library.latest_version_for_key_async(library_key)
    if ver is None:
      self.response.set_status(404)
      return
    version_key = ndb.Key(Library, Library.id(owner, repo), Version, ver)
    analysis = Content.get_by_id('analysis', parent=version_key, read_policy=ndb.EVENTUAL_CONSISTENCY)
    if analysis is None:
      self.response.set_status(404)
      return

    self.response.headers['Content-Type'] = 'application/json'
    self.response.write(analysis.content)

class GetAuthor(webapp2.RequestHandler):
  @ndb.toplevel
  def get(self, author):
    self.response.headers['Access-Control-Allow-Origin'] = '*'

    author_object = Author.get_by_id(author.lower())
    if author_object is None or author_object.status != Status.ready:
      self.response.set_status(404)
      return

    metadata = json.loads(author_object.metadata)

    result = {
        'type': metadata['type'],
        'login': metadata['login'],
        'name': metadata['name'],
        'company': metadata['company'],
        'blog': metadata['blog'],
        'location': metadata['location'],
        'email': metadata['email'],
        'bio': metadata['bio'],
        'avatar_url': metadata['avatar_url'],
        'followers': metadata['followers'],
        'following': metadata['following'],
        'public_gists': metadata['public_gists'],
        'public_repos': metadata['public_repos'],
    }

    self.response.headers['Content-Type'] = 'application/json'
    self.response.write(json.dumps(result))

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
    repos_response = util.github_get('user/repos', access_token=access_token)
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

    response = util.github_get('repos', owner, repo, 'git/refs/' + tail)

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
    webapp2.Route(r'/api/meta/<author>', handler=GetAuthor),
    webapp2.Route(r'/api/meta/<owner>/<repo>', handler=GetMetadata),
    webapp2.Route(r'/api/meta/<owner>/<repo>/<ver>', handler=GetMetadata),
    webapp2.Route(r'/api/docs/<owner>/<repo>', handler=GetDocs),
    webapp2.Route(r'/api/docs/<owner>/<repo>/<ver>', handler=GetDocs),
    webapp2.Route(r'/api/dependencies/<owner>/<repo>', handler=GetDependencies),
    webapp2.Route(r'/api/dependencies/<owner>/<repo>/<version>', handler=GetDependencies),
    webapp2.Route(r'/api/collections/<owner>/<repo>', handler=GetCollections),
    webapp2.Route(r'/api/collections/<owner>/<repo>/<version>', handler=GetCollections),
    webapp2.Route(r'/api/search/<terms>', handler=SearchContents),
    webapp2.Route(r'/api/ondemand', handler=OnDemand),
], debug=True)
