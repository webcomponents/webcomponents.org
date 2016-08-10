'use strict';

const Bower = require('./bower').Bower;
const Hydrolysis = require('./hydrolysis').Hydrolysis;
const Catalog = require('./catalog').Catalog;
const Analysis = require('./analysis').Analysis;

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
      gcloud.pubsub({ projectId: project }),
      subscription);
  catalog.init().then(() => {
    console.log("Using project [" + project + "] and subscription [" + subscription + "]");
    var analysis = new Analysis(
      new Bower(),
      new Hydrolysis(),
      catalog);
      repeat(function(done) {
        analysis.processNextTask().then(function() {
          done();
        }, function(error) {
          console.error("ERROR: " + error);
          done();
        });
      })
      .every(1000, 'ms')
      .start();
  });
}

process.on('uncaughtException', function(err) {
  // At least log uncaught exceptions...
  console.log(err);
});

processTasksForever();
