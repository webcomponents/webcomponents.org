'use strict';

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
   * Processes the next task from the Catalog queue.
   * Gets the task, installs and pulls dependencies from Bower, runs Hydrolysis over it,
   * gathers all data, posts it back to Catalog and acks the task.
   */
  processNextTask() {
    return new Promise((resolve, reject) => {
      this.catalog.nextTask().then((message) => {
        var ackId = message.ackId;
        var errorHandler = (error) => {
          this.catalog.ackTask(ackId);
          reject(error);
        }

        var attributes = message.attributes;

        console.log("CATALOG: Task params " + JSON.stringify(attributes));
        if (!attributes) {
          errorHandler("Task was missing attributes");
          return;
        }

        this.bower.prune().then(() => {
          return this.bower.install(attributes.owner, attributes.repo, attributes.version);
        }).then((mainHtmlPaths) => {
          return Promise.all([
            this.hydrolysis.analyze(mainHtmlPaths),
            this.bower.findDependencies(attributes.owner, attributes.repo, attributes.version)]);
        }).then((results) => {
          var data = results[0];
          data['bowerDependencies'] = results[1];
          return this.catalog.postResponse(attributes.responseTopic, data, attributes);
        }).then(() => {
          this.catalog.ackTask(ackId);
          resolve();
        }).catch(errorHandler);
      }, reject);
    });
  }
}

module.exports = {
  Analysis: Analysis
};