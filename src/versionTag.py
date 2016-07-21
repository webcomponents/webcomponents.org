import re
import semver

expr = re.compile(r'^(v)?(\d+)\.(\d+)\.(\d+)$')
  
def isValid(tag):
  return expr.match(tag) is not None

def compare(a, b):
  a = expr.match(a)
  b = expr.match(b)
  result = cmp(int(a.group(2)), int(b.group(2)))
  if result != 0:
    return result
  result = cmp(int(a.group(3)), int(b.group(3)))
  if result != 0:
    return result
  result = cmp(int(a.group(4)), int(b.group(4)))
  if result != 0:
    return result
  return cmp(a.group(1), b.group(1))

def match(version, spec):
  if version[0] == 'v':
    version = version[1:]
  if spec[0] == '^':
    base = spec[1:]
    parsedBase = semver.parse(base)
    if parsedBase['major'] > 0:
      top = semver.bump_major(base)
    elif parsedBase['minor'] > 0:
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
