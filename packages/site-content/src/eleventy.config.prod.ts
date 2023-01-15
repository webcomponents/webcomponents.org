/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import eleventyNavigationPlugin from '@11ty/eleventy-navigation';
import type {EleventyConfig, EleventyConfigResult} from '@11ty/eleventy';

module.exports = (eleventyConfig: EleventyConfig): EleventyConfigResult => {
  eleventyConfig.addPlugin(eleventyNavigationPlugin);
  eleventyConfig.addPassthroughCopy('site/assets');
  eleventyConfig.addPassthroughCopy({'../site-client/bundled': 'js'});
  return {
    dir: {
      input: 'site',
      output: '_site',
    },
  };
};
