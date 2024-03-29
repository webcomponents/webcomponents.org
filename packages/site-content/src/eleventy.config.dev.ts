/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import pathlib from 'path';
import eleventyNavigationPlugin from '@11ty/eleventy-navigation';
import type {EleventyConfig, EleventyConfigResult} from '@11ty/eleventy';

module.exports = (eleventyConfig: EleventyConfig): EleventyConfigResult => {
  eleventyConfig.addPlugin(eleventyNavigationPlugin);
  symlinkForce('../assets', '_dev/assets');
  symlinkForce('../../site-client/lib/pages', '_dev/js');
  return {
    dir: {
      input: 'site',
      output: '_dev',
    },
  };
};

/**
 * Create parent directories because  Eleventy doesn't create the output
 * directory before invoking the config function, and also in case we want a
 * symlink in a child directory.
 *
 * Delete existing symlinks so that if we use Eleventy's built-in watch mode
 * (which doesn't clean output first), we won't get an error because the symlink
 * already exists.
 */
function symlinkForce(target: string, path: string) {
  try {
    fs.unlinkSync(path);
  } catch (e) {
    if ((e as {code?: string}).code !== 'ENOENT') {
      throw e;
    }
  }
  fs.mkdirSync(pathlib.dirname(path), {recursive: true});
  fs.symlinkSync(target, path);
}
