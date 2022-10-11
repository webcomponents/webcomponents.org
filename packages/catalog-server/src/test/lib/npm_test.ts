/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {suite} from 'uvu';
import * as assert from 'uvu/assert';
import {distTagListToMap, distTagMapToList} from '../../lib/npm.js';

const test = suite('npm tests');

test('distTagMapToList', () => {
  const list = distTagMapToList({latest: '1.0.0', beta: '2.0.0'});
  assert.equal(list.length, 2);
  assert.equal(list[0]!.tag, 'latest');
  assert.equal(list[0]!.version, '1.0.0');
  assert.equal(list[1]!.tag, 'beta');
  assert.equal(list[1]!.version, '2.0.0');
});

test('distTagListToMap', () => {
  const map = distTagListToMap([
    {tag: 'latest', version: '1.0.0'},
    {tag: 'beta', version: '2.0.0'},
  ]);
  assert.equal(Object.entries(map).length, 2);
  assert.equal(map['latest'], '1.0.0');
  assert.equal(map['beta'], '2.0.0');
});

test.run();
