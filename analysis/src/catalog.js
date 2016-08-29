'use strict';

const Ana = require('./ana_log');

/**
 * @param {Object} obj - The object to strip properties from.
 * @param {Array.<string>} properties - An array of property names to remove.
 */
function removeProperties(obj, properties) {
  if (!properties || !obj) return;
  if (typeof obj === 'object') {
    for (var prop of properties) {
      delete obj[prop];
    }
    Object.keys(obj).forEach(x => removeProperties(obj[x], properties));
  } else if (Array.isArray(obj)) {
    obj.forEach(val => removeProperties(val, properties));
  }
}

/**
 * Service for communicating with the catalog servers.
 */
class Catalog {
  /**
   * Creates a catalog service using the given pubsub client. It will connect to
   * (or create) the specified topic and subscription.
   * @param {Object} pubsub - The pubsub client.
   */
  constructor(pubsub) {
    Ana.log("catalog/constructor");
    this.pubsub = pubsub;
  }

  /**
   * Posts response data and attributes to the given topic.
   * @param {string} topicName the name of the topic to post back to.
   * @param {Object} data the response data to send back.
   * @param {Object} attributes original request attributes to send with response.
   * @return {Promise} a promise for determining success.
   */
  postResponse(topicName, data, attributes) {
    return new Promise((resolve, reject) => {
      Ana.log("catalog/postResponse", topicName);
      // omit ridiculously huge (or circular) fields from JSON stringify
      removeProperties(data, ["scriptElement", "javascriptNode"]);
      this.pubsub.topic(topicName).publish({
        data: data,
        attributes: attributes
      }, function(error) {
        if (error) {
          Ana.fail("catalog/postResponse", topicName);
          reject(Error(error));
        } else {
          Ana.success("catalog/postResponse", topicName);
          resolve();
        }
      });
    });
  }
}

module.exports = Catalog;
