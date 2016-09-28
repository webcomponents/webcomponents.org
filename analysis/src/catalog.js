'use strict';

const Ana = require('./ana_log');


/**
 * Service for communicating with the catalog servers.
 */
class Catalog {
  /**
   * Creates a catalog service using the given pubsub client. It will connect to
   * (or create) the specified topic and subscription.
   * @param {Object} pubsub - The pubsub client.
   * @param {string} responseTopic The topic for responses.
   */
  constructor(pubsub, responseTopic) {
    Ana.log("catalog/constructor");
    this.pubsub = pubsub;
    this.responseTopic = responseTopic;
  }

  /**
   * Posts response data and attributes to the given topic.
   * @param {Object} data the response data to send back.
   * @param {Object} attributes original request attributes to send with response.
   * @return {Promise} a promise for determining success.
   */
  postResponse(data, attributes) {
    return new Promise((resolve, reject) => {
      Ana.log("catalog/postResponse");

      if (Ana.isDebug()) {
        Ana.log("catalog/postResponse/debug attributes ", JSON.stringify(attributes));
        Ana.log("catalog/postResponse/debug data ", JSON.stringify(data, null, '\t'));
      }
      this.pubsub.topic(this.responseTopic).publish({
        data: data,
        attributes: attributes
      }, function(error) {
        if (error) {
          Ana.fail("catalog/postResponse");
          reject(Error(error));
        } else {
          Ana.success("catalog/postResponse");
          resolve();
        }
      });
    });
  }
}

module.exports = Catalog;
