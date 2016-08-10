'use strict';

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
 * Handles polling for requests, sending responses etc...
 */
class CattledogPubsub {
  /**
   * Creates a catalog service using the given pubsub client. It will connect to
   * (or create) the specified topic and subscription.
   * @param {Object} pubsub - The pubsub client.
   * @param {string} topicAndSubscriptionName - The name to use for both the topic and subscription.
   */
  constructor(pubsub, topicAndSubscriptionName) {
    console.log("CATALOG: Using topic and subscription [" + topicAndSubscriptionName + "]");
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
        console.log("CATALOG: Topic " + topic.name);
        this.subscription = this.topic.subscription(this.name);
        this.subscription.get({ autoCreate: true}, (err, subscription) => {
          if (err) {
            reject(err);
            return;
          }
          this.subscription = subscription;
          console.log("CATALOG: Subscription " + subscription.name);
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
      console.log("CATALOG: Pulling next task");
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
    console.log("CATALOG: Acking message " + ackId);
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


  /**
   * Posts response data and attributes to the given topic.
   * @return {Promise} a promise for determining success.
   */
  postResponse(topicName, data, attributes) {
    return new Promise((resolve, reject) => {
      console.log("CATALOG: Posting response to " + topicName);

      // omit ridiculously huge (or circular) fields from JSON stringify
      removeProperties(data, ["scriptElement", "javascriptNode"]);
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

module.exports = {
  Catalog: CattledogPubsub
};