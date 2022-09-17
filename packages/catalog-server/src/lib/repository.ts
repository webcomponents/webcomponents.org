/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
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
 *
 * Separating Repository from Catalog lets us isolate database-specific code
 * to Repository in relatively simple operations, and keep
 * database-independent logic in Catalog. This allows for multiple
 * implementations of Repository so the catalog can run on different local and
 * cloud environments.
 *
 * Repository methods should be as simple as possible. They should either
 * operate on a single entity-kind/table (and let Catalog coordinate access to
 * multiple entity-kinds) or use a transaction to guarantee consistency across
 * multiple entity-kinds.
 *
 * Some workflows, like importing packages and versions, are split across
 * several methods and do not allow for a single transaction. These worflows do
 * relatively expensive I/O and file processing in the middle of reads and
 * writes and so instead work by acquiring and releasing locks on the document
 * being processed with with start* and end* methods.
 */
export interface Repository {
  /**
   * Create an initial PackageInfo document in the "initializing" status.
   * Throws if the document already exists, or if the Package document does not
   * exist.
   */
  startPackageImport(packageName: string): Promise<void>;

  startPackageUpdate(packageName: string): Promise<void>;

  endPackageImportWithNotFound(packageName: string): Promise<void>;

  endPackageImportWithError(packageName: string): Promise<void>;

  updateDistTags(
    packageName: string,
    versionsToUpdate: Array<string>,
    newDistTags: {[tag: string]: string}
  ): Promise<void>;

  /**
   * Create an initial PackageVersion document in the "initializing" status.
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
  getPackageInfo(packageName: string): Promise<PackageInfo | undefined>;

  /**
   * Gets a PackageVersion object from the database, not including all the
   * custom elements exported by the package.
   */
  getPackageVersion(
    packageName: string,
    version: string
  ): Promise<Omit<PackageVersion, 'customElements' | 'problems'> | undefined>;
}
