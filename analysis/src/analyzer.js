'use strict';

const Ana = require('./ana_log');

const {Analyzer, generateAnalysis} = require('polymer-analyzer');
const FSUrlLoader = require('polymer-analyzer/lib/url-loader/fs-url-loader').FSUrlLoader;
const PackageUrlResolver = require('polymer-analyzer/lib/url-loader/package-url-resolver').PackageUrlResolver;
const path = require('path');

class AnalyzerRunner {
  analyze(root, inputs) {
    return new Promise((resolve, reject) => {
      Ana.log('analyzer/analyze', inputs);

      // Move up a directory so analyzer will look at all dependencies properly.
      var analyzerRoot = path.dirname(root);
      var paths = inputs.map(x => path.join(path.basename(root), x));

      const analyzer = new Analyzer({
        urlLoader: new FSUrlLoader(analyzerRoot),
        urlResolver: new PackageUrlResolver(),
      });

      const isInPackage = feature => feature.sourceRange != null && feature.sourceRange.file.startsWith(path.basename(root));

      if (inputs == null || inputs.length === 0) {
        resolve({});
        // TODO: fall back to package analysis
      } else {
        analyzer.analyze(paths).then(function(analysis) {
          resolve(generateAnalysis(analysis, root, isInPackage));
        }).catch(function(error) {
          Ana.fail('analyzer/analyze', inputs, error);
          reject({retry: true, error: error});
        });
      }

    });
  }
}

module.exports = AnalyzerRunner;
