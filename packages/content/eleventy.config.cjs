/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */

module.exports = (eleventyConfig) => {
  eleventyConfig.addPassthroughCopy('site/assets');
  return {
    dir: {
      input: 'site',
      output: '_site',
    },
  };
};
