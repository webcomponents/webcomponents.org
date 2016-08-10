'use strict';

const hyd = require('hydrolysis');

/**
 * Service for running Hydrolysis on the local machine.
 */
class Hydrolysis {
  /**
   * Runs Hydrolysis against each main html file in the given list.
   * Merges Element and Behavior key/values from each main html into one set each.
   * Output looks like {elementsByTagName:{}, behaviorsByName:{}}.
   * @param {Array.<string>} mainHtmlPaths - paths to mainHtml files
   * @return {Promise.<Array.<Object>>} a promise, returning the element and behavior data.
   */
  analyze(mainHtmlPaths) {
    /* run Hydrolysis on given paths and extract relevant data */
    return new Promise((resolve, reject) => {
      console.log("HYDROLYZER: Analyzing " + mainHtmlPaths);
      var data = {
        elementsByTagName: {},
        behaviorsByName: {}
      };

      Promise.all(
        mainHtmlPaths.map(function(mainHtmlPath) {
          return hyd.Analyzer.analyze(mainHtmlPath, { clean:true })
            .then(function(result) {
              data.elementsByTagName = Object.assign(result.elementsByTagName, data.elementsByTagName);
              data.behaviorsByName = Object.assign(result.behaviorsByName, data.behaviorsByName);
            }).catch(function() {
              console.error("HYDROLYZER: Error hydrolyzing " + mainHtmlPath);
            });
        })
      ).then(function() {
        resolve(data);
      });
    });
  }
}

module.exports = {
  Hydrolysis: Hydrolysis
};