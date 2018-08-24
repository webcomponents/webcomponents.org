'use strict';

const Ana = require('./ana_log');

const {Analyzer, generateAnalysis, FsUrlLoader, PackageUrlResolver} = require('polymer-analyzer');
const pathlib = require('path');

class AnalyzerRunner {
  analyze(isBowerPackage, root, inputs) {
    return new Promise(async (resolve, reject) => {
      Ana.log('analyzer/analyze', inputs);

      var paths = inputs || [];

      const analyzer = new Analyzer({
        urlLoader: new FsUrlLoader(root),
        urlResolver: new PackageUrlResolver({
          packageDir: root,
          componentDir: isBowerPackage ? 'bower_components' : 'node_modules'
        }),
        moduleResolution: isBowerPackage ? undefined : 'node',
      });

      // Filter results for only what is in the requested package instead
      // of everything that was analyzed.
      const rootUrl = await analyzer.urlResolver.resolve('');
      // Filter out top level test/ and demo/ directories.
      const isTest = (feature) => {
        if (!feature.sourceRange) {
          return false;
        }
        const relativePath = feature.sourceRange.file.substring(rootUrl.length);
        if (relativePath.startsWith('test/') ||
            relativePath.startsWith('tests/') ||
            relativePath.startsWith('demo/')) {
          return true;
        }
        return false;
      };

      if (paths.length === 0) {
        analyzer.analyzePackage().then(analysis => {
          // Get source paths for all features.
          const features = Array.from(analysis.getFeatures());
          const paths = features
            .filter((f) => f.sourceRange !== undefined)
            .map((f) => f.sourceRange.file);
          const uniquePaths = new Set(paths);

          const shouldOutputFeature = (feature) => {
            if (isTest(feature)) {
              return false;
            }

            const path = feature.sourceRange.file;
            const fileMatch = pathlib.basename(path).split('.');
            if (fileMatch.length <= 2) {
              return true;
            }

            const strippedBaseName = fileMatch[0] + '.' + fileMatch[fileMatch.length - 1];
            // Don't use pathlib.join() as that will strip file:/// protocol.
            if (!uniquePaths.has(pathlib.dirname(path) + pathlib.sep + strippedBaseName)) {
              return true;
            }
            return false;
          };

          resolve(generateAnalysis(analysis, analyzer.urlResolver, shouldOutputFeature));
        }).catch(function(error) {
          Ana.fail('analyzer/analyze', paths, error);
          reject({retry: true, error: error});
        });
      } else {
        analyzer.analyze(paths).then(function(analysis) {
          resolve(generateAnalysis(analysis, analyzer.urlResolver));
        }).catch(function(error) {
          Ana.fail('analyzer/analyze', paths, error);
          reject({retry: true, error: error});
        });
      }
    });
  }
}

module.exports = AnalyzerRunner;
