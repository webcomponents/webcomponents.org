'use strict';

const bower = require('bower');
const child_process = require('child_process');
const gcloud = require('gcloud');
const hyd = require('hydrolysis');
const repeat = require('repeat');
const url = require('url');

/**
 * Service for communicating with the catalog servers.
 * Handles polling for requests, sending responses etc...
 */
class Cattledog {
  /**
   * Creates a catalog service using the given pubsub client. It will connect to
   * (or create) the specified topic and subscription.
   * @param {Object} pubsub - The pubsub client.
   * @param {string} topicAndSubscriptionName - The name to use for both the topic and subscription.
   */
  constructor(pubsub, topicAndSubscriptionName) {
    console.log("CATTLEDOG: Using topic and subscription [" + topicAndSubscriptionName + "]");
    this.pubsub = pubsub;
    this.name = topicAndSubscriptionName;
    this.topic = pubsub.topic(topicAndSubscriptionName);
  }

  /**
   * Connects to, or creates the topic and subscription previously specified in the constructor.
   */
  init() {
    return new Promise((resolve, reject) => {
      this.topic.get({ autoCreate: true }, (err, topic) => {
        if (err) {
          reject(err);
          return;
        }
        this.topic = topic;
        console.log("CATTLEDOG: Topic " + topic.name);
        this.subscription = this.topic.subscription(this.name);
        this.subscription.get({ autoCreate: true}, (err, subscription) => {
          if (err) {
            reject(err);
            return;
          }
          this.subscription = subscription;
          console.log("CATTLEDOG: Subscription " + subscription.name);
          resolve();
        });
      });
    });
  }

  /**
   * Polls for the next pending task.
   * @return {Promise.<Object>} a promise for a single pending task.
   */
  nextTask() {
    return new Promise((resolve, reject) => {
      console.log("CATTLEDOG: Pulling next task");
      this.subscription.pull({
        returnImmediately: false,
        maxMessages: 1
      }, function(error, messages) {
        if (error) {
          reject(Error(error));
        } else {
          if (!messages || messages.length == 0) {
            reject("No tasks pending");
          } else {
            resolve(messages[0]);
          }
        }
      });
    });
  }

  /**
   * Acknowledge a completed task, to prevent it from coming back.
   * @return {Promise} a promise for determining success.
   */
  ackTask(ackId) {
    console.log("CATTLEDOG: Acking message " + ackId);
    return new Promise((resolve, reject) => {
      this.subscription.ack(ackId, function(error, apiResponse) {
        if (error) {
          reject(Error(error));
        } else {
          resolve();
        }
      });
    });
  }

  static removeProperties(obj, properties) {
    if (!properties || !obj) return;
    if (typeof obj === 'object') {
      for (var prop of properties) {
        delete obj[prop];
      }
      Object.keys(obj).forEach(x => Cattledog.removeProperties(obj[x], properties));
    } else if (Array.isArray(obj)) {
      obj.forEach(val => Cattledog.removeProperties(val, properties));
    }
  }

  /**
   * Posts response data and attributes to the given topic.
   * @return {Promise} a promise for determining success.
   */
  postResponse(topicName, data, attributes) {
    return new Promise((resolve, reject) => {
      console.log("CATTLEDOG: Posting response to " + topicName);

      // omit ridiculously huge (or circular) fields from JSON stringify
      Cattledog.removeProperties(data, ["scriptElement", "javascriptNode"]);
      this.pubsub.topic(topicName).publish({
        data: data,
        attributes: attributes
      }, function(error) {
        if (error) {
          reject(Error(error));
        } else {
          resolve();
        }
      });
    });
  }
}

/**
 * Service for communicating with Bower on the local machine.
 * Provides support for installing packages, enumerating their dependencies etc...
 * Accurate information will only be obtained by using Bower for one main package at a time.
 * Sadly, this means a flow of "install, dependencies, prune".
 */
class Bower {
  /**
   * Clean up (rm -rf) the local Bower working area.
   * This deletes the installs for this directory, not the Bower cache (usually stored in ~/.cache/bower).
   */
  prune() {
    return new Promise((resolve, reject) => {
      console.log("BOWER: Pruning");
      child_process.exec("rm -rf bower_components", function(err) {
        if (err) {
          reject(Error(err));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Installs the specified Bower package and analyses it for main html files in the bower.json,
   * returning a list of them via the promise.
   * @param {string} owner - the package owner
   * @param {string} repo - the package repository name
   * @param {string} version - the package version code
   * @return {Promise} a promise, returning a list of main html files found.
   */
  install(owner, repo, version) {
    var packageWithOwner = owner + "/" + repo;
    var packageToInstall = packageWithOwner + "#" + version;
    return new Promise((resolve, reject) => {
      console.log("BOWER: Installing " + packageToInstall);
      bower.commands.install([packageToInstall]).on('end', function(installed) {
        for (let bowerPackage in installed) {
          if (installed[bowerPackage].endpoint.source != packageWithOwner) {
            // Skip over dependencies (we're not interested in them)
            continue;
          }
          console.log("BOWER: Examining " + bowerPackage);

          var canonicalDir = installed[bowerPackage].canonicalDir;
          var mainHtmls = installed[bowerPackage].pkgMeta.main;
          if (!mainHtmls) {
            // TODO: Look in the directory and see what .html files we might be able to consume.
            reject(Error("Installed, but no main.html found"));
            return;
          }

          if (!Array.isArray(mainHtmls)) {
            mainHtmls = [mainHtmls];
          }

          resolve(mainHtmls.map(function(mainHtml) {
            return canonicalDir + "/" + mainHtml;
          }));
          return;
        }
        reject(Error("No matching packages were installed."));
      }).on('error', function(error) {
        reject(Error(error));
      });
    });
  }

  /**
   * Gathers transitive runtime dependencies for the given package as well as the
   * declared development dependencies (but not their dependencies).
   * The dependency list gathered should be enough to run any demos for the given
   * package.
   * Dependencies look like {name:string, owner:string, repo:string, version:string}.
   * @param {string} owner - the package owner
   * @param {string} repo - the package repository name
   * @param {string} version - the package version code
   * @return {Promise.<Array.<object>>} a promise, returning a list of dependency objects.
   */
  findDependencies(owner, repo, version) {
    var ownerPackageVersionString = owner + "/" + repo + "#" + version;
    console.log("BOWER: Finding transitive dependencies for " + ownerPackageVersionString);

    // The Bower API is pretty annoying. Unless the results are cached it will not reliably
    // report the github tag that it used to download the correct dependencies. In order
    // to make it do what we want, we need to do two dependency walks - one (online) to
    // populate the cache and another (offline) to gather the results.
    return Bower.dependencies(ownerPackageVersionString, {}, false).then(() => {
      return Bower.dependencies(ownerPackageVersionString, {}, true);
    });
  }

  static dependencies(ownerPackageVersionString, processed, offline) {
    return Bower.infoPromise(ownerPackageVersionString, offline).then((info) => {
      // Gather all of the dependencies we want to look at.
      var depsToProcess =
          Object.assign(info.dependencies ? info.dependencies : {},
          Object.keys(processed).length == 0 && info.devDependencies ? info.devDependencies : {});

      // Filter out what we've already processed.
      Object.keys(depsToProcess).forEach((key) => {
        if (processed[key]) {
          delete depsToProcess[key];
        }
      });

      var result = info.metadata ? [info.metadata] : [];

      var keys = Object.keys(depsToProcess);
      if (!keys.length) {
        return result;
      }

      // Analyse all of the dependencies we have left.
      var promises = keys.map((key) => {
        processed[key] = key;

        // Sanitize packages in ludicrous formats.
        var packageToProcess = depsToProcess[key];
        if (!packageToProcess.includes("/")) {
          packageToProcess = key + "#" + packageToProcess;
        }

        return Bower.dependencies(packageToProcess, processed, offline);
      });

      return Promise.all(promises).then((dependencyList) => [].concat.apply(result, dependencyList));
    });
  }

  static infoPromise(ownerPackageVersionString, offline) {
    return new Promise((resolve, reject) => {
      var metadata = null;
      bower.commands.info(
        ownerPackageVersionString,
        undefined /* property */,
        {
          offline: offline
        }
      ).on('end', function(info) {
        info.metadata = metadata;
        resolve(info);
      }).on('error', function(error) {
        console.error(error);
        resolve({});
      }).on('log', function(logEntry) {
        if (logEntry.id == 'cached' && logEntry.data && logEntry.data.pkgMeta &&
          logEntry.data.pkgMeta._resolution) {
          var owner, repo = "";
          // Our package strings look like "Owner/Repo#1.2.3"
          if (ownerPackageVersionString.includes("/")) {
            owner = ownerPackageVersionString;
            repo = owner.substring(owner.lastIndexOf("/") + 1, owner.lastIndexOf("#"));
            owner = owner.substring(0, owner.lastIndexOf("/"));
          } else {
            // These uris look like "git://github.com/Owner/Repo.git"
            owner = url.parse(logEntry.data.resolver.source).pathname;
            repo = owner.substring(owner.lastIndexOf("/") + 1, owner.lastIndexOf("."));
            owner = owner.substring(1 /* skip leading slash */, owner.lastIndexOf("/"));
          }
          metadata = {
            name: logEntry.data.pkgMeta.name,
            version: logEntry.data.pkgMeta._resolution.tag,
            owner: owner,
            repo: repo
          }
        }
      });
    });
  }
}

/**
 * Service for running Hydrolysis on the local machine.
 */
class Hydrolysis {
  /**
   * Runs Hydrolysis against each main html file in the given list.
   * Merges Element and Behavior key/values from each main html into one set each.
   * Output looks like {elementsByTagName:{}, behaviorsByName:{}}.
   * @param {Array.<string>} mainHtmlPaths - paths to mainHtml files
   * @return {Promise.<Array.<Object>>} a promise, returning the element and behavior data.
   */
  analyze(mainHtmlPaths) {
    /* run Hydrolysis on given paths and extract relevant data */
    return new Promise((resolve, reject) => {
      console.log("HYDROLYZER: Analyzing " + mainHtmlPaths);
      var data = {
        elementsByTagName: {},
        behaviorsByName: {}
      };

      Promise.all(
        mainHtmlPaths.map(function(mainHtmlPath) {
          return hyd.Analyzer.analyze(mainHtmlPath, { clean:true })
            .then(function(result) {
              data.elementsByTagName = Object.assign(result.elementsByTagName, data.elementsByTagName);
              data.behaviorsByName = Object.assign(result.behaviorsByName, data.behaviorsByName);
            }).catch(function() {
              console.error("HYDROLYZER: Error hydrolyzing " + mainHtmlPath);
            });
        })
      ).then(function() {
        resolve(data);
      });
    });
  }
}

/**
 * Encapsulates the processing of each task.
 */
class Hydro {
  /**
   * Creates a Hydro using the given bower, hydrolysis and cattledog services.
   * @param {Bower} bower - The Bower service.
   * @param {Hydrolysis} hydrolysis - The Hydrolysis service.
   * @param {Cattledog} cattledog - The Cattledog service.
   */
  constructor(bower, hydrolyzer, cattledog) {
    this.bower = bower;
    this.hydrolyzer = hydrolyzer;
    this.cattledog = cattledog;
  }

  /**
   * Processes the next task from the Cattledog queue.
   * Gets the task, installs and pulls dependencies from Bower, runs Hydrolysis over it,
   * gathers all data, posts it back to Cattledog and acks the task.
   */
  processNextTask() {
    return new Promise((resolve, reject) => {
      this.cattledog.nextTask().then((message) => {
        var ackId = message.ackId;
        var errorHandler = (error) => {
          this.cattledog.ackTask(ackId);
          reject(error);
        }

        var attributes = message.attributes;

        console.log("CATTLEDOG: Task params " + JSON.stringify(attributes));
        if (!attributes) {
          errorHandler("Task was missing attributes");
          return;
        }

        this.bower.prune().then(() => {
          return this.bower.install(attributes.owner, attributes.repo, attributes.version);
        }).then((mainHtmlPaths) => {
          return Promise.all([
            this.hydrolyzer.analyze(mainHtmlPaths),
            this.bower.findDependencies(attributes.owner, attributes.repo, attributes.version)]);
        }).then((results) => {
          var data = results[0];
          data['bowerDependencies'] = results[1];
          return this.cattledog.postResponse(attributes.responseTopic, data, attributes);
        }).then(() => {
          this.cattledog.ackTask(ackId);
          resolve();
        }).catch(errorHandler);
      }, reject);
    });
  }
}

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
  var cattledog = new Cattledog(
      gcloud.pubsub({ projectId: project }),
      subscription);
  cattledog.init().then(() => {
    console.log("Using project [" + project + "] and subscription [" + subscription + "]");
    var hydro = new Hydro(
      new Bower(),
      new Hydrolysis(),
      cattledog);
      repeat(function(done) {
        hydro.processNextTask().then(function() {
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
