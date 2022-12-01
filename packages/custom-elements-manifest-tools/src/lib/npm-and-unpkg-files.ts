/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @overview
 * This module contains utilities for interacting with the npm registry and
 * downloading custom element manifests from it.
 */
import npmFetch from 'npm-registry-fetch';
import {PackageFiles, Package, Version} from './npm.js';

export class NpmAndUnpkgFiles implements PackageFiles {
  /**
   * Fetch package metadata from the npm registry.
   *
   * See https://github.com/npm/registry/blob/master/docs/responses/package-metadata.md
   */
  getPackageMetadata(packageName: string): Promise<Package> {
    return npmFetch.json(
      `/${packageName}`
    ) as Promise<unknown> as Promise<Package>;
  }

  getPackageVersionMetadata(
    packageName: string,
    version: string
  ): Promise<Version> {
    return npmFetch(
      `/${packageName}/${version}`
    ) as Promise<unknown> as Promise<Version>;
  }

  async getFile(
    packageName: string,
    version: string,
    path: string
  ): Promise<string> {
    const unpkgUrl = `https://unpkg.com/${packageName}@${version}/${path}`;
    const response = await fetch(unpkgUrl);
    return response.text();
  }
}
