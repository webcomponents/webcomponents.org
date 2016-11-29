'use strict';

const PolymerAnalyzer = require('polymer-analyzer').Analyzer;
const Element = require('polymer-analyzer/lib/model/model').Element;
const FSUrlLoader = require('polymer-analyzer/lib/url-loader/fs-url-loader').FSUrlLoader;
const PackageUrlResolver = require('polymer-analyzer/lib/url-loader/package-url-resolver').PackageUrlResolver;
const generateElementMetadata = require('polymer-analyzer/lib/generate-elements').generateElementMetadata;


let analyzer = new PolymerAnalyzer({
  urlLoader: new FSUrlLoader("bower_components"),
  urlResolver: new PackageUrlResolver(),
});


var gDocument;
// analyzer.analyze('iron-pages/iron-pages.html').then(document => {
analyzer.analyze('paper-button/paper-button.html').then(aDocument => {
  gDocument = aDocument;
  console.log(gDocument);
}).catch(error => {
  console.log(error);
});


// var elements = Array.from(gDocument.getByKind('element'));
// var metadata = generateElementMetadata(elements, '');

// elements.forEach(x => console.log(x.tagName, "\t\t", x.sourceRange.file));

// elements.forEach(x => console.log(x.tagName, "\t\t", x.sourceRange.file, x.kinds));




// /**
//  * Service for running Polymer Analyzer on the local machine.
//  */
// class Analyzer {
//   /**
//    * Runs Polymer Analyzer against each main html file in the given list.
//    * Merges Element and Behavior key/values from each main html into one set each.
//    * Output looks like {elementsByTagName:{}, behaviorsByName:{}}.
//    * @param {Array.<string>} mainHtmlPaths - paths to mainHtml files
//    * @return {Promise.<Array.<Object>>} a promise, returning the element and behavior data.
//    */
//   analyze(mainHtmlPaths) {
//     /*
//      * Run Hydrolysis on given paths and extract relevant data. Failure is fine, we just ignore it.
//      */
//     return new Promise(resolve => {
//       Ana.log("analyzer/analyze", mainHtmlPaths);
//       var data = {
//         elementsByTagName: {},
//         behaviorsByName: {}
//       };

//       Promise.all(
//         mainHtmlPaths.map(function(mainHtmlPath) {
//           return hyd.Analyzer.analyze(mainHtmlPath, {clean: true})
//             .then(function(result) {
//               data.elementsByTagName = Object.assign(result.elementsByTagName, data.elementsByTagName);
//               data.behaviorsByName = Object.assign(result.behaviorsByName, data.behaviorsByName);
//             }).catch(function() {
//               Ana.fail("analyzer/analyze", mainHtmlPath);
//             });
//         })
//       ).then(function() {
//         Ana.success("analyzer/analyze", mainHtmlPaths);
//         resolve(data);
//       });
//     });
//   }
// }

// module.exports = Hydrolysis;
