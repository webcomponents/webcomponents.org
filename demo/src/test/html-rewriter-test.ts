import {test} from 'ava';
import * as fs from 'fs-extra';
import getStream from 'get-stream';
import * as path from 'path';
import {Readable} from 'stream';

import {HTMLRewriter, parsePackageName, rewriteBareModuleSpecifiers} from '../html-rewriter';

test('rewrites basic scoped import', (t) => {
  const before = `import "@polymer/iron-demo-helpers/demo-snippet.js";`;
  const after = `import "/@polymer/iron-demo-helpers/demo-snippet.js";`;

  t.is(rewriteBareModuleSpecifiers(before), after);
});

test('rewrites basic unscoped import', (t) => {
  const before = `import "package/test.js";`;
  const after = `import "/package/test.js";`;

  t.is(rewriteBareModuleSpecifiers(before), after);
});

test('rewrites basic bare unscoped import', (t) => {
  const before = `import "express";`;
  const after = `import "/express";`;

  t.is(rewriteBareModuleSpecifiers(before), after);
});

test('does not touch relative paths', (t) => {
  const before = `import "./my-element.js";`;

  t.is(rewriteBareModuleSpecifiers(before), before);
});

test('does not touch absolute paths', (t) => {
  const before = `import "/@scope/test.js";`;

  t.is(rewriteBareModuleSpecifiers(before), before);
});

test('rewrites long complex file', async (t) => {
  const beforeStream = fs.createReadStream(
      path.join(__dirname, '../../src/test/goldens/paper-button-demo.html'));
  beforeStream.setEncoding('utf8');
  const expected = await fs.readFile(
      path.join(
          __dirname, '../../src/test/goldens/paper-button-demo-expected.html'),
      'utf8');

  const actualStream = beforeStream.pipe(new HTMLRewriter());
  t.is(await getStream(actualStream), expected);
});

test('rewrites sibling node_modules references', async (t) => {
  const beforeStream = new Readable();
  beforeStream.push('<script src="../node_modules/other-package/file.html">');
  beforeStream.push(null);
  beforeStream.setEncoding('utf8');

  const expected = '<script src="/other-package/file.html">';

  const actualStream = beforeStream.pipe(new HTMLRewriter());
  t.is(await getStream(actualStream), expected);
});

test('rewrites import with version semver', (t) => {
  const before = `import "express/test.js";`;
  const packageJson = {'dependencies': {'express': '^4.15.2'}};
  const after = `import "/express@^4.15.2/test.js";`;

  t.is(rewriteBareModuleSpecifiers(before, packageJson), after);
});

test('rewrites import with strict version', (t) => {
  const before = `import "express/test.js";`;
  const packageJson = {'dependencies': {'express': '3.9.0'}};
  const after = `import "/express@3.9.0/test.js";`;

  t.is(rewriteBareModuleSpecifiers(before, packageJson), after);
});

test('ignores non-semver values', (t) => {
  const before = `import "express/test.js";`;
  const packageJson = {'dependencies': {'express': 'http://blah.com/module'}};
  const after = `import "/express/test.js";`;

  t.is(rewriteBareModuleSpecifiers(before, packageJson), after);
});

test('correctly parse package names', (t) => {
  t.deepEqual(
      parsePackageName('@polymer/polymer/index.js'),
      {package: '@polymer/polymer', path: '/index.js'});

  t.deepEqual(
      parsePackageName('my-package-name'),
      {package: 'my-package-name', path: ''});

  t.deepEqual(
      parsePackageName('@scope/my-package-name'),
      {package: '@scope/my-package-name', path: ''});
});
