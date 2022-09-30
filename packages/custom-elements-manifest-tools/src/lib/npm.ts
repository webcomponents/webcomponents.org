/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Interface for retrieving npm package metadata and files.
 */
export interface PackageFiles {
  getPackageMetadata(packageName: string): Promise<Package>
  getPackageVersionMetadata(packageName: string, version: string): Promise<Version>
  getFile(packageName: string, version: string, path: string): Promise<string>;
}

/**
 * npm package metadata as returned from the npm registry
 * https://github.com/npm/registry/blob/master/docs/responses/package-metadata.md
 * 
 * TODO (justinfagnani): can we get this interface from somewhere canonical?
 */
export interface Package {
  name: string;
  description: string;
  'dist-tags': {[tag: string]: string};
  versions: {[tag: string]: Version};
  time: {
    modified: string;
    created: string;
    [version: string]: string;
  };
}

export interface Version {
  name: string;
  version: string;
  description: string;
  dist: Dist;
  type?: 'module' | 'commonjs';
  main: string;
  module?: string;

  author?: {name: string};
  homepage?: string;

  repository: {
    type: 'git' | 'svn';
    url: string;
  };

  customElements?: string;
}

export interface Dist {
  tarball: string;
}
