'use strict';

const Ana = require('./ana_log');
const path = require('path');
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
    if (attributes.npmPackage)
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
          reject({retry: false, erorr: Error("Installed package not found")});
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
      Ana.log('analysis/processNextTask', taskAsString);

      if (!attributes || !attributes.owner || !attributes.repo || !attributes.version || !attributes.npmPackage) {
        errorHandler({retry: false, error: 'Task attributes missing or not a package'});
        return;
      }

      var versionOrSha = attributes.sha ? attributes.sha : attributes.version;
    });
  }
}

module.exports = Analysis;
