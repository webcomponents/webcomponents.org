'use strict';

const Ana = require('./ana_log');

const {Analyzer, generateAnalysis} = require('polymer-analyzer');
const UrlResolver = require('./url-resolver');
const PackageUrlResolver = require('polymer-analyzer/lib/url-loader/package-url-resolver').PackageUrlResolver;
const path = require('path');

class AnalyzerRunner {
  analyze(root, inputs) {
    return new Promise((resolve, reject) => {
      Ana.log('analyzer/analyze', inputs);

      var analyzerRoot = root;
      var paths = inputs || [];
      // Bower: Move up a directory so analyzer will look at all dependencies properly.
      if (paths.length) {
        var analyzerRoot = path.dirname(root);
        var paths = inputs && inputs.map(x => path.join(path.basename(root), x));
      }

      const analyzer = new Analyzer({
        urlLoader: new UrlResolver(analyzerRoot),
        urlResolver: new PackageUrlResolver(),
      });

      const isInPackage = feature => feature.sourceRange != null && feature.sourceRange.file.startsWith(path.basename(root));

      if (inputs == null || inputs.length === 0) {
        analyzer.analyzePackage().then(analysis => {
          resolve(generateAnalysis(analysis, root, isInPackage));
        });
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
