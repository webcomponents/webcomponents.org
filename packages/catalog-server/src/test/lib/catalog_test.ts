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

  const {problems} = result as ReadablePackageVersion;
  assert.equal(problems!.length, 0);
});

test('Imports a package version with no problems', async () => {
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

  const packageVersion = getResult as ReadablePackageVersion;

  assert.equal(getResult.version, '0.0.0');
  // Assume that the manifest is byte-for-byte the same, which it is for now.
  // If this changes, use a deep comparison library
  assert.equal(packageVersion.customElementsManifest, cemSource);
  assert.equal(packageVersion.customElements?.length, 1);
  assert.equal(packageVersion.problems?.length, 0);
});

// TODO: add a test the same as the first to make sure we handle a
// import request for an existing package.

test.run();
