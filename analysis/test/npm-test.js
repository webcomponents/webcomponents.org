const chai = require('chai');
const expect = chai.expect;

const NPM = require('../src/npm');
const fs = require('fs');
const rimraf = require('rimraf');

function setup(path, packageFile) {
  path = 'installed/' + path;
  if (!fs.existsSync(path))
    fs.mkdirSync(path);
  fs.writeFileSync(path + '/package.json', JSON.stringify(packageFile));
}

describe('NPM', () => {
  beforeEach(function(done) {
    new NPM().prune().then(done);
  });

  after(function(done) {
    rimraf('installed', {}, done);
  });

  it('successfully installs a package', function() {
    setup('tmp-test', {name: 'tmp-test', version: '0.0.0'});
    return new NPM().install('.', 'tmp-test', '');
  });

  it('fails to install with missing package', function() {
    return new NPM().install('.', 'no-such-package', '').catch(err => {
      // Expected rejection
    });
  });

  it('can find dependencies after installing a package', function() {
    const localDependency = {
      name: 'package-local-dependency',
      version: '0.0.0'
    };

    const localWithDep = {
      name: 'package-with-local-paths',
      version: '0.0.0',
      dependencies: {
        'package-local-dependency': 'file:../package-local-dependency'
      }
    };
    setup('package-local-dependency', localDependency);
    setup('package-with-local-paths', localWithDep);
    const npm = new NPM();
    return npm.install('.', 'package-with-local-paths', '').then(() => {
      return npm.findDependencies('.', 'package-with-local-paths', '');
    }).then(deps => {
      expect(deps).to.have.length(1);
      expect(deps[0]).to.be.equal(localDependency.name + '@' + localDependency.version);
    });
  });
});
