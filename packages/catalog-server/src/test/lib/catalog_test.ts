/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {suite} from 'uvu';
import * as assert from 'uvu/assert';
import {Catalog} from '../../lib/catalog.js';
import {LocalFsPackageFiles} from '@webcomponents/custom-elements-manifest-tools/test/local-fs-package-files.js';
import {FirestoreRepository} from '../../lib/firestore/firestore-repository.js';
import * as path from 'path';
import {
  isReadablePackageVersion,
  ReadablePackageVersion,
  VersionStatus,
} from '@webcomponents/catalog-api/lib/schema.js';

const test = suite('Catalog tests');

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
  await catalog.importPackage(packageName);

  // If there were validation problems, they will be on the package version,
  // so read that and check:
  const result = await catalog.getPackageVersion(packageName, version);
  assert.equal(isReadablePackageVersion(result), true);

  // TODO (justinfagnani): add assertion when we have the name
  // assert.equal((result as unknown as ReadablePackageVersion).name, 'test-1');

  const {problems} = result as ReadablePackageVersion;
  assert.equal(problems?.length, 0);
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
  const repository = new FirestoreRepository('package-version-tests');
  const catalog = new Catalog({files, repository});
  const importResult = await catalog.importPackageVersion(packageName, version);
  const {problems} = importResult;
  assert.equal(problems.length, 0);

  const getResult = await catalog.getPackageVersion(packageName, version);
  const cemSource = await files.getFile(
    packageName,
    version,
    'custom-elements.json'
  );

  assert.ok(getResult);
  assert.equal(getResult.status, VersionStatus.READY);
  if (getResult.status !== VersionStatus.READY) {
    throw new Error();
  }
  assert.equal(getResult.version, '0.0.0');
  // Assume that the manifest is byte-for-byte the same, which it is for now.
  // If this changes, use a deep comparison library
  assert.equal(getResult.customElementsManifest, cemSource);
  assert.equal(getResult.customElements?.length, 1);
  assert.equal(getResult.problems?.length, 0);
});

// TODO: add a test the same as the first to make sure we handle a
// import request for an existing package.

test.run();
