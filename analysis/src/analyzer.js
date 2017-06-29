'use strict';

const Ana = require('./ana_log');

const {Analyzer, generateAnalysis} = require('polymer-analyzer');
const UrlLoader = require('./url-loader');
const PackageUrlResolver = require('polymer-analyzer/lib/url-loader/package-url-resolver').PackageUrlResolver;

class AnalyzerRunner {
  analyze(root, inputs) {
    return new Promise((resolve, reject) => {
      Ana.log('analyzer/analyze', inputs);

      var paths = inputs || [];

      const analyzer = new Analyzer({
        urlLoader: new UrlLoader(root),
        urlResolver: new PackageUrlResolver(),
      });

      if (paths.length === 0) {
        analyzer.analyzePackage().then(analysis => {
          resolve(generateAnalysis(analysis, root));
        }).catch(function(error) {
          Ana.fail('analyzer/analyze', paths, error);
          reject({retry: true, error: error});
        });
      } else {
        analyzer.analyze(paths).then(function(analysis) {
          resolve(generateAnalysis(analysis, ''));
        }).catch(function(error) {
          Ana.fail('analyzer/analyze', paths, error);
          reject({retry: true, error: error});
        });
      }

    });
  }
}

module.exports = AnalyzerRunner;
