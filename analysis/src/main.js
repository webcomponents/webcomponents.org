'use strict';

if (process.env.NODE_ENV === 'production') {
  require('@google/cloud-trace').start();
  require('@google/cloud-debug');
}

const Ana = require('./ana_log');
const Analysis = require('./analysis');
const AnalyzerRunner = require('./analyzer');
const Bower = require('./bower');
const Catalog = require('./catalog');
const DebugCatalog = require('./debug_catalog');

const bodyParser = require('body-parser');
const express = require('express');
const lockfile = require('lockfile');
const parseCommandLine = require('command-line-args')
const pubsub = require('@google-cloud/pubsub');

const app = express();

/**
 * Main entry point. Constructs all of the pieces, wires them up and executes
 * forever!! 'forever'...
 */
function processTasks() {

  const args = parseCommandLine([
    { name: 'responseTopic', type: String, multiple: false },
  ]);

  // Exit if the response topic wasn't set in a production environment.
  if (process.env.NODE_ENV && !args.responseTopic) {
    Ana.error("main/processTasks", "--responseTopic must be specified when running in a deployed GAE environment.");
    return;
  }

  var catalog;
  if (!process.env.NODE_ENV) {
    Ana.enableDebug();
    Ana.log("main/processTasks", "Debug mode - logging catalog responses to console.");
    catalog = new DebugCatalog();
  } else {
    Ana.log("main/processTasks", "Using project [", process.env.GAE_LONG_APP_ID, "] and response topic [", args.responseTopic, "]");
    catalog = new Catalog(pubsub({projectId: process.env.GAE_LONG_APP_ID}), args.responseTopic);
  }

  var analysis = new Analysis(
      new Bower(),
      new AnalyzerRunner(),
      catalog);

  var locky = new Date().toString() + ".lock";

  app.get('/task/analyze/:owner/:repo/:version/:sha*?', (req, res) => {
    Ana.newBuffer();
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
      res.sendStatus(403);
      return;
    }

    // force single-thread, immediately fail, expire lock after two minutes
    lockfile.lock(locky, {stale: 120000}, err => {
      if (err) {
        Ana.success("main/processTasks/busy/willRetry", JSON.stringify(attributes));
        res.sendStatus(503);
        return;
      }

      analysis.processNextTask(attributes).then(function() {
        Ana.success("main/processTasks");
        lockfile.unlockSync(locky, {});
        res.sendStatus(200);
      }, function(error) {
        lockfile.unlockSync(locky, {});
        if (error.retry) {
          Ana.fail("main/processTasks/willRetry");
          res.sendStatus(500);
        } else {
          Ana.fail("main/processTasks");
          attributes.error = "true";
          error.consoleOutput = Ana.readBuffer();
          if (error.error)
            delete error.error.picks;
          catalog.postResponse(error, attributes)
              .then(() => res.sendStatus(200))
              .catch(() => res.sendStatus(500));
        }
      });
    });
  });

  app.get('/_ah/health', (req, res) => {
    res.sendStatus(200);
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
