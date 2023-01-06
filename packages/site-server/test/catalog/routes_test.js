/**
 * @license
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { suite } from "uvu";
import * as assert from "uvu/assert";
const test = suite("Route tests");
const request = async (path) => fetch(`http://127.0.0.1:5450${path}`);
test("Returns 404 for malformed element page URL", async () => {
  assert.equal((await request("/element/")).status, 404);
  assert.equal((await request("/element/@lion/button")).status, 404);
  assert.equal((await request("/element/chessboard-element")).status, 404);
  assert.equal((await request("/element/@lion/button/a/b")).status, 404);
  assert.equal((await request("/element/chessboard-element/a/b")).status, 404);
});
test.run();
