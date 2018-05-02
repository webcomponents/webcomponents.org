'use strict';

const Ana = require('./ana_log');

const {Analyzer, generateAnalysis, FsUrlLoader, FsUrlResolver} = require('polymer-analyzer');
const pathlib = require('path');

/**
 * Extends the FsUrlLoader to only read from the package directory, while
 * allowing reading of files in the parent of the package directory.
 */
class UrlLoader extends FsUrlLoader {
  /**
   * @param root - package root
   */
  constructor(root) {
    super(pathlib.join(root, '..'));

    this.packageRoot = root;
  }

  /**
   * Only return files from within the package directory.
   */
  async readDirectory(pathFromRoot, deep) {
    const files = await new FsUrlLoader(this.packageRoot).readDirectory(pathFromRoot, deep);
    const result = [];

    // Filter out minified files etc.
    for (const path of files) {
      // eg. for file.min.js => file.js
      const fileMatch = pathlib.basename(path).split('.');
      if (fileMatch.length <= 2) {
        result.push(path);
        continue;
      }

      const strippedBaseName = fileMatch[0] + '.' + fileMatch[fileMatch.length - 1];
      if (files.indexOf(pathlib.join(pathlib.dirname(path), strippedBaseName)) === -1) {
        result.push(path);
      }
    }
    return result;
  }
}

class AnalyzerRunner {
  analyze(root, inputs) {
    return new Promise(async (resolve, reject) => {
      Ana.log('analyzer/analyze', inputs);

      var paths = inputs || [];

      const analyzer = new Analyzer({
        urlLoader: new UrlLoader(root),
        urlResolver: new FsUrlResolver(root),
      });

      // Filter results for only what is in the requested package instead
      // of everything that was analyzed.
      const rootUrl = await analyzer.urlResolver.resolve('');
      const isInPackage = feature => feature.sourceRange &&
        feature.sourceRange.file.startsWith(rootUrl);
      // Filter out test files. This matches both `/test/abc.html` and
      // `/my-test.html`.
      const testRegex = /\btests?\b/;
      const isTest = feature => feature.sourceRange &&
        testRegex.test(feature.sourceRange.file);

      if (paths.length === 0) {
        analyzer.analyzePackage().then(analysis => {
          // Get source paths for all features.
          const features = Array.from(analysis.getFeatures());
          const paths = features
            .filter((f) => f.sourceRange !== undefined)
            .map((f) => f.sourceRange.file);
          const uniquePaths = new Set(paths);

          const shouldOutputFeature = (feature) => {
            if (!isInPackage(feature)) {
              return false;
            }

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
          resolve(generateAnalysis(analysis, analyzer.urlResolver, isInPackage));
        }).catch(function(error) {
          Ana.fail('analyzer/analyze', paths, error);
          reject({retry: true, error: error});
        });
      }
    });
  }
}

module.exports = AnalyzerRunner;
