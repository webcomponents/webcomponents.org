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
  VersionStatus,
} from '@webcomponents/catalog-api/lib/schema.js';
import {fileURLToPath} from 'url';

const test = suite('Catalog tests');

const testPackage1Path = fileURLToPath(
  new URL('../test-packages/test-1/', import.meta.url)
);

test('Imports a package with no problems', async () => {
  const packageName = 'test-1';
  const version = '0.0.0';
  const files = new LocalFsPackageFiles({
    path: testPackage1Path,
    packageName,
    publishedVersions: ['0.0.0'],
    distTags: {
      latest: '0.0.0',
    },
  });
  const repository = new FirestoreRepository('catalog-test-1');
  const catalog = new Catalog({files, repository});
  await catalog.importPackage(packageName);

  // If there were validation problems, they will be on the package version,
  // so read that and check:
  const result = await catalog.getPackageVersion(packageName, version);
  assert.equal(isReadablePackageVersion(result), true);

  // TODO (justinfagnani): add assertion when we have the name
  // assert.equal((result as unknown as ReadablePackageVersion).name, 'test-1');

  // TODO (justinfagnani): add assertion when we have catalog.getPackageVersionProblems
  // const problems = await catalog.getPackageVersionProblems(packageName, version);
  // assert.equal(problems?.length, 0);
});

test('Gets package version data from imported package', async () => {
  const packageName = 'test-1';
  const version = '0.0.0';
  const files = new LocalFsPackageFiles({
    path: testPackage1Path,
    packageName,
    publishedVersions: ['0.0.0'],
    distTags: {
      latest: '0.0.0',
    },
  });
  const repository = new FirestoreRepository('catalog-test-2');
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

  const customElements = await catalog.getCustomElements(
    packageName,
    version,
    undefined
  );
  assert.equal(customElements?.length, 1);

  // TODO (justinfagnani): add assertion when we have catalog.getPackageVersionProblems
  // const problems = await catalog.getPackageVersionProblems(packageName, version);
  // assert.equal(problems?.length, 0);
});

// TODO: add a test the same as the first to make sure we handle a
// import request for an existing package.

test.run();
