
var expect = require('chai').expect;
var path = require('path');

var AnalyzerRunner = require('../src/analyzer');

describe('AnalyzerRunner', function() {
  it('is sensible', function() {
    var analyzer = new AnalyzerRunner();
    return analyzer.analyze([path.resolve(__dirname, '../../client/src/catalog-app.html')]).then(function(result) {
      expect(result).to.exist;
      expect(JSON.stringify(result)).to.exist;
      expect(result.elements).to.have.lengthOf(1);
    });
  });

  it('works with Polymer 2.0 class syntax elements', function() {
    var analyzer = new AnalyzerRunner();
    return analyzer.analyze([path.resolve(__dirname, 'resources/polymer2/shop-image.html')]).then(function(result) {
      expect(result).to.exist;
      expect(JSON.stringify(result)).to.exist;
      expect(result.elements).to.have.lengthOf(1);
      expect(result.elements[0]).to.have.property('classname', 'ShopImage');
    });
  });

  it('ignores unknown files', function(done) {
    var analyzer = new AnalyzerRunner();
    analyzer.analyze([path.resolve(__dirname, 'resources/does-not-exist.not-found')]).catch(function() {
      // Successfully rejected promise.
      done();
    });
  });
});
