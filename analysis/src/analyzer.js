'use strict';

const Ana = require('./ana_log');

const PolymerAnalyzer = require('polymer-analyzer').Analyzer;
const Element = require('polymer-analyzer/lib/model/model').Element;
const FSUrlLoader = require('polymer-analyzer/lib/url-loader/fs-url-loader').FSUrlLoader;
const PackageUrlResolver = require('polymer-analyzer/lib/url-loader/package-url-resolver').PackageUrlResolver;
const path = require('path');

/**
 * @param {Object} obj - The object to strip properties from.
 * @param {Array.<string>} properties - An array of property names to remove.
 * @param {number} depth - The current depth of the recursion.
 */
function removeProperties(obj, properties, depth) {
  // Bail after 10 deep so that we don't blow the stack.
  if (!properties || !obj || depth > 10) return;
  if (typeof obj === 'object') {
    for (var prop of properties) {
      delete obj[prop];
    }
    Object.keys(obj).forEach(x => removeProperties(obj[x], properties, depth + 1));
  } else if (Array.isArray(obj)) {
    obj.forEach(val => removeProperties(val, properties, depth + 1));
  }
}

function remove(obj) {
  removeProperties(obj, ["scriptElement", "javascriptNode",
      "observerNode", "astNode", "sourceRange", "domModule"], 0);
}

/**
 * Service for running Polymer Analyzer on the local machine.
 */
class Analyzer {

  /**
   * Creates an Analyzer!
   */
  constructor() {
    this.analyzer = new PolymerAnalyzer({
      urlLoader: new FSUrlLoader("/"),
      urlResolver: new PackageUrlResolver(),
    });
  }

  /**
   * Runs Polymer Analyzer against each main html file in the given list.
   * Merges Element and Behavior key/values from each main html into one set each.
   * Output looks like {elementsByTagName:{}, behaviorsByName:{}}.
   * @param {Array.<string>} mainHtmlPaths - paths to mainHtml files
   * @return {Promise.<Array.<Object>>} a promise, returning the element and behavior data.
   */
  analyze(mainHtmlPaths) {
    /*
     * Run Analyzis on given paths and extract relevant data. Failure is fine, we just ignore it.
     */
    return new Promise(resolve => {
      Ana.log("analyzer/analyze", mainHtmlPaths);
      var data = {
        elementsByTagName: {},
        behaviorsByName: {}
      };

      Promise.all(
        mainHtmlPaths.map(mainHtmlPath => {
          var dirName = path.dirname(mainHtmlPath);
          var skipItem = item => path.relative(dirName, "/" + item.sourceRange.file).includes("..");

          return this.analyzer.analyze(mainHtmlPath).then(document => {
            var elements = document.getByKind('element');
            elements.forEach(element => {
              if (skipItem(element)) return;

              data.elementsByTagName[element.tagName] = element;
              remove(data.elementsByTagName[element.tagName])
            });
            var behaviors = document.getByKind('behavior');
            behaviors.forEach(behavior => {
              if (skipItem(behavior)) return;

              data.behaviorsByName[behavior.className] = behavior;
              remove(data.behaviorsByName[behavior.className])
            });
          }).catch(error => {
            Ana.fail("analyzer/analyze", mainHtmlPath, error);
          });
        })
      ).then(function() {
        Ana.success("analyzer/analyze", mainHtmlPaths);
        resolve(data);
      });
    });
  }
}

module.exports = Analyzer;