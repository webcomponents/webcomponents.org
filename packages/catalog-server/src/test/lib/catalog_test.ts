/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {suite} from 'uvu';
import * as assert from 'uvu/assert';
import {Catalog} from '../../lib/catalog.js';
import {InMemoryPackageFiles} from '@webcomponents/custom-elements-manifest-tools/test/in-memory-package-files.js';
import {FirestoreRepository} from '../../lib/firestore/firestore-repository.js';

const test = suite('Custom element manifest utils tests');

test('Imports a package with no problems', async () => {
  const packageName = 'test-1';
  const version = '0.0.0';
  const files = new InMemoryPackageFiles(packageName, version, {
    'package.json': `{
      "name": "test-1",
      "version": "0.0.0",
      "customElements": "custom-elements.json"
    }`,
    'custom-elements.json': `{
      "schemaVersion": "1.0.0",
      "modules": [
        {
          "kind": "javascript-module",
          "path": "foo.js",
          "exports": [
            {
              "kind": "js",
              "name": "FooElement",
              "declaration": {
                "name": "FooElement"
              }
            },
            {
              "kind": "custom-element-definition",
              "name": "foo-element",
              "declaration": {
                "name": "FooElement"
              }
            }
          ]
        }
      ],
      "declarations": [
        {
          "kind": "class",
          "customElement": true,
          "tagName": "my-element",
          "name": "FooElement",
          "superclass": {
            "name": "HTMLElement"
          }
        }
      ]
    }`,
  });
  const repository = new FirestoreRepository();
  const catalog = new Catalog({files, repository});
  const result = await catalog.importPackageVersion(packageName, version);
  const {problems} = result;
  console.log(problems);
  assert.equal(problems.length, 0);
});

// TODO: add a second test the same as the first to make sure we handle a
// second import request

test.run();
