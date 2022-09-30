/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {PackageFiles, Package, Version} from '../lib/npm.js';

export interface FileTree {
  [name: string]: string | FileTree;
}

/**
 * A local, in-memory implementation of the PackageFiles interface for
 * tests.
 */
export class InMemoryPackageFiles implements PackageFiles {
  packageName: string;
  version: string;
  files: FileTree;

  constructor(packageName: string, version: string, files: FileTree) {
    this.packageName = packageName;
    this.version = version;
    this.files = files;
  }

  getPackageMetadata(packageName: string): Promise<Package> {
    if (packageName !== this.packageName) {
      throw new Error(`Package not found ${packageName}`);
    }
    const packageJsonSource = this.files['package.json'];
    if (typeof packageJsonSource !== 'string') {
      throw new Error(`package.json not found`);
    }
    const packageJson = JSON.parse(packageJsonSource);
    const packument = JSON.parse(packageJsonSource);
    // Add versions, dist-tags, and time to make an npm "packument"
    // See: https://github.com/npm/registry/blob/master/docs/responses/package-metadata.md
    packument.versions = {
      [this.version]: packageJson,
    };
    packument['dist-tags'] = {
      latest: this.version,
    };
    const now = new Date().toString();
    packument.time = {
      created: now,
      modified: now,
      [this.version]: now,
    };
    return packument;
  }

  getPackageVersionMetadata(
    packageName: string,
    version: string
  ): Promise<Version> {
    if (packageName !== this.packageName || version !== this.version) {
      throw new Error(`Package not found: ${packageName}@${version}`);
    }
    const packageJsonSource = this.files['package.json'];
    if (typeof packageJsonSource !== 'string') {
      throw new Error(`package.json not found`);
    }
    const packageJson = JSON.parse(packageJsonSource);
    return packageJson;
  }

  async getFile(
    packageName: string,
    version: string,
    filePath: string
  ): Promise<string> {
    if (packageName !== this.packageName) {
      throw new Error(`Invalid package name: ${packageName}`);
    }
    if (version !== this.version) {
      throw new Error(`Invalid package version: ${version}`);
    }
    const segments = filePath.split('/');
    let file: FileTree | string | undefined = this.files;
    while (
      segments.length > 0 &&
      typeof file !== 'string' &&
      file !== undefined
    ) {
      file = file[segments.shift()!];
    }
    if (typeof file !== 'string') {
      throw new Error(`File not found: ${filePath}`);
    }
    return file;
  }
}
