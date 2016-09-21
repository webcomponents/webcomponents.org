'use strict';

if (process.env.NODE_ENV === 'production') {
  require('@google/cloud-trace').start();
  require('@google/cloud-debug');
}

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

/**
 * Main entry point. Constructs all of the pieces, wires them up and executes
 * forever!! 'forever'...
 */
function processTasks() {

  var project = process.env.GAE_LONG_APP_ID;

  // node main.js <responseTopic> <?project? - only used outside of GAE>
  var responseTopic = process.argv[2];

  // If NODE_ENV isn't set, we're not running in GAE,
  // so override the project with whatever the command line says.
  if (!process.env.NODE_ENV && process.argv.length == 4) {
    project = process.argv[3];
    Ana.enableDebug();
  }

  Ana.log("main/processTasks", "Using project [", project, "] and response topic [", responseTopic, "]");
  var analysis = new Analysis(
      new Bower(),
      new Hydrolysis(),
      new Catalog(pubsub({projectId: project}), responseTopic));

  var locky = new Date().toString() + ".lock";

  app.get('/task/analyze/:owner/:repo/:version/:sha*?', (req, res) => {
    var attributes = {
      owner: req.params.owner,
      repo: req.params.repo,
      version: req.params.version
    };
    if (req.params.sha) {
      attributes.sha = req.params.sha;
    }

    // We only accept requests from the task queue service.
    // This check is valid because appengine strips external x-appengine headers.
    // By definition, this is internal.
    if (!req.get('x-appengine-queuename')) {
      Ana.fail("main/processTasks/originator-not-appengine", JSON.stringify(attributes));
      res.status(403).send(); // Don't retry
      return;
    }

    // force single-thread, immediately fail, expire lock after two minutes
    lockfile.lock(locky, {stale: 120000}, err => {
      if (err) {
        Ana.success("main/processTasks/busy/willRetry", JSON.stringify(attributes));
        res.status(503).send();
        return;
      }

      analysis.processNextTask(attributes).then(function() {
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

  app.get('/_ah/health', (req, res) => {
    res.status(200).send();
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
