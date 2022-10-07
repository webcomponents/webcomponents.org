/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {parseArgs} from 'node:util';
import {validatePackage} from '../lib/validate.js';
import {NpmAndUnpkgFiles} from '../lib/npm-and-unpkg-files.js';
import {getCustomElements} from '../index.js';

const {positionals} = parseArgs({allowPositionals: true});
const files = new NpmAndUnpkgFiles();

const packageName = positionals[0];
if (packageName === undefined) {
  console.error('No package name given');
  process.exit(1);
}

const version = 'latest';
console.log(`Validating ${packageName}@${version}`);
const result = await validatePackage({packageName, version, files});

if (result.manifestData !== undefined) {
  const customElements = getCustomElements(
    result.manifestData,
    packageName,
    version
  );
  const customElementsCount = customElements.length;
  console.log(
    `${customElementsCount} custom element${
      customElementsCount === 1 ? '' : 's'
    } found`
  );
}

for (const problem of result.problems ?? []) {
  console.log(problem);
}
