/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {getDistTagsForVersion} from './npm.js';
import {validatePackage} from '@webcomponents/custom-elements-manifest-tools/lib/validate.js';
import {getCustomElements} from '@webcomponents/custom-elements-manifest-tools';
import {PackageFiles} from '@webcomponents/custom-elements-manifest-tools/lib/npm.js';
import {Repository} from './repository.js';

export interface CatalogInit {
  repository: Repository;
  files: PackageFiles;
}

/**
 * Implements operations for reading and writing to a catalog.
 */
export class Catalog {
  private repository: Repository;
  private _files: PackageFiles;

  constructor(init: CatalogInit) {
    this._files = init.files;
    this.repository = init.repository;
  }

  async importPackageVersion(packageName: string, version: string) {
    console.log('Marking package as importing...');
    await this.repository.startPackageVersionImport(packageName, version);
    console.log('  done');

    const {manifestData, manifestSource, problems} = await validatePackage({
      packageName,
      version,
      files: this._files,
    });
    const packageMetadataPromise = this._files.getPackageMetadata(packageName);

    // TODO: record problems

    if (manifestData === undefined) {
      console.log('Marking package as errored...');
      await this.repository.endPackageVersionImportWithError(
        packageName,
        version
      );
      console.log('  done');
      return {problems};
    }

    const packageMetadata = await packageMetadataPromise;

    // TODO: write custom elements
    const customElements = getCustomElements(
      manifestData,
      packageName,
      version
    );
    const packageVersionMetadata = packageMetadata.versions[version]!;
    const distTags = packageMetadata['dist-tags'];
    const versionDistTags = getDistTagsForVersion(distTags, version);
    const author = packageVersionMetadata.author?.name ?? '';

    console.log('Writing custom elements...');
    await this.repository.writeCustomElements(
      packageName,
      version,
      customElements,
      versionDistTags,
      author
    );
    console.log('done');

    console.log('Marking package as ready...');
    await this.repository.endPackageVersionImportWithReady(
      packageName,
      version,
      packageMetadata,
      manifestSource
    );
    console.log('done');
    return {problems};
  }

  async getProblems(packageName: string, version: string) {
    
  }
}
