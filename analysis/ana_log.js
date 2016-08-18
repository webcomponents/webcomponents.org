'use strict';

class Ana {
  static success(counterPath) {
    var path = counterPath + "/success";
    if (arguments.length > 1) {
      console.log(path, ...Array.prototype.slice.call(arguments, 1));
    } else {
      console.log(path);
    }
  }
  static fail(counterPath) {
    var path = counterPath + "/fail";
    if (arguments.length > 1) {
      console.log(path, ...Array.prototype.slice.call(arguments, 1));
    } else {
      console.log(path);
    }
  }
  static log() {
    console.log(...arguments);
  }
}

module.exports = {
  Ana: Ana
};
