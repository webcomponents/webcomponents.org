import {Firestore} from '@google-cloud/firestore';
import child_process from 'child_process';
import firebaseAdmin from 'firebase-admin';
import * as fsExtra from 'fs-extra';
import os from 'os';
import * as path from 'path';
import url from 'url';
import {promisify} from 'util';
import zlib from 'zlib';

import {Cache} from './cache';
import {fetch} from './util';

const MEMORY_TOTAL_MB = 1024;
const MEMORY_RESERVED_MB = 128;

const exec = promisify(child_process.exec);

/**
 * Basic representation of the contents of package-lock.json file.
 */
type PackageDefinition = {
  dependencies?: {[key: string]: PackageDefinition};
  version?: string;
};

/**
 * Flat representation of a package-lock file.
 */
export type PackageVersionMap = {
  [name: string]: string
};

/**
 * Used to generate package locks for requested packages. These package locks
 * consist of both dependencies and devDependencies. This is achieved by
 * retrieving the packages package.json file and running `npm install` with that
 * file.
 *
 * Response times vary by the number of transitive dependencies of a package.
 * All generated package locks are persisted and reused once it has initially
 * been generated. An in-memory cache also exists to reduce the number of reads.
 * For example, when loading a module based demo, hundreds of requests can be
 * generated reading the same package lock. However, responses are cached in an
 *
 * This also supports concurrent requests to generate the same package lock
 * through deduplication of requests.
 */
export class PackageLockGenerator {
  // Instantiate a cache which dynamically determines cache size based on how
  // much memory is being used.
  private cache = new Cache<Buffer>((_currentSize) => {
    const currentHeapBytes = process.memoryUsage().heapUsed;
    const currentHeapMB = currentHeapBytes / 1024 / 1024;
    return MEMORY_TOTAL_MB - currentHeapMB > MEMORY_RESERVED_MB;
  });
  // Map to dedupe pending installs if there are concurrent requests.
  private pendingInstalls = new Map<string, Promise<PackageVersionMap|null>>();
  // Persistent database to store generated package locks.
  private firestore?: Firestore;

  constructor() {
    if (process.env.NODE_ENV === 'production') {
      firebaseAdmin.initializeApp(
          {credential: firebaseAdmin.credential.applicationDefault()});

      this.firestore = firebaseAdmin.firestore();
      this.firestore.settings({timestampsInSnapshots: true});
    } else {
      console.log('Running without Firestore backing.');
    }
  }

  /**
   * Fetch the package versions for the specified package (in the form
   * @scope/package@1.0.0). This is done by checking the in-memory cache, then
   * Firestore. If it does not exist, it is generated.
   */
  async get(packageString: string): Promise<PackageVersionMap|null> {
    const valueFromCache = this.cache.get(packageString);
    if (valueFromCache) {
      return await this.uncompressData(valueFromCache);
    }

    let firestoreDocId;

    // Check if there is already a persisted value in datastore.
    if (this.firestore) {
      firestoreDocId = this.firestore.collection('package-locks')
                           .doc(packageString.replace('/', '__'))
      const doc = await firestoreDocId.get();
      if (doc.exists) {
        const packageVersionMap = doc.data() as PackageVersionMap;
        // Insert into in-memory cache.
        const compressed = await this.compressData(packageVersionMap);
        this.cache.set(packageString, compressed);
        return packageVersionMap;
      }
    }

    // Check if there is already a pending install for the same package.
    const pendingPromise = this.pendingInstalls.get(packageString);
    if (pendingPromise) {
      return pendingPromise;
    }

    // Generate the package lock.
    const generatePromise = this.generatePackageLock(packageString);
    this.pendingInstalls.set(packageString, generatePromise);
    const packageVersionMap = await generatePromise;
    // Insert into cache.
    if (packageVersionMap) {
      const compressed = await this.compressData(packageVersionMap);
      this.cache.set(packageString, compressed);

      // Insert into datastore.
      if (firestoreDocId) {
        firestoreDocId.set(packageVersionMap);
      }
    }
    this.pendingInstalls.delete(packageString);
    return packageVersionMap;
  }

  /**
   * Compresses PackageVersionMaps by converting it to a string and gziping the
   * result.
   */
  private compressData(packageVersionMap: PackageVersionMap): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const asString = JSON.stringify(packageVersionMap);
      zlib.gzip(asString, (error, result: Buffer) => {
        if (error) {
          console.error('Failed to compress data');
          reject(error);
        }
        resolve(result);
      });
    });
  }

  private uncompressData(buffer: Buffer): Promise<PackageVersionMap> {
    return new Promise((resolve, reject) => {
      zlib.unzip(buffer, (error, result: Buffer) => {
        if (error) {
          console.error('Failed to uncompress data');
          reject(error);
        }
        resolve(JSON.parse(result.toString()) as PackageVersionMap);
      });
    });
  }

  /**
   * Generates a package lock by creating a unique temp directory, copying the
   * package.json and running `npm install` in that directory. Automatically
   * caches the result.
   */
  private async generatePackageLock(packageString: string) {
    // Create unique temp directory for this package.
    const packagePath =
        await fsExtra.mkdtemp(path.join(os.tmpdir(), 'package-locks-'));
    await fsExtra.ensureDir(packagePath);
    try {
      await this.copyPackageJson(packagePath, packageString);
      await this.npmInstall(packagePath);
      const packageLock =
          await fsExtra.readJson(path.join(packagePath, 'package-lock.json')) as
          PackageDefinition;
      const packageVersionMap = this.flattenPackageLock(packageLock);
      return packageVersionMap;
    } catch (error) {
      console.error(`Failed to generate package lock for ${packageString}`);
      console.error(error);
      return null;
    } finally {
      // Cleanup temporary directory.
      await fsExtra.remove(packagePath);
    }
  }

  /**
   * From a large recursive definition, produces a flattened representation. A
   * package may only appear once, so if there are conflicts, only one version
   * will listed.
   */
  private flattenPackageLock(packageLock: PackageDefinition):
      PackageVersionMap {
    const packageMap: PackageVersionMap = {};

    /**
     * Recursively appends dependencies if a version is specified.
     */
    const appendDependencies = (root: PackageDefinition) => {
      if (!root.dependencies) {
        return;
      }

      for (const name of Object.keys(root.dependencies)) {
        const version = root.dependencies[name].version;
        if (version) {
          packageMap[name] = version;
        }
        appendDependencies(root.dependencies[name]);
      }
    };

    appendDependencies(packageLock);
    return packageMap;
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
    return exec('npm install --package-lock-only --silent', {cwd});
  }
}
