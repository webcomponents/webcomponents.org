import re
import semver

EXPR = re.compile(r'^(v)?(\d+)\.(\d+)\.(\d+)$')

def is_valid(tag):
  return EXPR.match(tag) is not None

def compare(version1, version2):
  version1 = EXPR.match(version1)
  version2 = EXPR.match(version2)
  result = cmp(int(version1.group(2)), int(version2.group(2)))
  if result != 0:
    return result
  result = cmp(int(version1.group(3)), int(version2.group(3)))
  if result != 0:
    return result
  result = cmp(int(version1.group(4)), int(version2.group(4)))
  if result != 0:
    return result
  return cmp(version1.group(1), version2.group(1))

def match(version, spec):
  if spec == '*' or spec == 'master':
    return True
  if version[0] == 'v':
    version = version[1:]
  if spec[0] == '^':
    base = spec[1:]
    parsed_base = semver.parse(base)
    if parsed_base['major'] > 0:
      top = semver.bump_major(base)
    elif parsed_base['minor'] > 0:
      top = semver.bump_minor(base)
    else:
      top = semver.bump_patch(base)
    return semver.match(version, ">="+base) and semver.match(version, "<="+top)
  else:
    try:
      return semver.match(version, spec)
    except ValueError:
      # this happens when the spec isn't an expression, in which case we need an exact match
      return semver.parse(version) == semver.parse(spec)
