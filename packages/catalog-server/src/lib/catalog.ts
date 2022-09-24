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
import {PackageVersion} from '@webcomponents/catalog-api/lib/schema.js';

export interface CatalogInit {
  repository: Repository;
  files: PackageFiles;
}

/**
 * Implements operations for reading and writing to a catalog.
 */
export class Catalog {
  #repository: Repository;
  #files: PackageFiles;

  constructor(init: CatalogInit) {
    this.#files = init.files;
    this.#repository = init.repository;
  }

  async importPackageVersion(packageName: string, version: string) {
    console.log('Marking package as importing...');
    await this.#repository.startPackageVersionImport(packageName, version);
    console.log('  done');

    const {manifestData, manifestSource, problems} = await validatePackage({
      packageName,
      version,
      files: this.#files,
    });
    const packageMetadataPromise = this.#files.getPackageMetadata(packageName);

    if (problems.length > 0) {
      console.log('Writing problems...');
      await this.#repository.writeProblems(packageName, version, problems);
      console.log('  done');
    }

    if (manifestData === undefined) {
      console.log('Marking package as errored...');
      await this.#repository.endPackageVersionImportWithError(
        packageName,
        version
      );
      console.log('  done');
      return {problems};
    }

    const customElements = getCustomElements(
      manifestData,
      packageName,
      version
    );

    if (customElements.length === 0) {
      console.log('Marking package as errored...');
      await this.#repository.endPackageVersionImportWithError(
        packageName,
        version
      );
      console.log('  done');
      return {problems};
    }

    const packageMetadata = await packageMetadataPromise;

    const packageVersionMetadata = packageMetadata.versions[version]!;
    const distTags = packageMetadata['dist-tags'];
    const versionDistTags = getDistTagsForVersion(distTags, version);
    const author = packageVersionMetadata.author?.name ?? '';

    console.log('Writing custom elements...');
    await this.#repository.writeCustomElements(
      packageName,
      version,
      customElements,
      versionDistTags,
      author
    );
    console.log('done');

    console.log('Marking package as ready...');
    await this.#repository.endPackageVersionImportWithReady(
      packageName,
      version,
      packageMetadata,
      manifestSource
    );
    console.log('done');
    return {problems};
  }

  /**
   * Returns the package version metadata, custom elements, and problems
   * @param packageName
   * @param version
   */
  async getPackageVersion(
    packageName: string,
    version: string
  ): Promise<PackageVersion | undefined> {
    const [packageVersionData, customElements, problems] = await Promise.all([
      this.#repository.getPackageVersion(packageName, version),
      this.#repository.getCustomElements(packageName, version),
      this.#repository.getProblems(packageName, version),
    ]);
    if (packageVersionData === undefined) {
      return undefined;
    }

    // The packageVersionData we received from the repository doesn't have any
    // custom elements, so we assign them here:
    (packageVersionData as Mutable<PackageVersion>).customElements =
      customElements;
    (packageVersionData as Mutable<PackageVersion>).problems = problems;

    return packageVersionData;
  }
}

type Mutable<T> = {
  -readonly [K in keyof T]: T[K];
};
