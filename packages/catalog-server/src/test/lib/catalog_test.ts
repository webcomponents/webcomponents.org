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
import {
  ReadablePackageVersion,
  VersionStatus,
} from '@webcomponents/catalog-api/lib/schema.js';

const test = suite('Custom element manifest utils tests');

test('Imports a package with no problems', async () => {
  const packageName = 'test-1';
  const version = '0.0.0';
  const myDirname = new URL(import.meta.url).pathname;
  const files = new LocalFsPackageFiles(
    path.resolve(myDirname, '../../test-packages/test-1'),
    packageName,
    version
  );
  const repository = new FirestoreRepository();
  const catalog = new Catalog({files, repository});
  const result = await catalog.importPackageVersion(packageName, version);
  const {problems} = result;
  assert.equal(problems.length, 0);
});

test('Gets package version data from imported package', async () => {
  const packageName = 'test-1';
  const version = '0.0.0';
  const myDirname = new URL(import.meta.url).pathname;
  const files = new LocalFsPackageFiles(
    path.resolve(myDirname, '../../test-packages/test-1'),
    packageName,
    version
  );
  const repository = new FirestoreRepository();
  const catalog = new Catalog({files, repository});

  const result = await catalog.getPackageVersion(packageName, version);
  const cemSource = await files.getFile(
    packageName,
    version,
    'custom-elements.json'
  );

  assert.ok(result);
  assert.equal(result.status, VersionStatus.READY);
  if (result.status !== VersionStatus.READY) {
    throw new Error();
  }
  assert.equal(result.version, '0.0.0');
  // Assume that the manifest is byte-for-byte the same, which it is for now.
  // If this changes, use a deep comparison library
  assert.equal(result.customElementsManifest, cemSource);
  assert.equal(result.customElements?.length, 1);
  assert.equal(result.problems?.length, 0);
});

// TODO: add a test the same as the first to make sure we handle a
// import request for an existing package.

test.run();
