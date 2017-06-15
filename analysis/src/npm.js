'use strict';

const npm = require('npm');
const childProcess = require('child_process');
const url = require('url');
const path = require('path');
const fs = require('fs');

const Ana = require('./ana_log');

const fatalErrorCodes = [];

var npmBin = require.resolve('../node_modules/npm/bin/npm-cli.js');
var nodeBin = process.env.npm_node_execpath || process.env.NODE || process.execPath;

/**
 * Service for communicating with Bower on the local machine.
 * Provides support for installing packages, enumerating their dependencies etc...
 */
class NPM {
  constructor() {
    // Create a safe environment for us to install so dependencies of this app
    // aren't affected by new packages.
    if (!fs.existsSync('installed')){
      fs.mkdirSync('installed');
    }
    fs.writeFileSync('installed/package.json', '{}');
    npm.load();
  }

  _exec(cmd, opts) {
    return new Promise((resolve, reject) => {
      cmd = [npmBin].concat(cmd);
      opts = opts || {};
      opts.env = process.env;

      var stdout = ''
      var stderr = ''
      var child = childProcess.spawn(nodeBin, cmd, opts);

      if (child.stderr) {
        child.stderr.on('data', function (chunk) {
          stderr += chunk;
        });
      }

      if (child.stdout) {
        child.stdout.on('data', function (chunk) {
          stdout += chunk;
        });
      }

      child.on('error', reject);

      child.on('close', function (code) {
        resolve([code, stdout, stderr]);
      });
    });
  };

 /**
  * Clean up (rm -rf) the working area.
  * @return {Promise} A promise handling the prune operation.
  */
  prune() {
    return new Promise((resolve, reject) => {
      Ana.log("npm/prune");
      childProcess.exec("rm -rf installed/node_modules", function(err) {
        if (err) {
          Ana.fail("npm/prune");
          reject({retry: true, error: err});
        } else {
          Ana.success("npm/prune");
          resolve();
        }
      });
    });
  }

  install(scope, packageName, version) {
    const scopePath = scope == '@@npm' ? '' : scope + '/';
    const packageToInstall = scopePath + packageName + '@' + version;
    Ana.log('npm/install', packageToInstall);
    return new Promise((resolve, reject) => {
      let opts = {
        cwd: path.resolve('installed')
      };
      this._exec(['install', '--loglevel=silent', '--no-save', '--only=prod', packageToInstall], opts).then((code, stdout, stderr) => {
        if (code != 0) {
          console.log(code);
          reject();
        }
        resolve();
      }).catch(error => {
        Ana.fail('npm/install', packageToInstall);
        var retry = true;
        // TODO(samli): should be getting ETARGET when the package isn't found.
        if (error.code && fatalErrorCodes.indexOf(error.code) != -1 || error instanceof TypeError) {
          retry = false;
        }
        reject({retry: retry, error: error});
      });
    });
  }
}

module.exports = NPM;
