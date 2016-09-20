'use strict';

const Ana = require('./ana_log');
const Analysis = require('./analysis');
const Bower = require('./bower');
const Catalog = require('./catalog');
const Hydrolysis = require('./hydrolysis');

const pubsub = require('@google-cloud/pubsub');

const express = require('express');
const bodyParser = require('body-parser');
const lockfile = require('lockfile');

const app = express();
const jsonBodyParser = bodyParser.json();

/**
 * Main entry point. Constructs all of the pieces, wires them up and executes
 * forever!! 'forever'...
 */
function processTasks() {

  var project = process.env.GAE_LONG_APP_ID;
  var debug = false;

  // If NODE_ENV isn't set, we're probably not running in GAE,
  // so override the project with whatever the command line says.
  if (!process.env.NODE_ENV && process.argv.length == 3) {
    project = process.argv[2];
    debug = true;
  }

  Ana.log("main/processTasks", "Using project [", project, "]");
  var analysis = new Analysis(
      new Bower(),
      new Hydrolysis(),
      new Catalog(pubsub({projectId: project}), debug));

  var locky = new Date().toString() + ".lock";

  app.post('/process/next', jsonBodyParser, (req, res) => {
    var message = req.body.message;
    // force single-thread, immediately fail
    lockfile.lock(locky, {}, err => {
      if (err) {
        Ana.success("main/processTasks/busy/willRetry", JSON.stringify(message.attributes));
        res.status(503).send();
        return;
      }

      analysis.processNextTask(message).then(function() {
        Ana.success("main/processTasks");
        lockfile.unlockSync(locky, {});
        res.status(200).send();
      }, function(error) {
        lockfile.unlockSync(locky, {});
        if (error.retry) {
          Ana.fail("main/processTasks/willRetry");
          res.status(500).send();
        } else {
          Ana.fail("main/processTasks");
          res.status(200).send();
        }
      });
    });
  });

  app.listen(process.env.PORT || '8080', function() {
    Ana.success("main/processTasks/listen");
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

processTasks();
