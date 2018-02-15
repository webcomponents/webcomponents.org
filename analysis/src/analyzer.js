'use strict';

const Ana = require('./ana_log');

const {Analyzer, generateAnalysis, PackageUrlResolver, FSUrlLoader} = require('polymer-analyzer');
const pathlib = require('path');
// TODO: import it normally once its exported properly.
// See https://github.com/Polymer/polymer-analyzer/issues/882.
const {FsUrlResolver} = require('polymer-analyzer/lib/url-loader/fs-url-resolver.js');

/**
 * Extends the FSUrlLoader to only read from the package directory, while
 * allowing reading of files in the parent of the package directory.
 */
class UrlLoader extends FSUrlLoader {
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
    return await new FSUrlLoader(this.packageRoot).readDirectory(pathFromRoot, deep);
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

      if (paths.length === 0) {
        analyzer.analyzePackage().then(analysis => {
          resolve(generateAnalysis(analysis, analyzer.urlResolver, isInPackage));
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
