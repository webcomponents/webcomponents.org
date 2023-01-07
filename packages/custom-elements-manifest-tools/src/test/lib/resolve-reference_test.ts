/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {Package} from 'custom-elements-manifest/schema.js';
import {suite} from 'uvu';
// eslint-disable-next-line import/extensions
import * as assert from 'uvu/assert';
import {resolveReference} from '../../lib/resolve-reference.js';

const test = suite('resolveReference');

const pkg: Package = {
  schemaVersion: '1.0.0',
  modules: [
    {
      kind: 'javascript-module',
      path: 'module-1.js',
      exports: [
        {kind: 'js', name: 'a', declaration: {name: 'a'}},
        // A re-export:
        {
          kind: 'js',
          name: 'b',
          declaration: {name: 'b', module: '/module-2.js'},
        },
      ],
      declarations: [
        {
          kind: 'variable',
          name: 'a',
        },
      ],
    },
    {
      kind: 'javascript-module',
      path: 'module-2.js',
      exports: [{kind: 'js', name: 'b', declaration: {name: 'b'}}],
      declarations: [
        {
          kind: 'variable',
          name: 'b',
        },
        {
          kind: 'variable',
          name: 'c',
        },
      ],
    },
    {
      kind: 'javascript-module',
      path: 'x-foo.js',
      declarations: [],
      exports: [
        {
          kind: 'custom-element-definition',
          name: 'x-foo',
          declaration: {
            name: 'XFoo',
            module: '/src/components/x-foo.js',
          },
        },
      ],
    },
    {
      kind: 'javascript-module',
      path: 'src/components/x-foo.js',
      declarations: [
        {
          kind: 'class',
          name: 'XFoo',
          customElement: true,
        },
      ],
      exports: [
        {
          kind: 'js',
          name: 'XFoo',
          declaration: {
            name: 'XFoo',
            module: 'src/components/x-foo.js',
          },
        },
      ],
    },
  ],
};

test('resolves inner-module reference', () => {
  const module1 = pkg.modules[0]!;
  const variableA = module1.declarations![0]!;
  const result = resolveReference(
    pkg,
    module1,
    {name: 'a'},
    'test-package',
    '1.0.0'
  );
  assert.equal(result, variableA);
});

test('resolves cross-module export reference', () => {
  // A reference to an export should resolve to that export's declaration
  const module1 = pkg.modules[0]!;
  const module2 = pkg.modules[1]!;
  const variableB = module2.declarations![0]!;
  const result = resolveReference(
    pkg,
    module1,
    {name: 'b', module: 'module-2.js'},
    'test-package',
    '1.0.0'
  );
  assert.equal(result, variableB);
});

test('cross-module references must be exported', () => {
  // A reference to an export should resolve to that export's declaration
  const module1 = pkg.modules[0]!;
  const result = resolveReference(
    pkg,
    module1,
    {name: 'c', module: 'module-2.js'},
    'test-package',
    '1.0.0'
  );
  assert.equal(result, undefined);
});

test('resolves a re-exported reference', () => {
  const module2 = pkg.modules[1]!;
  const variableB = module2.declarations![0]!;
  const result = resolveReference(
    pkg,
    // Using module2 so we resolve this from outside of module-1, which is
    // re-exporting `b`
    module2,
    {name: 'b', module: 'module-1.js'},
    'test-package',
    '1.0.0'
  );
  assert.equal(result, variableB);
});

test('cross-package references are unsupported', () => {
  // A reference to an export should resolve to that export's declaration
  const module1 = pkg.modules[0]!;
  const result = resolveReference(
    pkg,
    module1,
    {name: 'x', module: 'foo.js', package: 'foo'},
    'test-package',
    '1.0.0'
  );
  assert.equal(result, undefined);
});

test(`resolves a custom element defintion to it's declaration`, () => {
  const definitionModule = pkg.modules.find((m) => m.path === 'x-foo.js')!;
  const elementExport = definitionModule.exports![0];
  const declarationReference = elementExport!.declaration;
  const result = resolveReference(
    pkg,
    definitionModule,
    declarationReference,
    'test-package',
    '1.0.0'
  );
  console.log('result', result);
  assert.ok(result);
});

test.run();
