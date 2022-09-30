/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {distTagMapToList, getDistTagsForVersion} from './npm.js';
import {validatePackage} from '@webcomponents/custom-elements-manifest-tools/lib/validate.js';
import {getCustomElements} from '@webcomponents/custom-elements-manifest-tools';
import {
  Package,
  PackageFiles,
} from '@webcomponents/custom-elements-manifest-tools/lib/npm.js';
import {Repository} from './repository.js';
import {
  PackageVersion,
  isReadablePackage,
  ValidationProblem,
  PackageInfo,
  ReadablePackageInfo,
  CustomElement,
} from '@webcomponents/catalog-api/lib/schema.js';
import {
  Temporal,
  toTemporalInstant as toTemporalInstantMethod,
} from '@js-temporal/polyfill';

// Make a standalone function instead of patching Date.prototype with a method
const toTemporalInstant = (date: Date) => {
  return toTemporalInstantMethod.call(date);
};

/**
 * The default amount of time that must pass between trying to import
 * a package.
 *
 * New npm package versions can be published any time, but we don't want to
 * check too often.
 */
const defaultPackageRefreshInterval = Temporal.Duration.from({minutes: 5});

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

  /**
   * Imports a package, which inserts or updates the package-wide metadata like
   * dist-tags, versions, and times.
   *
   * If the dist-tags have changed since the last import, package versions will
   * be updated with the updated dist-tags.
   *
   * If the 'latest' dist-tag needs importing, that package version will be
   * imported too.
   */
  async importPackage(
    packageName: string,
    packageRefreshInterval = defaultPackageRefreshInterval
  ): Promise<{
    packageInfo?: PackageInfo;
    packageVersion?: PackageVersion;
    problems?: ValidationProblem[];
  }> {
    console.log('Catalog.importPackage');

    const currentPackageInfo = await this.#repository.getPackageInfo(
      packageName
    );

    if (currentPackageInfo === undefined) {
      // For an initial import, mark the package as initializing:
      await this.#repository.startPackageImport(packageName);
    } else {
      // Check that we haven't imported recently, and abort if we have:
      const updatedDate = currentPackageInfo.lastUpdate;
      const updatedInstant = toTemporalInstant(updatedDate);
      const now = Temporal.Now.instant();
      const timeSinceUpdate = now.since(updatedInstant);
      if (
        Temporal.Duration.compare(timeSinceUpdate, packageRefreshInterval) ===
        -1
      ) {
        return {};
      }
      await this.#repository.startPackageUpdate(packageName);
    }

    // Fetch package metadata from npm:
    console.log('Fetching package metadata...');
    let newPackage: Package | undefined;
    try {
      newPackage = await this.#files.getPackageMetadata(packageName);
    } catch (e) {
      await this.#repository.endPackageImportWithError(packageName);
      return {};
    }
    console.log(' done');

    if (newPackage === undefined) {
      await this.#repository.endPackageImportWithNotFound(packageName);
      // TODO (justinfagnani): a crazy edge case would be a package that was
      // previously found, but is not found now. Update package versions?
      return {};
    }

    const newDistTags = newPackage['dist-tags'];

    // This will be undefined if we don't need to import any new package
    // version (if the 'latest' dist-tag didn't change).
    let versionToImport: string | undefined = newDistTags['latest'];

    if (isReadablePackage(currentPackageInfo)) {
      const currentDistTagEntries = currentPackageInfo.distTags;
      const currentDistTags = Object.fromEntries(
        currentDistTagEntries.map(({tag, version}) => [tag, version])
      );

      // If latest didn't change, we don't need to import
      if (currentDistTags['latest'] === newDistTags['latest']) {
        versionToImport = undefined;
      }

      // Update dist-tags: compute which versions need updating
      const versionsToUpdate = new Set<string>();

      // Loop though new dist-tags to find versions to add tags to
      for (const [tag, version] of Object.entries(newDistTags)) {
        if (currentDistTags[tag] !== version) {
          // The dist-tag changed versions, so update associated version.
          // We need to add the dist-tag to the new version. Removing it from
          // the old version will happen in the next loop.
          versionsToUpdate.add(version);
        }
      }
      // Loop though old dist-tags to find versions remove tags from
      for (const {tag, version} of currentDistTagEntries) {
        if (newDistTags[tag] !== version) {
          // The dist-tag changed versions, so update associated version.
          // We'll need to remove the dist-tag from the old version
          versionsToUpdate.add(version);
        }
      }

      // Write the tags
      console.log('Writing package dist tags...');
      await this.#repository.updateDistTags(
        packageName,
        [...versionsToUpdate],
        newDistTags
      );
      console.log('  done');
    }

    let importResult:
      | {packageVersion?: PackageVersion; problems?: ValidationProblem[]}
      | undefined = undefined;

    if (versionToImport !== undefined) {
      importResult = await this.importPackageVersion(
        packageName,
        versionToImport
      );
    }

    console.log('Marking package ready...');
    const newPackageInfo: ReadablePackageInfo = {
      ...(currentPackageInfo as ReadablePackageInfo),
      description: newPackage.description,
      distTags: distTagMapToList(newDistTags),
    };
    await this.#repository.endPackageImportWithReady(
      packageName,
      newPackageInfo
    );
    console.log('  done');

    return {
      packageVersion: importResult?.packageVersion,
      problems: importResult?.problems,
      packageInfo: await this.getPackageInfo(packageName),
    };
  }

  async importPackageVersion(packageName: string, version: string) {
    console.log('Marking package version as importing...');
    await this.#repository.startPackageVersionImport(packageName, version);
    console.log('  done');

    const {manifestData, manifestSource, problems} = await validatePackage({
      packageName,
      version,
      files: this.#files,
    });

    // TODO (justinfagnani): If we're calling this from importPackage(), we'll
    // already have package metadata, so either use that rather making another
    // call, or cache the manifests in PackageFiles.
    const packageMetadataPromise = this.#files.getPackageMetadata(packageName);

    if (problems.length > 0) {
      console.log('Writing problems...');
      await this.#repository.writeProblems(packageName, version, problems);
      console.log('  done');
    }

    if (manifestData === undefined) {
      console.error(`manifestData not found`);
      console.log('Marking package version as errored...');
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
      console.error(`No customElements found`);
      console.log(manifestSource);
      console.log('Marking package version as errored...');
      await this.#repository.endPackageVersionImportWithError(
        packageName,
        version
      );
      console.log('  done');
      return {problems};
    }

    const packageMetadata = await packageMetadataPromise;

    if (packageMetadata === undefined) {
      console.error(`packageMetadata not found`);
      console.log('Marking package version as errored...');
      await this.#repository.endPackageVersionImportWithError(
        packageName,
        version
      );
      console.log('  done');
      return {problems};
    }

    // eslint-disable-next-line
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
    console.log('  done');

    console.log('Marking package version as ready...');
    const packageVersion =
      await this.#repository.endPackageVersionImportWithReady(
        packageName,
        version,
        packageMetadata,
        manifestSource
      );
    console.log('  done marking package version as ready');
    return {packageVersion, problems};
  }

  async getPackageInfo(packageName: string): Promise<PackageInfo | undefined> {
    return this.#repository.getPackageInfo(packageName);
  }

  /**
   * Returns the package version metadata, without custom elements or problems.
   */
  async getPackageVersion(
    packageName: string,
    version: string
  ): Promise<PackageVersion | undefined> {
    console.log('Catalog.getPackageVersion', packageName, version);
    return this.#repository.getPackageVersion(packageName, version);
  }

  async getCustomElements(
    packageName: string,
    version: string,
    tagName: string | undefined
  ): Promise<Array<CustomElement>> {
    return this.#repository.getCustomElements(packageName, version, tagName);
  }
}
