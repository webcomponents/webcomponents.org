'use strict';

const Ana = require('./ana_log');
const path = require('path');
const fs = require('fs');

/**
 * Encapsulates the processing of each task.
 */
class Analysis {
  /**
   * Creates an Analysis using the given bower, hydrolysis and catalog services.
   * @param {Bower} bower - The Bower service.
   * @param {Hydrolysis} hydrolysis - The Hydrolysis service.
   * @param {Analyzer} analyzer - The Analyzer service.
   * @param {Catalog} catalog - The Catalog service.
   */
  constructor(bower, hydrolysis, analyzer, catalog) {
    this.bower = bower;
    this.hydrolysis = hydrolysis;
    this.analyzer = analyzer;
    this.catalog = catalog;
  }

  /**
   * Processes the next received task.
   * Gets the task, installs and pulls dependencies from Bower, runs Hydrolysis over it,
   * gathers all data, posts it back to Catalog and acks the task.
   * @param {Object} attributes - The task to be processed
   * @return {Promise} A promise that handles the next task.
   */
  processNextTask(attributes) {
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
      }).then(mainHtmlPaths => {
        const root = path.resolve(process.cwd(), 'bower_components', attributes.repo);
        if (!fs.existsSynnc(path)) {
          Ana.fail("analysis/processNextTask", taskAsString, "Installed package not found");
          reject("Installed package not found");
          return;
        }
        var relativePaths = mainHtmlPaths.map(x => path.relative(root, x));
        return Promise.all([
          this.hydrolysis.analyze(mainHtmlPaths),
          this.analyzer.analyze(root, relativePaths),
          this.bower.findDependencies(attributes.owner, attributes.repo, versionOrSha)]);
      }).then(results => {
        var data = results[0];
        data.analyzerData = results[1];
        data.bowerDependencies = results[2];
        return this.catalog.postResponse(data, attributes);
      }).then(() => {
        Ana.success("analysis/processNextTask", taskAsString);
        resolve();
      }).catch(errorHandler);
    });
  }
}

module.exports = Analysis;
