/**
 * @license
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {suite} from 'uvu';
// eslint-disable-next-line import/extensions
import * as assert from 'uvu/assert';

const test = suite('Route tests');

const request = async (path: string) => fetch(`http://127.0.0.1:5450${path}`);

test('Finds a button', async () => {
  // Import lion-button
  assert.equal(
    (await request('/catalog/element/@lion/button/lion-button')).status,
    200
  );

  // Import sl-button
  assert.equal(
    (await request('/catalog/element/@shoelace-style/shoelace/sl-button'))
      .status,
    200
  );

  const response = await request('/catalog/search?query=button');
  assert.equal(response.status, 200);
  const result = await response.json();

  // Shoelace has a few buttons that all get imported
  assert.ok(result.elements.length > 2);
});

test.run();
