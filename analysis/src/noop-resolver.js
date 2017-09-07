'use strict';

class NoOpResolver {
  canResolve() {
    return true;
  }

  resolve(url) {
    return url;
  }
}

module.exports = NoOpResolver;
