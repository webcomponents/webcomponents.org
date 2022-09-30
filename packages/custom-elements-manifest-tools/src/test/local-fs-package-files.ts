/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import {readFile} from 'fs/promises';

import {PackageFiles, Package, Version} from '../lib/npm.js';

export interface FileTree {
  [name: string]: string | FileTree;
}

/**
 * A local filesystem implementation of the PackageFiles interface for
 * tests.
 */
export class LocalFsPackageFiles implements PackageFiles {
  path: string;
  packageName: string;
  version: string;

  constructor(path: string, packageName: string, version: string) {
    this.path = path;
    this.packageName = packageName;
    this.version = version;
  }

  async getPackageMetadata(packageName: string): Promise<Package> {
    if (packageName !== this.packageName) {
      throw new Error(`Package not found ${packageName}`);
    }
    const packageJsonPath = path.resolve(this.path, 'package.json');

    let packageJsonSource: string;
    try {
      packageJsonSource = await readFile(packageJsonPath, 'utf-8');
    } catch (e) {
      throw new Error(`package.json not found`);
    }

    const packageJson = JSON.parse(packageJsonSource);
    const packument = JSON.parse(packageJsonSource);

    // Add versions, dist-tags, and time and to make an npm "packument"
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

  async getPackageVersionMetadata(
    packageName: string,
    version: string
  ): Promise<Version> {
    if (packageName !== this.packageName || version !== this.version) {
      throw new Error(`Package not found: ${packageName}@${version}`);
    }

    const packageJsonPath = path.resolve(this.path, 'package.json');
    let packageJsonSource: string;
    try {
      packageJsonSource = await readFile(packageJsonPath, 'utf-8');
    } catch (e) {
      throw new Error(`package.json not found`);
    }

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
    const fullPath = path.resolve(this.path, filePath);
    const source = await readFile(fullPath, 'utf-8');
    return source;
  }
}
