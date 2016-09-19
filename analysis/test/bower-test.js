
var expect = require('chai').expect;

var Bower = require('../src/bower');

describe("Bower", function() {
	describe("Multiple installs", function() {
		it("returns the same data", function() {
      this.timeout(15000);
      var bower = new Bower();
      return bower.install("PolymerElements", "paper-radio-button", "v1.2.1")
          .then(function(data) {
            bower.install("PolymerElements", "paper-radio-button", "v1.2.1")
              .then(function(secondData) {
                expect(data).to.deep.equal(secondData);
              });
          });
    });
	});
});
