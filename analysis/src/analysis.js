'use strict';

const Ana = require('./ana_log');
const fs = require('fs-extra');
const path = require('path');

/**
 * Encapsulates the processing of each task.
 */
class Analysis {
  /**
   * Creates an Analysis using the given bower, analyzer and catalog services.
   * @param {Bower} bower - The Bower service.
   * @param {NPM} npm - The npm service.
   * @param {Analyzer} analyzer - The Analyzer service.
   * @param {Catalog} catalog - The Catalog service.
   */
  constructor(bower, npm, analyzer, catalog) {
    this.bower = bower;
    this.npm = npm;
    this.analyzer = analyzer;
    this.catalog = catalog;
  }

  /**
   * Processes the next received task.
   * Gets the task, installs and pulls dependencies from Bower, runs Analyzer over it,
   * gathers all data, posts it back to Catalog and acks the task.
   * @param {Object} attributes - The task to be processed
   * @return {Promise} A promise that handles the next task.
   */
  processNextTask(attributes) {
    if (attributes.isNpmPackage)
      return this._processNPMTask(attributes);
    return new Promise((resolve, reject) => {
      var taskAsString = JSON.stringify(attributes);

      var errorHandler = error => {
        Ana.fail("analysis/processNextTask", taskAsString, error);
        reject(error);
      };

      Ana.log("analysis/processNextTask", taskAsString);
      if (!attributes || !attributes.owner || !attributes.repo || !attributes.version) {
        errorHandler({retry: false, error: "Task attributes missing required field."});
        return;
      }

      var versionOrSha = attributes.sha ? attributes.sha : attributes.version;
      this.bower.prune().then(() => {
        return this.bower.install(attributes.owner, attributes.repo, versionOrSha);
      }).then(async (result) => {
        if (!await fs.exsists(result.root)) {
          Ana.fail("analysis/processNextTask", taskAsString, "Installed package not found");
          reject({retry: false, error: Error("Installed package not found")});
          return;
        }

        // Move /bower_components/element/* to /*. It is simpler to analyze a
        // package in the root with all the dependencies in bower_components.
        const grandparent = path.dirname(path.dirname(result.root));
        await hoistPackageContents(result.root, grandparent);
        return await Promise.all([
          this.analyzer.analyze(true, grandparent, result.mainHtmls),
          this.bower.findDependencies(attributes.owner, attributes.repo, versionOrSha)]);
      }).then(results => {
        var data = {};
        data.analyzerData = results[0];
        data.bowerDependencies = results[1];
        return this.catalog.postResponse(data, attributes);
      }).then(() => {
        Ana.success("analysis/processNextTask", taskAsString);
        resolve();
      }).catch(errorHandler);
    });
  }

  _processNPMTask(attributes) {
    return new Promise((resolve, reject) => {
      var taskAsString = JSON.stringify(attributes);
      Ana.log('analysis/processNextTask', taskAsString);

      // SHA is ignored here.
      if (!attributes || !attributes.owner || !attributes.repo || !attributes.version || !attributes.isNpmPackage) {
        Ana.fail('analysis/processNextTask', taskAsString);
        reject({retry: false, error: 'Task attributes missing or not a package'});
        return;
      }

      this.npm.prune().then(() => {
        return this.npm.install(attributes.owner, attributes.repo, attributes.version);
      }).then(async(packagePath) => {
        // packagePath is the location of the installed package.
        // eg. /node_modules/@scoped/package or /node_modules/package
        let root = packagePath;
        // Find the node_modules folder. This may be nested since it could be a
        // scoped package.
        while (path.basename(root) !== 'node_modules') {
          root = path.dirname(root);
        }
        // Move up to parent of node_modules.
        root = path.dirname(root);
        // Move /node_modules/element/* to /*.
        await hoistPackageContents(packagePath, root);

        return await Promise.all([
          this.analyzer.analyze(false, root),
          this.npm.findDependencies(attributes.owner, attributes.repo)]);
      }).then(results => {
        var data = {};
        data.analyzerData = results[0];
        data.npmDependencies = results[1];
        return this.catalog.postResponse(data, attributes);
      }).then(() => {
        Ana.success('analysis/processNextTask', taskAsString);
        resolve();
      }).catch(error => {
        Ana.fail('analysis/processNextTask', taskAsString, error);
        reject(error);
      });
    });
  }
}

module.exports = Analysis;

/**
 * Hoists the contents of the specified directory to the specified parent
 * directory.
 */
async function hoistPackageContents(dir, newDir) {
  const files = await fs.readdir(dir);

  for (const file of files) {
    // Don't copy over the package.json, since we need to maintain the existing
    // one from installing the package.
    if (file !== 'package.json') {
      await fs.move(path.join(dir, file), path.join(newDir, file));
    }
  }
}
