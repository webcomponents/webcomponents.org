/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {suite} from 'uvu';
import * as assert from 'uvu/assert';

import {errorCodes, PackageFiles, validatePackage} from '../../lib/validate.js';

const test = suite('Custom element manifest utils tests');

interface FileTree {
  [name: string]: string | FileTree;
}

class MemoryFiles implements PackageFiles {
  packageName: string;
  version: string;
  files: FileTree;

  constructor(packageName: string, version: string, files: FileTree) {
    this.packageName = packageName;
    this.version = version;
    this.files = files;
  }

  async getFile(
    packageName: string,
    version: string,
    filePath: string
  ): Promise<string> {
    if (packageName !== this.packageName) {
      throw new Error(`Invalid package name: ${packageName}`);
    }
    if (version !== this.version) {
      throw new Error(`Invalid package version: ${version}`);
    }
    const segments = filePath.split('/');
    let file: FileTree | string | undefined = this.files;
    while (
      segments.length > 0 &&
      typeof file !== 'string' &&
      file !== undefined
    ) {
      file = file[segments.shift()!];
    }
    if (typeof file !== 'string') {
      throw new Error(`File not found: ${filePath}`);
    }
    return file;
  }
}

const collect = async <T>(gen: AsyncGenerator<T>) => {
  const results: Array<T> = [];
  for await (const r of gen) {
    results.push(r);
  }
  return results;
};

test('customElements field missing', async () => {
  const files = new MemoryFiles('test-package', '1.0.0', {
    'package.json': `{}`,
  });
  const problems = await collect(
    validatePackage({
      packageName: 'test-package',
      version: '1.0.0',
      files,
    })
  );
  assert.equal(problems.length, 1);
  const problem = problems[0]!;
  assert.equal(problem.filePath, 'package.json');
  assert.equal(problem.code, errorCodes.customElements_field_missing);
});

test('manifest not found', async () => {
  const files = new MemoryFiles('test-package', '1.0.0', {
    'package.json': `{"customElements": "custom-elements.json"}`,
  });
  const problems = await collect(
    validatePackage({
      packageName: 'test-package',
      version: '1.0.0',
      files,
    })
  );
  assert.equal(problems.length, 1);
  const problem = problems[0]!;
  assert.equal(problem.filePath, 'package.json');
  assert.equal(problem.code, errorCodes.custom_elements_manifest_not_found);
});

test('manifest parse error', async () => {
  const files = new MemoryFiles('test-package', '1.0.0', {
    'package.json': `{"customElements": "custom-elements.json"}`,
    'custom-elements.json': `{`,
  });
  const problems = await collect(
    validatePackage({
      packageName: 'test-package',
      version: '1.0.0',
      files,
    })
  );
  assert.equal(problems.length, 1);
  const problem = problems[0]!;
  assert.equal(problem.filePath, 'custom-elements.json');
  assert.equal(problem.code, errorCodes.JSON_parse_error);
});

test('incompatible manifest version', async () => {
  const files = new MemoryFiles('test-package', '1.0.0', {
    'package.json': `{"customElements": "custom-elements.json"}`,
    'custom-elements.json': `{"schemaVersion": "2.0.0"}`,
  });
  const problems = await collect(
    validatePackage({
      packageName: 'test-package',
      version: '1.0.0',
      files,
    })
  );
  assert.equal(problems.length, 1);
  const problem = problems[0]!;
  assert.equal(problem.filePath, 'custom-elements.json');
  assert.equal(problem.code, errorCodes.invalid_schema_version);
});

test.run();
