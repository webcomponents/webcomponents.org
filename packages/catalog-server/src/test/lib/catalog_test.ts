/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {suite} from 'uvu';
// eslint-disable-next-line import/extensions
import * as assert from 'uvu/assert';
import {Catalog} from '../../lib/catalog.js';
import {LocalFsPackageFiles} from '@webcomponents/custom-elements-manifest-tools/test/local-fs-package-files.js';
import {FirestoreRepository} from '../../lib/firestore/firestore-repository.js';
import {
  isReadablePackage,
  isReadablePackageVersion,
  PackageStatus,
  ReadablePackageInfo,
  ReadablePackageVersion,
  VersionStatus,
} from '@webcomponents/catalog-api/lib/schema.js';
import {fileURLToPath} from 'url';
import {Temporal} from '@js-temporal/polyfill';
import {
  getModule,
  parseReferenceString,
  resolveReference,
} from '@webcomponents/custom-elements-manifest-tools';

const test = suite('Catalog tests');

const testPackage1Path = fileURLToPath(
  new URL('../test-packages/test-1/', import.meta.url)
);
const testPackage2Path = fileURLToPath(
  new URL('../test-packages/test-2/', import.meta.url)
);

// A set of import, fetch, search tests that use the same data
const TEST_SEQUENCE_ONE = 'test-data-1';

// Other tests than can run independently
const TEST_SEQUENCE_TWO = 'test-data-2';
const TEST_SEQUENCE_THREE = 'test-data-3';

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
  const repository = new FirestoreRepository(TEST_SEQUENCE_ONE);
  const catalog = new Catalog({files, repository});
  const importResult = await catalog.importPackage(packageName);

  assert.equal(isReadablePackage(importResult.packageInfo), true);
  const packageInfo = importResult.packageInfo as ReadablePackageInfo;

  // Check for dist-tags
  assert.equal(
    packageInfo.distTags.find((t) => t.tag === 'latest')?.version,
    '0.0.0'
  );

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

test('A second import does nothing', async () => {
  const packageName = 'test-1';
  const files = new LocalFsPackageFiles({
    path: testPackage1Path,
    packageName,
    publishedVersions: ['0.0.0'],
    distTags: {
      latest: '0.0.0',
    },
  });
  // This must use the same namespace as in the previous test
  const repository = new FirestoreRepository(TEST_SEQUENCE_ONE);
  const catalog = new Catalog({files, repository});
  const importResult = await catalog.importPackage(packageName);

  // importPackage() returns an empty object if there was no import to
  // be performed.
  assert.equal(importResult.packageInfo, undefined);
  assert.equal(importResult.packageVersion, undefined);
  assert.equal(importResult.problems, undefined);
});

test('Full text search', async () => {
  const packageName = 'test-1';
  const files = new LocalFsPackageFiles({
    path: testPackage1Path,
    packageName,
    publishedVersions: ['0.0.0'],
    distTags: {
      latest: '0.0.0',
    },
  });
  // This must use the same namespace as in the previous test
  const repository = new FirestoreRepository(TEST_SEQUENCE_ONE);
  const catalog = new Catalog({files, repository});

  // Use a term in the package description - it should match all elements
  let result = await catalog.queryElements({query: 'cool'});
  assert.equal(result.length, 2);

  // Use a term in an element description
  result = await catalog.queryElements({query: 'incredible'});
  assert.equal(result.length, 1);

  // Use a term not found
  result = await catalog.queryElements({query: 'jandgslwijd'});
  assert.equal(result.length, 0);

  // Use an element name
  result = await catalog.queryElements({query: '"foo-element"'});
  // TODO (justinfagnani): this isn't what we want. We really just want
  // The element <foo-element> to be returned, but the tokenizer we're
  // using is splitting "foo-element" into ["foo", "element"] and "element"
  // is matching against bar-element's search terms.
  // If we keep our own search index, we'll want to use or write a tokenizer
  // that preserves quoted sections for exact matches:
  // http://naturalnode.github.io/natural/Tokenizers.html
  assert.equal(result.length, 2);

  // Use part of an element name
  result = await catalog.queryElements({query: 'element'});
  assert.equal(result.length, 2);

  // Use a package name
  result = await catalog.queryElements({query: 'test-1'});
  assert.equal(result.length, 2);
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
  const repository = new FirestoreRepository(TEST_SEQUENCE_TWO);
  const catalog = new Catalog({files, repository});
  const importResult = await catalog.importPackageVersion(packageName, version);
  const {problems} = importResult;
  assert.equal(problems?.length, 0, 'problems.length');

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
  assert.equal(customElements?.length, 2);

  // TODO (justinfagnani): add assertion when we have catalog.getPackageVersionProblems
  // const problems = await catalog.getPackageVersionProblems(packageName, version);
  // assert.equal(problems?.length, 0);
});

test('Updates a package', async () => {
  const packageName = 'test-1';
  const files = new LocalFsPackageFiles({
    path: testPackage1Path,
    packageName,
    publishedVersions: ['0.0.0', '1.0.0'],
    distTags: {
      latest: '1.0.0',
    },
  });

  // This must use the same namespace as in the first (import) test
  const repository = new FirestoreRepository(TEST_SEQUENCE_ONE);
  const catalog = new Catalog({files, repository});
  const importResult = await catalog.importPackage(
    packageName,
    Temporal.Duration.from({nanoseconds: 1})
  );

  assert.ok(importResult.packageInfo);
  assert.ok(importResult.packageVersion);
  assert.equal(isReadablePackageVersion(importResult.packageVersion), true);

  const packageInfo = importResult.packageInfo as ReadablePackageInfo;
  const packageVersion = importResult.packageVersion as ReadablePackageVersion;

  // Check for dist-tags
  assert.equal(
    packageInfo.distTags.find((t) => t.tag === 'latest')?.version,
    '1.0.0'
  );
  assert.equal(
    packageVersion.distTags.find((t) => t === 'latest'),
    'latest'
  );

  // Make sure we can get the new version with 'latest'
  const result = await catalog.getPackageVersion(packageName, 'latest');
  assert.equal(isReadablePackageVersion(result), true);
});

test('Imports a package with separate define and implementation modules', async () => {
  const packageName = 'test-2';
  const version = '1.0.0';
  const files = new LocalFsPackageFiles({
    path: testPackage2Path,
    packageName,
    publishedVersions: ['1.0.0'],
    distTags: {
      latest: '1.0.0',
    },
  });
  const repository = new FirestoreRepository(TEST_SEQUENCE_THREE);
  const catalog = new Catalog({files, repository});
  await catalog.importPackage(packageName);

  const packageVersion = (await catalog.getPackageVersion(
    packageName,
    version
  )) as ReadablePackageVersion;

  const customElements = await catalog.getCustomElements(
    packageName,
    version,
    undefined
  );

  assert.ok(packageVersion.customElementsManifest);
  const manifest =
    packageVersion.customElementsManifest !== undefined &&
    JSON.parse(packageVersion.customElementsManifest);

  assert.ok(customElements);
  const fooElement = customElements.find((c) => c.tagName === 'foo-element');
  assert.ok(fooElement);
  assert.ok(fooElement.declaration);

  const declarationRefString = fooElement.declaration;
  const declarationRef = parseReferenceString(declarationRefString);
  assert.ok(declarationRef.module);

  const module = getModule(manifest, declarationRef.module);
  assert.ok(module);

  const declaration = resolveReference(
    manifest,
    module,
    declarationRef,
    packageName,
    ''
  );
  assert.ok(declaration);
});

test('Imports a package with no custom elements manifest', async () => {
  const packageName = 'no-elements';
  const packagePath = fileURLToPath(
    new URL('../test-packages/no-elements/', import.meta.url)
  );
  const files = new LocalFsPackageFiles({
    path: packagePath,
    packageName,
    publishedVersions: ['1.0.0'],
    distTags: {
      latest: '1.0.0',
    },
  });
  const repository = new FirestoreRepository(TEST_SEQUENCE_THREE);
  const catalog = new Catalog({files, repository});
  const importResult = await catalog.importPackage(packageName);

  assert.equal(importResult.problems?.length, 1);
  // The package is "readable" in that the latest version was imported,
  // but the latest version will be invalid
  assert.equal(importResult.packageInfo?.status, PackageStatus.READY);
  assert.ok(importResult.packageVersion);
  assert.equal(importResult.packageVersion?.status, VersionStatus.INVALID);
});

test('Imports a package with missing custom elements manifest', async () => {
  const packageName = 'manifest-not-found';
  const packagePath = fileURLToPath(
    new URL('../test-packages/manifest-not-found/', import.meta.url)
  );
  const files = new LocalFsPackageFiles({
    path: packagePath,
    packageName,
    publishedVersions: ['1.0.0'],
    distTags: {
      latest: '1.0.0',
    },
  });
  const repository = new FirestoreRepository(TEST_SEQUENCE_THREE);
  const catalog = new Catalog({files, repository});
  const importResult = await catalog.importPackage(packageName);

  assert.equal(importResult.problems?.length, 1, 'problems.length');
  // The package is "readable" in that the latest version was imported,
  // but the latest version will be invalid
  assert.equal(importResult.packageInfo?.status, PackageStatus.READY);
  assert.ok(importResult.packageVersion);
  assert.equal(importResult.packageVersion?.status, VersionStatus.INVALID);
});

test('Imports a non-existent package', async () => {
  const packageName = 'not-found';
  const files = new LocalFsPackageFiles({
    path: 'some-other-package',
    // This will cause getPackageMetadata('not-found') to 404
    packageName: 'some-other-package',
    publishedVersions: ['1.0.0'],
    distTags: {
      latest: '1.0.0',
    },
  });
  const repository = new FirestoreRepository(TEST_SEQUENCE_THREE);
  const catalog = new Catalog({files, repository});
  const importResult = await catalog.importPackage(packageName);

  // We don't create a ValidationProblem for a not found package, since
  // it would repeat the information of the status.
  assert.equal(importResult.problems, undefined);
  assert.equal(importResult.packageInfo?.status, PackageStatus.NOT_FOUND);
});

test('Imports a large manifest', async () => {
  const packageName = 'large-manifest';
  const packagePath = fileURLToPath(
    new URL('../test-packages/large-manifest/', import.meta.url)
  );

  const files = new LocalFsPackageFiles({
    path: packagePath,
    packageName,
    publishedVersions: ['1.0.0'],
    distTags: {
      latest: '1.0.0',
    },
  });
  const repository = new FirestoreRepository(TEST_SEQUENCE_THREE);
  const catalog = new Catalog({files, repository});
  const importResult = await catalog.importPackage(packageName);

  assert.equal(importResult.problems ?? [], []);
  assert.equal(importResult.packageInfo?.status, PackageStatus.READY);

  assert.ok(importResult.packageVersion);
  assert.equal(importResult.packageVersion.status, VersionStatus.READY);
  const manifest = (importResult.packageVersion as ReadablePackageVersion)
    .customElementsManifest;
  assert.ok(manifest);
  const parsedManifest = JSON.parse(manifest);
  assert.equal(parsedManifest.schemaVersion, '1.0.0');

  // Check that getting the version through getPackageVersion() decompresses
  const packageVersion2 = await catalog.getPackageVersion(packageName, '1.0.0');
  const manifest2 = (packageVersion2 as ReadablePackageVersion)
    .customElementsManifest;
  assert.ok(manifest2);
  const parsedManifest2 = JSON.parse(manifest2);
  assert.equal(parsedManifest2.schemaVersion, '1.0.0');
});

test.run();
