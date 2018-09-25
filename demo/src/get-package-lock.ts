import * as fsExtra from 'fs-extra';
import npm from 'npm';
import * as path from 'path';
import {Cache} from './cache';

type PackageDefinition = {
  dependencies: {[key: string]: PackageDefinition};
  version: string;
};

export class PackageLockGenerator {
  private initialized = false;
  private cache = new Cache<PackageDefinition>();

  async init() {
    // NPM uses process.cwd() to determine the node working directory. We change
    // the working directory the `build` folder to ensure a separate working
    // directory for NPM is used.
    process.chdir('build');
    // Required package.json file for NPM.
    await fsExtra.writeJson(path.join(__dirname, 'package.json'), {});
    await this.loadNPM();
  }

  private loadNPM() {
    return new Promise((resolve) => {
      const configOptions = {
        // This flag was added in v5.6.0. Reference:
        // https://github.com/npm/cli/blob/4c65cd952bc8627811735bea76b9b110cc4fc80e/changelogs/CHANGELOG-5.md#features-1
        'package-lock-only': true,
        // Do not save install results to package.json.
        save: false,
        // Do not produce any stdin logs.
        loglevel: 'silent',
      };
      npm.load(configOptions,
          () => {
            this.initialized = true;
            resolve();
          });
    });
  }

  getPackageLock(packageString: string) {
    const valueFromCache = this.cache.get(packageString);
    if (valueFromCache) {
      return valueFromCache;
    }

    if (!this.initialized) {
      throw new Error('init() must be called first');
    }

    return new Promise((resolve, reject) => {
      npm.commands.install(
          [packageString], async (error, _installedPackages, _packageInfo) => {
            if (error) {
              reject(error);
            }
            const packageLock = await fsExtra.readJson(
                path.join(__dirname, 'package-lock.json')) as PackageDefinition;
            // Insert into cache.
            this.cache.set(packageString, packageLock);
            resolve(packageLock);
          });
    });
  }
}

async function run() {
  const packageLock = new PackageLockGenerator();
  await packageLock.init();

  console.log(await packageLock.getPackageLock('@polymer/polymer'));
  console.log(await packageLock.getPackageLock('@polymer/polymer'));
  console.log(await packageLock.getPackageLock('@polymer/polymer'));
  console.log(await packageLock.getPackageLock('@polymer/lit-element'));
  // console.log(await packageLock.getPackageLock('@polymer/paper-button'));
}

run();
