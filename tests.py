#!/usr/bin/env python

import logging
import argparse
import os
import sys
import unittest

USAGE = """%prog SDK_PATH
Run unit tests.

SDK_PATH    Path to Google Cloud or Google App Engine SDK installation, usually
            ~/google_cloud_sdk"""

def main(sdk_path, test_path, test_pattern):
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

  logging.disable(logging.CRITICAL)

  from colour_runner import runner

  # Discover and run tests.
  suite = unittest.loader.TestLoader().discover(test_path, test_pattern)
  result = runner.ColourTextTestRunner(verbosity=2).run(suite)

  if not result.wasSuccessful():
    sys.exit(result)

if __name__ == '__main__':
  parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
  parser.add_argument(
      'sdk_path',
      help='The path to the Google App Engine SDK or the Google Cloud SDK.')
  parser.add_argument(
      '--test-path',
      help='The path to look for tests, defaults to the current directory.',
      default=os.getcwd())
  parser.add_argument(
      '--test-pattern',
      help='The file pattern for test modules, defaults to *_test.py.',
      default='*_test.py')

  args = parser.parse_args()

  main(args.sdk_path, args.test_path, args.test_pattern)
