'use strict';

var Console = require('console').Console;
var streamBuffers = require('stream-buffers');

var debug = false;

var logBuffer;
var bufferedConsole;

function initConsole() {
  logBuffer = new streamBuffers.WritableStreamBuffer({
    initialSize: (100 * 1024),
    incrementAmount: (10 * 1024)
  });
  bufferedConsole = new Console(logBuffer, logBuffer);
}

initConsole();

class Ana {
  static success(counterPath) {
    var path = counterPath + "/success";
    if (arguments.length > 1) {
      var logArgs = [path].concat(Array.prototype.slice.call(arguments, 1));
      console.log.apply(null, logArgs);
      bufferedConsole.log.apply(null, logArgs);
    } else {
      console.log(path);
      bufferedConsole.log(path);
    }
  }
  static fail(counterPath) {
    var path = counterPath + "/fail";
    if (arguments.length > 1) {
      var logArgs = [path].concat(Array.prototype.slice.call(arguments, 1));
      console.log.apply(null, logArgs);
      bufferedConsole.log.apply(null, logArgs);
    } else {
      console.log(path);
      bufferedConsole.log(path);
    }
  }
  static debug() {
    if (debug) {
      // Don't buffer debug logs
      console.log.apply(null, arguments);
    }
  }
  static log() {
    console.log.apply(null, arguments);
    bufferedConsole.log.apply(null, arguments);
  }
  static isDebug() {
    return debug;
  }
  static enableDebug() {
    debug = true;
  }
  static newBuffer() {
    initConsole();
  }
  static readBuffer() {
    return logBuffer.getContentsAsString('utf8');
  }
}

module.exports = Ana;
