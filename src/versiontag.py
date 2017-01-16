import re
import semantic_version

X_RANGE = re.compile(r'(\.[*xX])+$')
BAD_TILDE = re.compile(r'^~\d+$')

def is_valid(tag):
  try:
    parse(tag)
    return True
  except ValueError:
    return False

def is_prerelease(tag):
  return '-' in tag

def compare(version1, version2):
  v1 = parse(version1)
  v2 = parse(version2)
  if v1 > v2:
    return 1
  elif v2 > v1:
    return -1
  else:
    return 0

def match(version, spec):
  if spec == '*' or spec == 'master':
    return True
  if X_RANGE.search(spec):
    spec = '~' + X_RANGE.sub('', spec)
  # semantic_version fails with '~1'...
  if BAD_TILDE.search(spec):
    main = spec[1:]
    spec = '>=%s,<%d' % (main, int(main) + 1)
  if version[0] == 'v':
    version = version[1:]
  try:
    return semantic_version.match(spec, version)
  except ValueError:
    # If the spec is malformed or we don't support it.
    return False

def parse(version):
  if version[0] == 'v':
    version = version[1:]
  return semantic_version.Version(version)

def categorize(version, existing_versions):
  if existing_versions == [] or not is_valid(version):
    return 'unknown'

  if is_prerelease(version):
    return 'pre-release'

  existing_versions = list(existing_versions)
  existing_versions.sort(compare)
  existing_versions.reverse()

  for existing_version in existing_versions:
    if compare(version, existing_version) > 0:
      previous = existing_version
      break
  else:
    return 'unknown'

  parsed = parse(version)
  parsed_previous = parse(previous)

  if parsed.major > parsed_previous.major:
    return 'major'

  if parsed.minor > parsed_previous.minor:
    return 'minor'

  return 'patch'

def default_version(versions):
  """Returns the default version - the latest stable version,
  or the latests pre-release if all versions are pre-release.
  Assumes input is sorted.
  """
  prerelease_result = None
  version_result = None
  for version in versions:
    if is_prerelease(version):
      prerelease_result = version
    else:
      version_result = version
  if version_result is None:
    version_result = prerelease_result
  return version_result
