'use strict';

const Ana = require('./ana_log');
const fs = require('fs');

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
      }).then(result => {
        if (!fs.existsSync(result.root)) {
          Ana.fail("analysis/processNextTask", taskAsString, "Installed package not found");
          reject({retry: false, error: Error("Installed package not found")});
          return;
        }

        return Promise.all([
          this.analyzer.analyze(result.root, result.mainHtmls),
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
      }).then(root => {
        return Promise.all([
          // Replace analyzer root because we can't have node_modules in the path.
          // See https://github.com/Polymer/polymer-analyzer/issues/882 for the analyzer bug.
          this.analyzer.analyze(root.replace('node_modules', 'modules_copy')),
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
