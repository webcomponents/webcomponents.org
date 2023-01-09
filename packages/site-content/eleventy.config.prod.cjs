/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const eleventyNavigationPlugin = require('@11ty/eleventy-navigation');

module.exports = (eleventyConfig) => {
  eleventyConfig.addPlugin(eleventyNavigationPlugin);
  eleventyConfig.addPassthroughCopy('site/assets');
  eleventyConfig.addPassthroughCopy({'../site-client/bundled': 'js'});
  return {
    dir: {
      input: 'site',
      output: '_site',
    },
    pathPrefix: '',
  };
};
