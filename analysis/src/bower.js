'use strict';

const bower = require('bower');
const childProcess = require('child_process');
const url = require('url');

const Ana = require('./ana_log');

// Don't retry ECONFLICT ("Unable to find suitable version for...").
// Don't retry ENORESTARGET ("Tag/branch x does not exist").
// Don't retry ECMDERR ("Fatal: reference is not a tree:...")
const fatalErrorCodes = ['ECMDERR', 'ECONFLICT', 'ENORESTARGET'];

/**
 * Service for communicating with Bower on the local machine.
 * Provides support for installing packages, enumerating their dependencies etc...
 */
class Bower {

 /**
  * Clean up (rm -rf) the local Bower working area.
  * This deletes the installs for this directory, not the Bower cache
  * (usually stored in ~/.cache/bower).
  * @return {Promise} A promise handling the prune operation.
  */
  prune() {
    return new Promise((resolve, reject) => {
      Ana.log("bower/prune");
      childProcess.exec("rm -rf bower_components", function(err) {
        if (err) {
          Ana.fail("bower/prune");
          reject({retry: true, error: err});
        } else {
          Ana.success("bower/prune");
          resolve();
        }
      });
    });
  }

  /**
   * Installs the specified Bower package and analyses it for main html files in the bower.json,
   * returning a list of them via the promise.
   * @param {string} owner - the package owner
   * @param {string} repo - the package repository name
   * @param {string} versionOrSha - the package version code or sha
   * @return {Promise} a promise, returning a list of main html files found.
   */
  install(owner, repo, versionOrSha) {
    var packageWithOwner = owner + "/" + repo;
    var packageToInstall = packageWithOwner + "#" + versionOrSha;
    Ana.log("bower/install", packageToInstall);
    return new Promise((resolve, reject) => {
      bower.commands.install([packageToInstall], {}, {force: false}).on('end', function(installed) {
        Ana.success("bower/install", packageToInstall);
        for (let bowerPackage in installed) {
          if (installed[bowerPackage].endpoint.source.toLowerCase() != packageWithOwner.toLowerCase()) {
            // Skip over dependencies (we're not interested in them)
            continue;
          }

          var canonicalDir = installed[bowerPackage].canonicalDir;
          var mainHtmls = installed[bowerPackage].pkgMeta.main;
          if (!mainHtmls) {
            // TODO: Look in the directory and see what .html files we might be able to consume.
            Ana.log("bower/install", "Couldn't find main.html after installing", packageToInstall);
            resolve([]);
            return;
          }

          if (!Array.isArray(mainHtmls)) {
            mainHtmls = [mainHtmls];
          }

          resolve(mainHtmls.map(mainHtml => [canonicalDir, mainHtml].join("/"))); // eslint-disable-line no-loop-func
          return;
        }
        Ana.fail("bower/install", "Couldn't find package after installing [", packageToInstall, "] found [" + JSON.stringify(installed) + "]");
        reject(Error("BOWER: install: package installed not in list"));
      }).on('error', function(error) {
        Ana.fail("bower/install", packageToInstall);
        var retry = true;
        if (error.code && fatalErrorCodes.includes(error.code)) {
          retry = false;
        }
        reject({retry: retry, error: error});
      });
    });
  }

  /**
   * Gathers transitive runtime dependencies for the given package as well as the
   * declared development dependencies (but not their dependencies).
   * The dependency list gathered should be enough to run any demos for the given
   * package.
   * Dependencies look like {name:string, owner:string, repo:string, version:string}.
   * @param {string} owner - the package owner
   * @param {string} repo - the package repository name
   * @param {string} versionOrSha - the package version code or sha
   * @return {Promise.<Array.<object>>} a promise, returning a list of dependency objects.
   */
  findDependencies(owner, repo, versionOrSha) {
    var ownerPackageVersionString = owner + "/" + repo + "#" + versionOrSha;
    Ana.log("bower/findDependencies", ownerPackageVersionString);

    // The Bower API is pretty annoying. Unless the results are cached it will not reliably
    // report the github tag that it used to download the correct dependencies. In order
    // to make it do what we want, we need to do two dependency walks - one (online) to
    // populate the cache and another (offline) to gather the results.
    return Bower.dependencies(ownerPackageVersionString, {}, false).then(() => {
      return Bower.dependencies(ownerPackageVersionString, {}, true);
    });
  }

  static dependencies(ownerPackageVersionString, processed, offline) {
    return Bower.infoPromise(ownerPackageVersionString, offline).then(info => {
      // Gather all of the dependencies we want to look at.
      var depsToProcess =
          Object.assign(info.dependencies ? info.dependencies : {},
          Object.keys(processed).length == 0 && info.devDependencies ? info.devDependencies : {});

      // Filter out what we've already processed.
      Object.keys(depsToProcess).forEach(key => {
        if (processed[key]) {
          delete depsToProcess[key];
        }
      });

      var result = info.metadata ? [info.metadata] : [];

      var keys = Object.keys(depsToProcess);
      if (!keys.length) {
        return result;
      }

      // Analyse all of the dependencies we have left.
      var promises = keys.map(key => {
        processed[key] = key;

        // Sanitize packages in ludicrous formats.
        var packageToProcess = depsToProcess[key];
        if (!packageToProcess.includes("/")) {
          packageToProcess = key + "#" + packageToProcess;
        }

        return Bower.dependencies(packageToProcess, processed, offline);
      });

      return Promise.all(promises).then(dependencyList => [].concat.apply(result, dependencyList));
    });
  }

  static infoPromise(ownerPackageVersionString, offline) {
    return new Promise(resolve => {
      var metadata = null;
      bower.commands.info(
        ownerPackageVersionString,
        undefined /* property */,
        {
          offline: offline
        }
      ).on('end', function(info) {
        info.metadata = metadata;
        resolve(info);
      }).on('error', function(error) {
        Ana.fail("bower/findDependencies/info");
        Ana.log("bower/findDependencies/info failure info %s", error);
        resolve({});
      }).on('log', function(logEntry) {
        if (logEntry.id == 'cached' && logEntry.data && logEntry.data.pkgMeta &&
          logEntry.data.pkgMeta._resolution) {
          var owner = "";
          var repo = "";
          var sha = "";
          // Our package strings look like "Owner/Repo#1.2.3"
          if (ownerPackageVersionString.includes("/") && !ownerPackageVersionString.includes("git://")) {
            owner = ownerPackageVersionString;
            repo = owner.substring(owner.lastIndexOf("/") + 1, owner.lastIndexOf("#"));
            owner = owner.substring(0, owner.lastIndexOf("/"));
            if (ownerPackageVersionString.includes("#")) {
              sha = ownerPackageVersionString.substring(ownerPackageVersionString.lastIndexOf("#"));
            }
          } else {
            // These uris look like "git://github.com/Owner/Repo.git"
            owner = url.parse(logEntry.data.resolver.source).pathname;
            repo = owner.substring(owner.lastIndexOf("/") + 1, owner.lastIndexOf("."));
            owner = owner.substring(1 /* skip leading slash */, owner.lastIndexOf("/"));
            if (logEntry.data.resolver.source.includes("#")) {
              sha = logEntry.data.resolver.source.substring(logEntry.data.resolver.source.lastIndexOf("#"));
            }
          }
          metadata = {
            name: logEntry.data.pkgMeta.name,
            version: logEntry.data.pkgMeta._resolution.tag ? logEntry.data.pkgMeta._resolution.tag : sha.replace("#", ""),
            owner: owner,
            repo: repo
          };
        }
      });
    });
  }
}

module.exports = Bower;
