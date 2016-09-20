'use strict';

const Ana = require('./ana_log');
const hyd = require('hydrolysis');
const path = require('path');

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
        mainHtmlPaths.map(mainHtmlPath => {
          return hyd.Analyzer.analyze(mainHtmlPath, {clean: true, filter: () => false})
            .then(analyzer => {

              // There's a weird name.indexOf === 0 thing in hydrolysis that means that
              // paper-dialog-x will be included in paper-dialog. We don't want that, so
              // we need to add this additional filtering.
              var pathFilter = item => {
                return !path.relative(item.contentHref, mainHtmlPath).includes("..");
              };

              // Get only the elements in the folder containing the element we're looking at.
              var elements = analyzer.elementsForFolder(mainHtmlPath).filter(pathFilter);
              var behaviors = analyzer.behaviorsForFolder(mainHtmlPath).filter(pathFilter);

              Ana.debug("Got elements and behaviors");
              // Ana.debug("Elements", elements);
              Ana.debug("Behaviors", behaviors);

              // Strip useless (bloated) parts from the elements.
              elements.forEach(element => {
                element.scriptElement = undefined;
                element.properties && element.properties.forEach(property => {
                  property.javascriptNode = undefined;
                });
              });
              Ana.debug("Filtered elements");

              // Get the element names that were in the folder.
              var els = elements.map(el => el.is);
              var bes = behaviors.map(be => be.is);
              Ana.debug("Elements", els);
              Ana.debug("Behaviors", bes);

              // Copy the elements from the folder to our output data.
              els.forEach(el => {
                data.elementsByTagName[el] = elements[els.indexOf(el)];
              });
              bes.forEach(be => {
                data.behaviorsByName[be] = behaviors[bes.indexOf(be)];
              });

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

module.exports = Hydrolysis;
