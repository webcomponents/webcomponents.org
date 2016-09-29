'use strict';

const Ana = require('./ana_log');

/**
 * Service for just logging theoretical communication with catalog servers.
 */
class DebugCatalog {

  /**
   * Logs response data and attributes to the console.
   * @param {Object} data the response data to send back.
   * @param {Object} attributes original request attributes to send with response.
   * @return {Promise} a promise for determining success.
   */
  postResponse(data, attributes) {
    return new Promise((resolve, reject) => {
      Ana.log("catalog/postResponse");
      Ana.log("catalog/postResponse/debug attributes ", JSON.stringify(attributes));
      Ana.log("catalog/postResponse/debug data ", JSON.stringify(data, null, '\t'));
      resolve();
      return;
    });
  }
}

module.exports = DebugCatalog;
