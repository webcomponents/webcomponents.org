/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */

import resolve from '@rollup/plugin-node-resolve';
import {terser} from 'rollup-plugin-terser';
import {readdirSync} from 'fs';

const terserOptions = {
  warnings: true,
  ecma: 2022,
  compress: {
    unsafe: true,
    // A second pass often squeezes out a few bytes.
    passes: 2,
  },
  output: {
    // Preserve @license and @preserve comments.
    comments: 'some',
  },
};

export default [
  {
    // Create a bundle for every entrypoint module.
    input: readdirSync(`${__dirname}/lib/entrypoints`)
      .filter((file) => file.endsWith('.js'))
      .map((file) => `lib/entrypoints/${file}`),
    output: {
      dir: 'bundled',
      format: 'esm',
      // Create some more logically named shared chunks, in particular for Lit
      // core. Helps ensure the network tab provides a nice readable breakdown
      // of where the bytes come from.
      manualChunks: (id) => {
        // The id is the full resolved path to the module in node_modules/
        // (which could be in this package, or in the root package). Remove the
        // node_modules/ path prefix to get a relative path which is just the
        // bare package name and module.
        const relative = id.replace(/^.*\/node_modules\//, '');
        if (
          relative.startsWith('lit/') ||
          relative.startsWith('lit-html/') ||
          relative.startsWith('lit-element/') ||
          relative.startsWith('@lit/reactive-element/') ||
          relative.startsWith('tslib/')
        ) {
          return 'lit';
        }
      },
    },
    plugins: [resolve(), terser(terserOptions)],
  },
];
