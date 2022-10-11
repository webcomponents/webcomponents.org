/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import {readFile} from 'fs/promises';

import {PackageFiles, Package, Version} from '../lib/npm.js';

export interface Config {
  path: string;
  packageName: string;
  publishedVersions: Array<string>;
  distTags: {[tag: string]: string};
}

/**
 * A local filesystem implementation of the PackageFiles interface for tests.
 *
 * Given a folder for a package, this class uses subfolders named with version
 * numbers to hold the package.json and package files for each version. The
 * currently published versions are given to the constructor. This allows tests
 * to simulate a package being updated over time.
 */
export class LocalFsPackageFiles implements PackageFiles {
  path: string;
  packageName: string;
  publishedVersions: Array<string>;
  distTags: {[tag: string]: string};

  constructor(config: Config) {
    this.path = config.path;
    this.packageName = config.packageName;
    this.publishedVersions = config.publishedVersions;
    this.distTags = config.distTags;
  }

  async getPackageMetadata(packageName: string): Promise<Package> {
    if (packageName !== this.packageName) {
      throw new Error(`Package not found ${packageName}`);
    }

    // Create a fake npm "packument"
    // See: https://github.com/npm/registry/blob/master/docs/responses/package-metadata.md
    const versions: Package['versions'] = {};
    const now = new Date().toString();
    const time: Package['time'] = {
      created: now,
      modified: now,
      // ...Object.fromEntries(this.publishedVersions.map((v) => [v, now])),
    };
    let description!: string;
    let foundLatest = false;
    await Promise.all(
      this.publishedVersions.map(async (v) => {
        const packageJsonPath = path.resolve(this.path, v, 'package.json');
        let packageJsonSource: string;
        try {
          packageJsonSource = await readFile(packageJsonPath, 'utf-8');
        } catch (e) {
          throw new Error(`${packageJsonPath} not found`);
        }
        const packageJson = JSON.parse(packageJsonSource) as Version;
        versions[v] = packageJson;
        time[v] = now;
        if (v === this.distTags['latest']) {
          description = packageJson.description;
          foundLatest = true;
        }
      })
    );

    if (!foundLatest) {
      throw new Error('No latest tag given');
    }

    // TODO (justinfagnani): add author, license, maintainers, readme
    const packument: Package = {
      name: packageName,
      description,
      versions,
      'dist-tags': this.distTags,
      time,
    };
    return packument;
  }

  async getPackageVersionMetadata(
    packageName: string,
    version: string
  ): Promise<Version> {
    if (
      packageName !== this.packageName ||
      !this.publishedVersions.includes(version)
    ) {
      throw new Error(`Package not found: ${packageName}@${version}`);
    }

    const packageJsonPath = path.resolve(this.path, version, 'package.json');
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
    if (!this.publishedVersions.includes(version)) {
      throw new Error(`Invalid package version: ${version}`);
    }
    const fullPath = path.resolve(this.path, version, filePath);
    const source = await readFile(fullPath, 'utf-8');
    return source;
  }
}
