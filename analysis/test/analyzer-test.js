
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
  }).timeout(3000);

  it('works with Polymer 2.0 class syntax elements', function() {
    var analyzer = new AnalyzerRunner();
    return analyzer.analyze(path.resolve(__dirname, 'resources/polymer2'), ['shop-image.html']).then(function(result) {
      expect(result).to.exist;
      expect(JSON.stringify(result)).to.exist;
      expect(result.elements).to.have.lengthOf(1);
      expect(result.elements[0]).to.have.property('name', 'ShopImage');
      expect(result.elements[0]).to.have.property('path', 'shop-image.html');
    });
  });

  it('ignores unknown files', function(done) {
    var analyzer = new AnalyzerRunner();
    analyzer.analyze(path.resolve(__dirname, 'resources'), ['does-not-exist.not-found']).then(function(result) {
      // Doesn't throw anymore
      expect(result).to.exist;
      done();
    });
  });

  it('includes imported files but not external packages', function() {
    var analyzer = new AnalyzerRunner();
    return analyzer.analyze(path.resolve(__dirname, 'resources/meta-repo'), ['import-more.html']).then(function(result) {
      expect(result).to.exist;
      expect(JSON.stringify(result)).to.exist;
      expect(result.elements).to.have.lengthOf(3);

      expect(result).to.have.property('metadata');
      expect(result.metadata).to.have.property('polymer');
      expect(result.metadata.polymer).to.have.property('behaviors');
      expect(result.metadata.polymer.behaviors).to.have.lengthOf(1);
      expect(result.metadata.polymer.behaviors[0]).to.have.property('name', 'Polymer.MyBehavior');
    });
  });

  it('includes demos with descriptions', function() {
    var analyzer = new AnalyzerRunner();
    return analyzer.analyze(path.resolve(__dirname, 'resources'), ['element-with-demo.html']).then(function(result) {
      expect(result).to.exist;
      expect(JSON.stringify(result)).to.exist;
      expect(result.elements).to.have.lengthOf(1);
      expect(result.elements[0].demos).to.have.lengthOf(1);
      expect(result.elements[0].demos[0]).to.have.property('url', 'demo.html');
      expect(result.elements[0].demos[0]).to.have.property('description', 'description');
    });
  });

  it('works without specifying any input files', function() {
    var analyzer = new AnalyzerRunner();
    return analyzer.analyze(path.resolve(__dirname, 'resources/polymer2'), []).then(function(result) {
      expect(result).to.exist;
      expect(JSON.stringify(result)).to.exist;
      expect(result.elements).to.have.lengthOf(1);
      expect(result.elements[0]).to.have.property('name', 'ShopImage');
      expect(result.elements[0]).to.have.property('path', 'shop-image.html');
    });
  });

  it('analyzes siblings but does not include them - bower style', function() {
    var analyzer = new AnalyzerRunner();
    return analyzer.analyze(path.resolve(__dirname, 'resources/sibling-repos/child-a'), ['child-a.html']).then(function(result) {
      expect(result).to.exist;
      expect(JSON.stringify(result)).to.exist;
      // Expect only include element in package & not imported elements.
      expect(result.elements).to.have.lengthOf(1);
      // Expect inherited properties from dependencies to be included.
      expect(result.elements[0].properties).to.have.lengthOf(1);
    });
  });

  it('analyzes siblings but does not include them - npm style', function() {
    var analyzer = new AnalyzerRunner();
    return analyzer.analyze(path.resolve(__dirname, 'resources/sibling-repos/child-a'), []).then(function(result) {
      expect(result).to.exist;
      expect(JSON.stringify(result)).to.exist;
      // Expect only include element in package & not imported elements.
      expect(result.elements).to.have.lengthOf(1);
      // Expect inherited properties from dependencies to be included.
      expect(result.elements[0].properties).to.have.lengthOf(1);
    });
  });
});
