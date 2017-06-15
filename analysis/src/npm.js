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
      fs.writeFileSync('installed/package.json', '{}');
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

  _packageToInstall(scope, packageName, version) {
    const scopePath = scope == '@@npm' ? '' : scope + '/';
    return scopePath + packageName + '@' + version;
  }

  install(scope, packageName, version) {
    const packageToInstall = this._packageToInstall(scope, packageName, version);
    Ana.log('npm/install', packageToInstall);
    return new Promise((resolve, reject) => {
      let opts = {
        cwd: path.resolve('installed')
      };
      this._exec(['install', '--loglevel=silent', '--save', '--only=prod', packageToInstall], opts).then((code, stdout, stderr) => {
        if (code != 0) {
          // TODO(samli): there's an error!
          // ETARGET seems to have a code of 1
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

  _getDependencies(obj) {
    var result = [];
    if (!obj.dependencies)
      return result;
    Object.keys(obj.dependencies).forEach(key => {
      result.push(key + '@' + obj.dependencies[key].version);
      result = result.concat(this._getDependencies(obj.dependencies[key]));
    });
    return result;
  }

  findDependencies(scope, packageName, version) {
    const scopePath = scope == '@@npm' ? '' : scope + '/';
    const packageString = this._packageToInstall(scope, packageName, version);
    Ana.log('npm/findDependencies', packageString);
    return new Promise((resolve, reject) => {
      let opts = {
        cwd: path.resolve('installed')
      };
      this._exec(['list', '--json', '--loglevel', 'silent', '--prod'], opts).then((result) => {
        const [code, stdout, stderr] = result;
        // Don't reject() since NPM can return non zero codes for warnings like
        // unmet dependencies, extraneous etc.
        if (code != 0) {
          Ana.log('npm/findDependencies', packageString, 'returned code:', code);
        }

        // For some reason this breaks on really large sets of dependencies.
        var info;
        try {
          info = JSON.parse(stdout || {});
        } catch(e) {
          reject({retry: false, error: error});
          return;
        }
        const deps = this._getDependencies(info.dependencies[scopePath + packageName]);
        resolve(deps);
      }).catch(error => {
        Ana.fail('npm/findDependencies', packageString);
        reject({retry: false, error: error});
      });
    });
  }
}

module.exports = NPM;
