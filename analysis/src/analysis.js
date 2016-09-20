'use strict';

const Ana = require('./ana_log');

/**
 * Encapsulates the processing of each task.
 */
class Analysis {
  /**
   * Creates an Analysis using the given bower, hydrolysis and catalog services.
   * @param {Bower} bower - The Bower service.
   * @param {Hydrolysis} hydrolysis - The Hydrolysis service.
   * @param {Catalog} catalog - The Catalog service.
   */
  constructor(bower, hydrolysis, catalog) {
    this.bower = bower;
    this.hydrolysis = hydrolysis;
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
        Ana.fail("analysis/processNextTask", error, taskAsString);
        reject(error);
      };

      Ana.log("analysis/processNextTask", taskAsString);
      if (!attributes) {
        errorHandler("Task was missing attributes");
        return;
      }
      var versionOrSha = attributes.sha ? attributes.sha : attributes.version;
      this.bower.prune().then(() => {
        return this.bower.install(attributes.owner, attributes.repo, versionOrSha);
      }).then(mainHtmlPaths => {
        return Promise.all([
          this.hydrolysis.analyze(mainHtmlPaths),
          this.bower.findDependencies(attributes.owner, attributes.repo, versionOrSha)]);
      }).then(results => {
        var data = results[0];
        data.bowerDependencies = results[1];
        return this.catalog.postResponse(attributes.responseTopic, data, attributes);
      }).then(() => {
        Ana.success("analysis/processNextTask", taskAsString);
        resolve();
      }).catch(errorHandler);
    });
  }
}

module.exports = Analysis;
