/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const litPlugin = require('@lit-labs/eleventy-plugin-lit');

module.exports = (eleventyConfig) => {
  eleventyConfig.addPassthroughCopy('site/assets');
  eleventyConfig.addPassthroughCopy({'../site-client/bundled': 'js'});

  eleventyConfig.addPlugin(litPlugin, {
    componentModules: ['../site-client/lib/components/wco-top-bar.js'],
  });

  return {
    dir: {
      input: 'site',
      output: '_site',
    },
  };
};
