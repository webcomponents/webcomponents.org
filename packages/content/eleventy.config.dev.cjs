/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */

const fs = require('fs');
const pathlib = require('path');

module.exports = (eleventyConfig) => {
  symlinkForce('../assets', '_dev/assets');
  symlinkForce('../../client/lib/entrypoints', '_dev/js');
  return {
    dir: {
      input: 'site',
      output: '_dev',
    },
  };
};

function symlinkForce(target, path) {
  try {
    fs.unlinkSync(path);
  } catch (e) {
    if (e.code !== 'ENOENT') {
      throw e;
    }
  }
  fs.mkdirSync(pathlib.dirname(path), {recursive: true});
  fs.symlinkSync(target, path);
}
