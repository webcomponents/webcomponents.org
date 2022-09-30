/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  CustomElement,
  PackageInfo,
  PackageVersion,
  ValidationProblem,
} from '@webcomponents/catalog-api/lib/schema';
import type {CustomElementInfo} from '@webcomponents/custom-elements-manifest-tools';
import type {Package} from '@webcomponents/custom-elements-manifest-tools/lib/npm.js';

/**
 * Interface for a database that stores package and custom element data.
 */
export interface Repository {
  /**
   * Create an initial PackageVersion document in the "initialized" status.
   * Throws if the document already exists, or if the Package document does not
   * exist.
   */
  startPackageVersionImport(
    packageName: string,
    version: string
  ): Promise<void>;

  /**
   * Updates a PackageVersion to status: READY. Verifies that the PackageVersion
   * was in INITIALIZING status before the update.
   */
  endPackageVersionImportWithReady(
    packageName: string,
    version: string,
    packageMetadata: Package,
    customElementsManifestSource: string | undefined
  ): Promise<void>;

  /**
   * Updates a PackageVersion to status: ERROR. Verifies that the PackageVersion
   * was in INITIALIZING status before the update.
   */
  endPackageVersionImportWithError(
    packageName: string,
    version: string
  ): Promise<void>;

  writeCustomElements(
    packageName: string,
    version: string,
    customElements: CustomElementInfo[],
    distTags: string[],
    author: string
  ): Promise<void>;

  /**
   * Gets the custom elements for a package version.
   */
  getCustomElements(
    packageName: string,
    version: string,
    tagName?: string
  ): Promise<CustomElement[]>;

  writeProblems(
    packageName: string,
    version: string,
    problems: Array<ValidationProblem>
  ): Promise<void>;

  /**
   * Gets the custom elements for a package version.
   */
  getProblems(
    packageName: string,
    version: string,
    tagName?: string
  ): Promise<ValidationProblem[]>;

  /**
   * Gets a PackageInfo object from the database, not including the
   * published package versions.
   */
  getPackageInfo(
    packageName: string
  ): Promise<Omit<PackageInfo, 'version'> | undefined>;

  /**
   * Gets a PackageVersion object from the database, not including all the
   * custom elements exported by the package.
   */
  getPackageVersion(
    packageName: string,
    version: string
  ): Promise<Omit<PackageVersion, 'customElements' | 'problems'> | undefined>;
}
