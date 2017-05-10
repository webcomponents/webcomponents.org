'use strict';

const Ana = require('./ana_log');

const Analyzer = require('polymer-analyzer').Analyzer;
const Analysis = require('polymer-analyzer/lib/analysis-format');
const generateAnalysis = require('polymer-analyzer/lib/generate-analysis').generateAnalysis;
const Feature = require('polymer-analyzer/lib/model/model');
const FSUrlLoader = require('polymer-analyzer/lib/url-loader/fs-url-loader').FSUrlLoader;
const PackageUrlResolver = require('polymer-analyzer/lib/url-loader/package-url-resolver').PackageUrlResolver;

class AnalyzerRunner {
  analyze(root, inputs) {
    return new Promise((resolve, reject) => {
      Ana.log('analyzer/analyze', inputs);

      const analyzer = new Analyzer({
        urlLoader: new FSUrlLoader(root),
        urlResolver: new PackageUrlResolver(),
      });

      const isInTests = /(\b|\/|\\)(test)(\/|\\)/;
      const isNotTest = feature =>
          feature.sourceRange != null && !isInTests.test(feature.sourceRange.file);

      if (inputs == null || inputs.length === 0) {
        resolve({});
        // TODO: fall back to package analysis
      } else {
        analyzer.analyze(inputs).then(function(analysis) {
          resolve(generateAnalysis(analysis, root));
        }).catch(function(error) {
          Ana.fail('analyzer/analyze', inputs, error);
          reject({retry: true, error: error});
        });
      }

    });
  }
}

module.exports = AnalyzerRunner;
