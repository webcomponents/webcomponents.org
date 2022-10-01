/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {readFile} from 'fs/promises';
import * as fs from 'fs/promises';
import {fileURLToPath} from 'url';
import * as path from 'path';

import {suite} from 'uvu';
import * as assert from 'uvu/assert';

import type {Package} from 'custom-elements-manifest/schema.js';
import {getCustomElements} from '../../lib/get-custom-elements.js';

const test = suite('get-custom-elements');

const manifest: Package = {
  schemaVersion: '1.0.0',
  readme: 'README.md',
  modules: [
    {
      kind: 'javascript-module',
      path: 'my-project/my-element.js',
      declarations: [
        {
          kind: 'class',
          customElement: true,
          tagName: 'my-element',
          description: 'This is the description of the class',
          name: 'MyElement',
          members: [],
        },
      ],
      exports: [
        {
          kind: 'js',
          name: 'MyElement',
          declaration: {
            name: 'MyElement',
          },
        },
        {
          kind: 'custom-element-definition',
          name: 'my-element',
          declaration: {
            name: 'MyElement',
          },
        },
      ],
    },
  ],
};

test('Gets an element from a valid manifest', () => {
  const customElements = getCustomElements(manifest, 'test', '0.0.0');
  assert.equal(customElements.length, 1);
  assert.equal(customElements[0]?.declaration.name, 'MyElement');
  assert.equal(customElements[0]?.export.name, 'my-element');
  assert.equal(customElements[0]?.module.path, 'my-project/my-element.js');
  assert.equal(customElements[0]?.package, manifest);
});

test('Gets an element from a valid manifest, with a reference that includes the module', () => {
  // This is the same test as before, bet the custom-element-definition reference
  // includes the module path. This looks like a non-local reference, but it's local.
  const newManifest = {
    ...manifest,
  };
  newManifest.modules[0]!.exports![1]!.declaration.module =
    newManifest.modules[0]!.path;
  console.log(newManifest.modules[0]!.exports![1]!.declaration.module);

  const customElements = getCustomElements(manifest, 'test', '0.0.0');
  assert.equal(customElements.length, 1);
  assert.equal(customElements[0]?.declaration.name, 'MyElement');
  assert.equal(customElements[0]?.export.name, 'my-element');
  assert.equal(customElements[0]?.module.path, 'my-project/my-element.js');
  assert.equal(customElements[0]?.package, manifest);
});

test('Get elements from Shoelace', async () => {
  console.log('#### What is happening on CI? ####');
  console.log('import.meta.url', import.meta.url);
  console.log('fileURLToPath(import.meta.url)', fileURLToPath(import.meta.url));
  console.log('process.cwd()', process.cwd());

  const resolvedTestDataPath = path.resolve(
    fileURLToPath(import.meta.url),
    '..',
    '..',
    'test-data',
  );

  try {
    const testDataDir = await fs.readdir(resolvedTestDataPath);
    console.log('testDataDir', testDataDir);
  } catch(e) {
    console.error('testDataDir error');
    console.error(e);
  }

  const resolvedManifestPath = path.resolve(
    fileURLToPath(import.meta.url),
    '..',
    '..',
    'test-data',
    'shoelace-2.0.0-beta.83.json'
  );

  const manifestPath = fileURLToPath(
    new URL('../test-data/shoelace-2.0.0-beta.83.json', import.meta.url)
  );

  console.log('manifestPath', manifestPath);
  console.log('resolvedManifestPath', resolvedManifestPath);

  try {
    const stat = await fs.stat(manifestPath);
    console.log('manifestPath stat', stat)
  } catch (e) {
    console.error('manifestPath stat error');
    console.error(e);
  }

  try {
    const resolvedStat = await fs.stat(resolvedManifestPath);
    console.log('resolvedManifestPath stat', resolvedStat)
  } catch (e) {
    console.error('resolvedManifestPath stat error');
    console.error(e);
  }

  const manifestSource = await readFile(manifestPath, 'utf-8');
  const manifest = JSON.parse(manifestSource);
  const customElements = getCustomElements(
    manifest,
    '@shoelace-style/shoelace',
    '2.0.0-beta.83'
  );
  assert.equal(customElements.length, 54);
});

test.run();
