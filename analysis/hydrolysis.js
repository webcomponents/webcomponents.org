'use strict';

const Ana = require('./ana_log').Ana;
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
    /*
     * Run Hydrolysis on given paths and extract relevant data. Failure is fine, we just ignore it.
     */
    return new Promise(resolve => {
      Ana.log("hydrolysis/analyze", mainHtmlPaths);
      var data = {
        elementsByTagName: {},
        behaviorsByName: {}
      };

      Promise.all(
        mainHtmlPaths.map(function(mainHtmlPath) {
          return hyd.Analyzer.analyze(mainHtmlPath, {clean: true})
            .then(function(result) {
              data.elementsByTagName = Object.assign(result.elementsByTagName, data.elementsByTagName);
              data.behaviorsByName = Object.assign(result.behaviorsByName, data.behaviorsByName);
            }).catch(function() {
              Ana.fail("hydrolysis/analyze", mainHtmlPath);
            });
        })
      ).then(function() {
        Ana.success("hydrolysis/analyze", mainHtmlPaths);
        resolve(data);
      });
    });
  }
}

module.exports = {
  Hydrolysis: Hydrolysis
};
