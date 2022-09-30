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
import fetch from 'node-fetch';
import npmFetch from 'npm-registry-fetch';
import {
  PackageFiles,
  Package,
  Version,
} from '@webcomponents/custom-elements-manifest-tools/lib/npm.js';

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

export const getDistTagsForVersion = (
  distTags: {[tag: string]: string},
  version: string
) =>
  Object.entries(distTags)
    .filter(([, v]) => v === version)
    .map(([t]) => t);

export const distTagMapToList = (distTags: {[tag: string]: string}) =>
  Object.entries(distTags).map(([tag, version]) => ({
    tag,
    version,
  }));

export const distTagListToMap = (
  distTags: Array<{tag: string; version: string}>
) => Object.fromEntries(distTags.map(({tag, version}) => [tag, version]));
