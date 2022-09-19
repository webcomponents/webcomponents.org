/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {getDistTagsForVersion} from './npm.js';
import {validatePackage} from '@webcomponents/custom-elements-manifest-tools/lib/validate.js';
import {getCustomElements} from '@webcomponents/custom-elements-manifest-tools';
import {
  Package,
  PackageFiles,
} from '@webcomponents/custom-elements-manifest-tools/lib/npm.js';
import {Repository} from './repository.js';
import {
  PackageVersion,
  ReadablePackageVersion,
  isReadablePackage,
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
  private repository: Repository;
  private _files: PackageFiles;

  constructor(init: CatalogInit) {
    this._files = init.files;
    this.repository = init.repository;
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
  ) {
    const currentPackageInfo = await this.repository.getPackageInfo(
      packageName
    );

    if (currentPackageInfo === undefined) {
      // For an initial import, mark the package as initializing:
      await this.repository.startPackageImport(packageName);
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
        return;
      }
      await this.repository.startPackageUpdate(packageName);
    }

    // Fetch package metadata from npm:
    let newPackage: Package | undefined;
    try {
      newPackage = await this._files.getPackageMetadata(packageName);
    } catch (e) {
      await this.repository.endPackageImportWithError(packageName);
      return;
    }

    if (newPackage === undefined) {
      await this.repository.endPackageImportWithNotFound(packageName);
      // TODO (justinfagnani): a crazy edge case would be a package that was
      // previously found, but is not found now. Update package versions?
      return;
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
      await this.repository.updateDistTags(
        packageName,
        [...versionsToUpdate],
        newDistTags
      );
    }

    if (versionToImport !== undefined) {
      await this.importPackageVersion(packageName, versionToImport);
    }
  }

  async importPackageVersion(packageName: string, version: string) {
    console.log('Marking package version as importing...');
    await this.repository.startPackageVersionImport(packageName, version);
    console.log('  done');

    const {manifestData, manifestSource, problems} = await validatePackage({
      packageName,
      version,
      files: this._files,
    });

    // TODO (justinfagnani): If we're calling this from importPackage(), we'll
    // already have package metadata, so either use that rather making another
    // call, or cache the manifests in PackageFiles.
    const packageMetadataPromise = this._files.getPackageMetadata(packageName);

    if (problems.length > 0) {
      console.log('Writing problems...');
      await this.repository.writeProblems(packageName, version, problems);
      console.log('  done');
    }

    if (manifestData === undefined) {
      console.log('Marking package version as errored...');
      await this.repository.endPackageVersionImportWithError(
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
      console.log('Marking package version as errored...');
      await this.repository.endPackageVersionImportWithError(
        packageName,
        version
      );
      console.log('  done');
      return {problems};
    }

    const packageMetadata = await packageMetadataPromise;

    if (packageMetadata === undefined) {
      console.log('Marking package version as errored...');
      await this.repository.endPackageVersionImportWithError(
        packageName,
        version
      );
      console.log('  done');
      return {problems};
    }

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
    console.log('  done');

    console.log('Marking package version as ready...');
    await this.repository.endPackageVersionImportWithReady(
      packageName,
      version,
      packageMetadata,
      manifestSource
    );
    console.log('  done');
    return {problems};
  }

  /**
   * Returns the package version metadata, custom elements, and problems.
   */
  async getPackageVersion(
    packageName: string,
    version: string
  ): Promise<PackageVersion | undefined> {
    const [packageVersionData, customElements, problems] = await Promise.all([
      this.repository.getPackageVersion(packageName, version),
      this.repository.getCustomElements(packageName, version),
      this.repository.getProblems(packageName, version),
    ]);
    if (packageVersionData === undefined) {
      return undefined;
    }

    // The packageVersionData we received from the repository doesn't have any
    // custom elements or problems, so we assign them here:
    (packageVersionData as Mutable<ReadablePackageVersion>).customElements =
      customElements;
    (packageVersionData as Mutable<PackageVersion>).problems = problems;

    return packageVersionData as PackageVersion;
  }
}

type Mutable<T> = {
  -readonly [K in keyof T]: T[K];
};
