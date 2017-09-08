
var expect = require('chai').expect;

var Bower = require('../src/bower');

describe("Bower", function() {
  beforeEach(function(done) {
    new Bower().prune().then(done);
  });

  it("fails with retry false for malformed bower.json", function() {
    this.timeout(15000);
    var bower = new Bower();
    return bower.install("andymutton", "l2t-context-menu", "1.0.2").catch(function(result) {
      expect(result.retry).to.be.false;
    });
  });

  it("fails with retry false for bad version in bower.json", function() {
    this.timeout(15000);
    var bower = new Bower();
    return bower.install("andymutton", "file-input", "1.0.0").catch(function(result) {
      expect(result.retry).to.be.false;
    });
  });

  it("fails with retry false for a non-existent branch", function() {
    this.timeout(15000);
    var bower = new Bower();
    return bower.install("andymutton", "file-input", "9.9.9").catch(function(result) {
      expect(result.retry).to.be.false;
    });
  });

  it("fails with retry false for a non-existent sha", function() {
    this.timeout(15000);
    var bower = new Bower();
    return bower.install("andymutton", "file-input", "2d7cfbd09fc96c04c4c41148d44ed7778add6b43").catch(function(result) {
      expect(result.retry).to.be.false;
    });
  });

  it("has the right dependency field names", function() {
    this.timeout(15000);
    var bower = new Bower();
    return bower.install("andymutton", "file-input", "2.0.0").then(() => {
      return bower.findDependencies("andymutton", "file-input", "2.0.0").then(function(result) {
        for (var dependency of Object.keys(result)) {
          expect(result[dependency]).to.have.all.keys('name', 'version', 'owner', 'repo');
        }
      });
    });
  });
});
