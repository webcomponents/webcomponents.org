/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  getModule,
  Version,
} from '@webcomponents/custom-elements-manifest-tools';
import {
  CustomElementDeclaration,
  CustomElementExport,
  Package,
} from 'custom-elements-manifest';
import {suite} from 'uvu';
import * as assert from 'uvu/assert';

import {FirestoreRepository} from '../../../lib/firestore/firestore-repository.js';

const test = suite('FirestoreRepository tests');

test('Limits element searches to a namespace', async () => {
  const manifest: Package = {
    schemaVersion: '1.0.0',
    readme: 'README.md',
    modules: [
      {
        kind: 'javascript-module',
        path: 'foo.js',
        exports: [
          {
            kind: 'custom-element-definition',
            name: 'x-foo',
            declaration: {
              name: 'FooElement',
            },
          },
        ],
        declarations: [
          {
            kind: 'class',
            customElement: true,
            tagName: 'x-foo',
            name: 'FooElement',
            members: [],
          },
        ],
      },
    ],
  };

  const module = getModule(manifest, 'foo.js')!;
  const customElementExport = module.exports![0] as CustomElementExport;
  const customElementDeclaration =
    module.declarations![0] as CustomElementDeclaration;

  const repo1 = new FirestoreRepository('firestore-repository-test-1');
  const repo2 = new FirestoreRepository('firestore-repository-test-2');

  const writeElement = async (repo: FirestoreRepository) =>
    repo.writeCustomElements(
      {name: 'foo', version: '1.0.0', description: 'test package'} as Version,
      [
        {
          package: manifest,
          module,
          export: customElementExport,
          declaration: customElementDeclaration,
          declarationReference: customElementExport.declaration,
        },
      ],
      ['latest'],
      'joe'
    );

  await Promise.all([writeElement(repo1), writeElement(repo2)]);
  const [result1, result2] = await Promise.all([
    repo1.queryElements({query: 'foo'}),
    repo2.queryElements({query: 'foo'}),
  ]);
  assert.equal(result1.length, 1);
  assert.equal(result2.length, 1);
});

test.run();
