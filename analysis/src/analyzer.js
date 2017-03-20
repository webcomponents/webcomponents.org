'use strict';

const Ana = require('./ana_log');

const Analyzer = require('polymer-analyzer').Analyzer;
const Analysis = require('polymer-analyzer/lib/analysis-format');
const generateAnalysis = require('polymer-analyzer/lib/generate-analysis').generateAnalysis;
const Feature = require('polymer-analyzer/lib/model/model');
const FSUrlLoader = require('polymer-analyzer/lib/url-loader/fs-url-loader').FSUrlLoader;
const PackageUrlResolver = require('polymer-analyzer/lib/url-loader/package-url-resolver').PackageUrlResolver;

class AnalyzerRunner {
  analyze(inputs) {
    return new Promise(resolve => {
      Ana.log('analyzer/analyze', inputs);

      const analyzer = new Analyzer({
        urlLoader: new FSUrlLoader('/'),
        urlResolver: new PackageUrlResolver(),
      });

      const isInTests = /(\b|\/|\\)(test)(\/|\\)/;
      const isNotTest = feature =>
          feature.sourceRange != null && !isInTests.test(feature.sourceRange.file);

      if (inputs == null || inputs.length === 0) {
        analyzer.analyzePackage().then(function(_package) {
          resolve(generateAnalysis(_package, ''));
        }).catch(function() {
          Ana.fail('analyzer/analyze', inputs, isNotTest);
        });
      } else {
        Promise.all(inputs.map((i) => analyzer.analyze(i))).then(function(documents) {
          resolve(generateAnalysis(documents, ''));
        }).catch(function() {
          Ana.fail('analyzer/analyze', inputs);
        });
      }

    });
  }
}

module.exports = AnalyzerRunner;