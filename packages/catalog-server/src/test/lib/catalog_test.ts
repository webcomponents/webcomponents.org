/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {suite} from 'uvu';
import * as assert from 'uvu/assert';
import {Catalog} from '../../lib/catalog.js';
import {LocalFsPackageFiles} from '@webcomponents/custom-elements-manifest-tools/test/local-fs-package-files.js';
import {FirestoreRepository} from '../../lib/firestore/firestore-repository.js';
import * as path from 'path';

const test = suite('Custom element manifest utils tests');

test('Imports a package with no problems', async () => {
  const packageName = 'test-1';
  const version = '0.0.0';
  const myDirname = new URL(import.meta.url).pathname;
  const files = new LocalFsPackageFiles(path.resolve(myDirname, '../../test-packages/test-1'), packageName, version);
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
