import child_process from 'child_process';
import * as fsExtra from 'fs-extra';
import os from 'os';
import * as path from 'path';
import url from 'url';

import {Cache} from './cache';
import {fetch} from './util';

/**
 * Basic representation of the contents of package-lock.json file.
 */
export type PackageDefinition = {
  dependencies?: {[key: string]: PackageDefinition};
  version?: string;
};

/**
 * Used to generate package locks for requested packages. These package locks
 * consist of both dependencies and devDependencies. This is achieved by
 * retrieving the packages package.json file and running `npm install` with that
 * file.
 *
 * Response times vary by the number of transitive dependencies of a package.
 * However, responses are cached in an in-memory least recently used cache. For
 * frequently used packages, this resolution will only be done once.
 *
 * This also supports concurrent requests to generate the same package lock
 * through deduplication of requests.
 */
export class PackageLockGenerator {
  private cache = new Cache<PackageDefinition>();
  private pendingInstalls = new Map<string, Promise<PackageDefinition|null>>();

  /**
   * Fetch & generate if necessary the package-lock.json file for the specified
   * package. Package is specified in the from @scope/package@1.0.0.
   */
  async get(packageString: string): Promise<PackageDefinition|null> {
    // TODO: support package-lock expirations since they can become out of date.
    const valueFromCache = this.cache.get(packageString);
    if (valueFromCache) {
      return valueFromCache;
    }

    // Check if there is already a pending install for the same package.
    const pendingPromise = this.pendingInstalls.get(packageString);
    if (pendingPromise) {
      return pendingPromise;
    }

    // Generate the package lock.
    const generatePromise = this.generatePackageLock(packageString);
    this.pendingInstalls.set(packageString, generatePromise);
    const value = await generatePromise;
    this.pendingInstalls.delete(packageString);
    return value;
  }

  /**
   * Generates a package lock by creating a unique temp directory, copying the
   * package.json and running `npm install` in that directory. Automatically
   * caches the result.
   */
  private async generatePackageLock(packageString: string) {
    // Create unique directory for this package.
    const packagePath =
        await fsExtra.mkdtemp(path.join(os.tmpdir(), 'package-locks-'));
    await fsExtra.ensureDir(packagePath);
    try {
      await this.copyPackageJson(packagePath, packageString);
      await this.npmInstall(packagePath);
      const packageLock =
          await fsExtra.readJson(path.join(packagePath, 'package-lock.json')) as
          PackageDefinition;
      // Insert into cache.
      this.cache.set(packageString, packageLock);
      return packageLock;
    } catch {
      return null;
    } finally {
      // Cleanup temporary directory.
      await fsExtra.remove(packagePath);
    }
  }

  /**
   * Fetch the package.json for the specified package from unpkg.com and place
   * it in the specified directory.
   */
  private async copyPackageJson(packagePath: string, packageString: string) {
    const packageJson = await fetch(
        url.resolve('https://unpkg.com', `${packageString}/package.json`));
    const writeStream =
        fsExtra.createWriteStream(path.join(packagePath, 'package.json'));
    return new Promise((resolve) => {
      packageJson.pipe(writeStream).on('finish', resolve);
    })
  }

  /**
   * Run `npm install` in the specified working directory. Executes this command
   * as a child process.
   */
  private npmInstall(cwd: string) {
    return new Promise((resolve, reject) => {
      child_process.exec(
          'npm install --package-lock-only --silent', {cwd}, async (error) => {
            if (error) {
              reject(error);
            }
            resolve();
          });
    });
  }
}
