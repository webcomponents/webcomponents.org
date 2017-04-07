
var expect = require('chai').expect;
var path = require('path');

var AnalyzerRunner = require('../src/analyzer');

describe('AnalyzerRunner', function() {
  it('is sensible', function() {
    var analyzer = new AnalyzerRunner();
    return analyzer.analyze(path.resolve(__dirname, '../../client/src'), ['catalog-app.html']).then(function(result) {
      expect(result).to.exist;
      expect(JSON.stringify(result)).to.exist;
      expect(result.elements).to.have.length.above(0);
    });
  });

  it('works with Polymer 2.0 class syntax elements', function() {
    var analyzer = new AnalyzerRunner();
    return analyzer.analyze(path.resolve(__dirname, 'resources/polymer2'), ['shop-image.html']).then(function(result) {
      expect(result).to.exist;
      expect(JSON.stringify(result)).to.exist;
      expect(result.elements).to.have.lengthOf(1);
      expect(result.elements[0]).to.have.property('classname', 'ShopImage');
    });
  });

  it('ignores unknown files', function(done) {
    var analyzer = new AnalyzerRunner();
    analyzer.analyze(path.resolve(__dirname, 'resources'), ['does-not-exist.not-found']).catch(function() {
      // Successfully rejected promise.
      done();
    });
  });

  it('includes imported files but not external packages', function() {
    var analyzer = new AnalyzerRunner();
    return analyzer.analyze(path.resolve(__dirname, 'resources/app-layout'), ['app-layout.html']).then(function(result) {
      expect(result).to.exist;
      expect(JSON.stringify(result)).to.exist;
      expect(result.elements).to.have.lengthOf(8);

      expect(result).to.have.property('metadata');
      expect(result.metadata).to.have.property('polymer');
      expect(result.metadata.polymer).to.have.property('behaviors');
      expect(result.metadata.polymer.behaviors).to.have.lengthOf(1);
      expect(result.metadata.polymer.behaviors[0]).to.have.property('name', 'Polymer.AppScrollEffectsBehavior');
    });
  });
});
