'use strict';

const Ana = require('./ana_log').Ana;
const Analysis = require('./analysis').Analysis;
const Bower = require('./bower').Bower;
const Catalog = require('./catalog').Catalog;
const Hydrolysis = require('./hydrolysis').Hydrolysis;

const gcloud = require('gcloud');
const repeat = require('repeat');

/**
 * Main entry point. Constructs all of the pieces, wires them up and executes
 * forever!! 'forever'...
 */
function processTasksForever() {
  var project = process.env.PROJECT;
  var subscription = process.env.SUBSCRIPTION;

  // Override the subscription for command line execution.
  if (process.argv.length == 4) {
    project = process.argv[2];
    subscription = process.argv[3];
  }

  var catalog = new Catalog(
      gcloud.pubsub({projectId: project}),
      subscription);

  catalog.init().then(() => {
    Ana.log("main/processTasksForever", "Using project [", project, "] and subscription [", subscription, "]");
    var analysis = new Analysis(new Bower(), new Hydrolysis(), catalog);
    repeat(function(done) {
      analysis.processNextTask().then(function() {
        Ana.success("main/processTasksForever");
        done();
      }, function(/* error */) {
        Ana.fail("main/processTasksForever");
        done();
      });
    })
    .every(1000, 'ms')
    .start();
  });
}

process.on('uncaughtException', function(err) {
  // At least log uncaught exceptions...
  Ana.fail("main/uncaughtException", err);
  Ana.log("main/uncaughtException %s", err);
});

process.on('unhandledRejection', function(err) {
  // At least log uncaught exceptions...
  Ana.fail("main/unhandledRejection", err);
  Ana.log("main/unhandledRejection %s", err);
});

processTasksForever();
