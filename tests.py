#!/usr/bin/env python

import logging
import optparse
import os
import sys
import unittest

USAGE = """%prog SDK_PATH
Run unit tests.

SDK_PATH    Path to Google Cloud or Google App Engine SDK installation, usually
            ~/google_cloud_sdk"""

def main(sdk_path):
  # If the sdk path points to a google cloud sdk installation
  # then we should alter it to point to the GAE platform location.
  if os.path.exists(os.path.join(sdk_path, 'platform/google_appengine')):
    sys.path.insert(0, os.path.join(sdk_path, 'platform/google_appengine'))
  else:
    sys.path.insert(0, sdk_path)

  # Ensure that the google.appengine.* packages are available
  # in tests as well as all bundled third-party packages.
  import dev_appserver
  dev_appserver.fix_sys_path()

  # Loading appengine_config from the current project ensures that any
  # changes to configuration there are available to all tests (e.g.
  # sys.path modifications, namespaces, etc.)
  try:
    import appengine_config
    (appengine_config)
  except ImportError:
    print "Note: unable to import appengine_config."

  test_path = os.path.dirname(sys.modules[__name__].__file__)

  logging.disable(logging.CRITICAL)

  from colour_runner import runner

  # Discover and run tests.
  suite = unittest.loader.TestLoader().discover(test_path, pattern='*_test.py')
  result = runner.ColourTextTestRunner(verbosity=2).run(suite)

  if not result.wasSuccessful():
    sys.exit(result)

if __name__ == '__main__':
  parser = optparse.OptionParser(USAGE)
  options, args = parser.parse_args()
  if len(args) != 1:
    print 'Error: Exactly 1 arguments required.'
    parser.print_help()
    sys.exit(1)
  SDK_PATH = args[0]
  main(SDK_PATH)
