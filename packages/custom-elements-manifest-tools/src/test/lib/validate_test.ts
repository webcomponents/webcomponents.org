/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {suite} from 'uvu';
import * as assert from 'uvu/assert';

import {errorCodes, validatePackage} from '../../lib/validate.js';
import {InMemoryPackageFiles} from '../in-memory-package-files.js';

const test = suite('Custom element manifest utils tests');

test('customElements field missing', async () => {
  const files = new InMemoryPackageFiles('test-package', '1.0.0', {
    'package.json': `{}`,
  });
  const {problems} = await validatePackage({
    packageName: 'test-package',
    version: '1.0.0',
    files,
  });
  assert.equal(problems.length, 1);
  const problem = problems[0]!;
  assert.equal(problem.filePath, 'package.json');
  assert.equal(problem.code, errorCodes.customElements_field_missing);
});

test('manifest not found', async () => {
  const files = new InMemoryPackageFiles('test-package', '1.0.0', {
    'package.json': `{"customElements": "custom-elements.json"}`,
  });
  const {problems} = await validatePackage({
    packageName: 'test-package',
    version: '1.0.0',
    files,
  });
  assert.equal(problems.length, 1);
  const problem = problems[0]!;
  assert.equal(problem.filePath, 'package.json');
  assert.equal(problem.code, errorCodes.custom_elements_manifest_not_found);
});

test('manifest parse error', async () => {
  const files = new InMemoryPackageFiles('test-package', '1.0.0', {
    'package.json': `{"customElements": "custom-elements.json"}`,
    'custom-elements.json': `{`,
  });
  const {problems} = await validatePackage({
    packageName: 'test-package',
    version: '1.0.0',
    files,
  });
  assert.equal(problems.length, 1);
  const problem = problems[0]!;
  assert.equal(problem.filePath, 'custom-elements.json');
  assert.equal(problem.code, errorCodes.JSON_parse_error);
});

test('incompatible manifest version', async () => {
  const files = new InMemoryPackageFiles('test-package', '1.0.0', {
    'package.json': `{"customElements": "custom-elements.json"}`,
    'custom-elements.json': `{"schemaVersion": "2.0.0"}`,
  });
  const {problems} = await validatePackage({
    packageName: 'test-package',
    version: '1.0.0',
    files,
  });
  assert.equal(problems.length, 1);
  const problem = problems[0]!;
  assert.equal(problem.filePath, 'custom-elements.json');
  assert.equal(problem.code, errorCodes.invalid_schema_version);
});

test.run();
