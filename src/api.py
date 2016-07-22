from google.appengine.ext import ndb
from google.appengine.api import search

from dataModel import Library, Version, Content, CollectionReference
import versionTag

import json
import re
import webapp2

time_format = '%Y-%m-%dT%H:%M:%SZ'

def briefMetaDataFromSearchDocument(document):
  result = {}
  for field in document.fields:
    if field.name == 'full_name':
      match = re.match(r'(.*)/(.*)', field.value)
      result['owner'] = match.group(1)
      result['repo'] = match.group(2)
    if field.name in ['owner', 'repo', 'repoparts']:
      continue
    if field.name == 'updated_at':
      result[field.name] = field.value.strftime(time_format)
    else:
      result[field.name] = field.value
  return result

# TODO(shans): This is expensive. We can
# a) eliminate it in the common case where the requested version is the most recent, as we can
#    directly extract the metadata from the index using briefMetaDataFromSearchDocument.
# b) amortize the rare case where the requested version is not the most recent, by indexing that
#    version once into a secondary index (which we don't search over), *then* using
#    briefMetaDataFromSearchDocument.
def briefMetaDataFromDatastore(owner, repo, version):
  key = ndb.Key(Library, "%s/%s" % (owner.lower(), repo.lower()))
  library = key.get(read_policy=ndb.EVENTUAL_CONSISTENCY)
  metadata = json.loads(library.metadata)
  bowerKey = ndb.Key(Library, "%s/%s" % (owner.lower(), repo.lower()), Version, version, Content, "bower.json")
  bower = bowerKey.get(read_policy=ndb.EVENTUAL_CONSISTENCY)
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
    searchResults = index.search(search.Query(query_string=terms,
        options=search.QueryOptions(limit=limit,offset=offset)))
    results = []
    for result in searchResults.results:
      results.append(briefMetaDataFromSearchDocument(result))
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
        bowerJson = json.loads(bower.content)
      except:
        bowerJson = {}
    readme = Content.get_by_id('readme.html', parent=version.key, read_policy=ndb.EVENTUAL_CONSISTENCY)
    fullNameMatch = re.match(r'(.*)/(.*)', metadata['full_name'])
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
      'owner': fullNameMatch.groups()[0],
      'repo': fullNameMatch.groups()[1],
      'bower': None if bower is None else {
        'description': bowerJson.get('description', ''),
        'license': bowerJson.get('license', ''),
        'dependencies': bowerJson.get('dependencies', []),
        'keywords': bowerJson.get('keywords', []),
      },
      'collections': []
    }
    for collection in library.collections:
      if not versionTag.match(ver, collection.semver):
        continue
      collectionVersion = collection.version.id()
      collectionLibrary = collection.version.parent().get()
      collectionMetadata = json.loads(collectionLibrary.metadata)
      collectionNameMatch = re.match(r'(.*)/(.*)', collectionMetadata['full_name'])
      result['collections'].append({
        'owner': collectionNameMatch.groups()[0],
        'repo': collectionNameMatch.groups()[1],
        'version': collectionVersion
      })
    if library.kind == 'collection':
      dependencies = []
      versionFutures = []
      for dep in version.dependencies:
        parsedDep = Dependency.fromString(dep)
        depKey = ndb.Key(Library, "%s/%s" % (parsedDep.owner.lower(), parsedDep.repo.lower()))
        versionFutures.append(Library.versionsForKey_async(depKey))
      for i, dep in enumerate(version.dependencies):
        parsedDep = Dependency.fromString(dep)
        versions = versionFutures[i].get_result()
        versions.reverse()
        while len(versions) > 0 and not versionTag.match(versions[0], parsedDep.version):
          versions.pop()
        if len(versions) == 0:
          dependencies.append({'error': 'unsatisfyable dependency',
              'owner': parsedDep.owner, 'repo': parsedDep.repo, 'versionSpec': parsedDep.version})
        else:
          dependencies.append(briefMetaDataFromDatastore(parsedDep.owner, parsedDep.repo, versions[0]))
      result['dependencies'] = dependencies
    self.response.headers['Access-Control-Allow-Origin'] = '*'
    self.response.headers['Content-Type'] = 'application/json'
    self.response.write(json.dumps(result))

class GetHydroData(webapp2.RequestHandler):
  def get(self, owner, repo, ver = None):
    # TODO: Share all of this boilerplate between GetDataMeta and GetHydroData
    self.response.headers['Access-Control-Allow-Origin'] = '*'
    owner = owner.lower()
    repo = repo.lower()
    libraryKey = ndb.Key(Library, '%s/%s' % (owner, repo))
    # TODO: version shouldn't be optional here
    if ver is None:
      versions = Version.query(ancestor=libraryKey).map(lambda v: v.key.id())
      versions.sort(versionTag.compare)
      if versions == []:
        self.response.set_status(404)
        return
      ver = versions[-1]
    versionKey = ndb.Key(Library, '%s/%s' % (owner, repo), Version, ver)
    hydro = Content.get_by_id('hydrolyzer', parent=versionKey, read_policy=ndb.EVENTUAL_CONSISTENCY)
    if hydro is None:
      self.response.set_status(404)
      return

    self.response.headers['Content-Type'] = 'application/json'
    self.response.write(hydro.content)

class GetDependencies(webapp2.RequestHandler):
  def get(self, owner, repo, ver = None):
    self.response.headers['Access-Control-Allow-Origin'] = '*'

    owner = owner.lower()
    repo = repo.lower()
    versionKey = ndb.Key(Library, '%s/%s' % (owner, repo), Version, ver)

    hydro = Content.get_by_id('hydrolyzer', parent=versionKey, read_policy=ndb.EVENTUAL_CONSISTENCY)
    if hydro is None:
      self.response.set_status(404)
      return

    dependencies = json.loads(hydro.content).get('bowerDependencies', None)
    if dependencies is None:
      self.response.set_status(404)
      return

    self.response.headers['Content-Type'] = 'application/json'
    self.response.write(json.dumps(dependencies))

app = webapp2.WSGIApplication([
    webapp2.Route(r'/api/meta/<owner>/<repo>', handler=GetDataMeta),
    webapp2.Route(r'/api/meta/<owner>/<repo>/<ver>', handler=GetDataMeta),
    webapp2.Route(r'/api/docs/<owner>/<repo>', handler=GetHydroData),
    webapp2.Route(r'/api/docs/<owner>/<repo>/<ver>', handler=GetHydroData),
    webapp2.Route(r'/api/deps/<owner>/<repo>/<ver>', handler=GetDependencies),
    webapp2.Route(r'/api/search/<terms>', handler=SearchContents, name='search'),
], debug=True)
