
var expect = require('chai').expect;

var Bower = require('../src/bower');

describe("Bower - multiple installs", function() {
  it("returns the same data", function() {
    this.timeout(15000);
    var bower = new Bower();
    return bower.install("PolymerElements", "paper-radio-button", "v1.2.1").then(function(first) {
      bower.install("PolymerElements", "paper-radio-button", "v1.2.1").then(function(second) {
        expect(second).to.be.not.empty();
        expect(first).to.deep.equal(second);
      });
    });
  });
});
