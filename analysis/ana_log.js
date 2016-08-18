'use strict';

class Ana {
  static success(counterPath) {
    var path = counterPath + "/success";
    if (arguments.length > 1) {
      var logArgs = [path].concat(Array.prototype.slice.call(arguments, 1));
      console.log.apply(null, logArgs);
    } else {
      console.log(path);
    }
  }
  static fail(counterPath) {
    var path = counterPath + "/fail";
    if (arguments.length > 1) {
      var logArgs = [path].concat(Array.prototype.slice.call(arguments, 1));
      console.log.apply(null, logArgs);
    } else {
      console.log(path);
    }
  }
  static log() {
    console.log.apply(null, arguments);
  }
}

module.exports = {
  Ana: Ana
};
