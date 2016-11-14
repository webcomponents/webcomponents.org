'use strict';

const bower = require('bower');
const childProcess = require('child_process');
const url = require('url');

const Ana = require('./ana_log');

// Don't retry ECONFLICT ("Unable to find suitable version for...").
// Don't retry ENORESTARGET ("Tag/branch x does not exist").
// Don't retry ECMDERR ("Fatal: reference is not a tree:...")
// Don't retry EMALFORMED ("Unexpected token } in JSON at position:...")
const fatalErrorCodes = ['ECMDERR', 'ECONFLICT', 'ENORESTARGET', 'EMALFORMED'];

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
        if (error.code && fatalErrorCodes.indexOf(error.code) != -1 || error instanceof TypeError) {
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
    return Bower.dependencies(ownerPackageVersionString, {}, false, false).then(() => {
      return Bower.dependencies(ownerPackageVersionString, {}, true, false);
    });
  }

  static dependencies(ownerPackageVersionString, processed, offline, mayNotExist) {
    return Bower.infoPromise(ownerPackageVersionString, offline, mayNotExist).then(info => {
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
      var promises = [];
      keys.forEach(key => {
        processed[key] = key;

        var packageToProcess = depsToProcess[key];
        /*
         Many packages are in package:semver format (also package:package#semver package:owner/package#semver)
         Sadly, many of the 'semver's in Bower are just not matched by any semver parsers. It seems that Bower
         is extremely tolerant, so we must be too. However, this is hard! (eg 'bower install q#x' is fine)
         Rather than parsing or validating semvers, we'll just take anything that looks like it might be in
         package:semver format and try a couple of versions of it...
        */
        var mayNotExist = false;
        if (!packageToProcess.includes("#") && !packageToProcess.includes("/")) {
          mayNotExist = true;
          promises.push(Bower.dependencies(key + "#" + packageToProcess, processed, offline, mayNotExist));
        }
        promises.push(Bower.dependencies(packageToProcess, processed, offline, mayNotExist));
      });

      return Promise.all(promises).then(dependencyList => [].concat.apply(result, dependencyList));
    });
  }

  static infoPromise(ownerPackageVersionString, offline, mayNotExist) {
    return new Promise(resolve => {
      var metadata = null;
      bower.commands.info(
        ownerPackageVersionString.indexOf("git://") == 0 ? ownerPackageVersionString : ownerPackageVersionString.toLowerCase(),
        undefined /* property */,
        {
          offline: offline
        }
      ).on('end', function(info) {
        // For anything with an unspecified version, the result from bower may be
        // an unspecified list. Choose the latest.
        var result = info.latest ? info.latest : info;
        result.metadata = metadata;
        resolve(result);
      }).on('error', function(error) {
        if (mayNotExist) {
          Ana.fail("bower/findDependencies/info", ownerPackageVersionString, "speculative option - may not exist");
        } else {
          Ana.fail("bower/findDependencies/info");
          Ana.log("bower/findDependencies/info failure info %s", error);
        }
        resolve({});
      }).on('log', function(logEntry) {
        if (logEntry.id == 'cached' && logEntry.data && logEntry.data.pkgMeta &&
            logEntry.data.pkgMeta._resolution) {
          var source = url.parse(logEntry.data.resolver.source);
          if (source.hostname != 'github.com')
            return;

          var parts = source.pathname.substring(1).split('/', 2);
          var owner = parts[0];
          var repo = parts[1];
          repo = repo.replace(/\.git$/, '');
          var tag = logEntry.data.pkgMeta._resolution.tag || logEntry.data.pkgMeta._resolution.commit;

          metadata = {
            name: logEntry.data.pkgMeta.name,
            version: tag,
            owner: owner,
            repo: repo
          };
        }
      });
    });
  }
}

module.exports = Bower;
