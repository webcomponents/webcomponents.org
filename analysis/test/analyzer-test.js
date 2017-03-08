
var expect = require('chai').expect;
var path = require('path');

var AnalyzerRunner = require('../src/analyzer');

describe('AnalyzerRunner', function() {
  it('is sensible', function() {
    var analyzer = new AnalyzerRunner();
    return analyzer.analyze([path.resolve(__dirname, '../../client/src/catalog-app.html')]).then(function(result) {
      expect(result).to.exist;
      expect(JSON.stringify(result)).to.exist;
    });
  });
});
