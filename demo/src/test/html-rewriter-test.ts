import test from 'ava';
import * as fs from 'fs-extra';
import getStream from 'get-stream';
import * as path from 'path';
import {Readable} from 'stream';

import {HTMLRewriter, parsePackageName, rewriteBareModuleSpecifiers} from '../html-rewriter';

test('rewrites basic scoped import', (t) => {
  const before = `import "@polymer/iron-demo-helpers/demo-snippet.js";`;
  const after = `import "/@polymer/iron-demo-helpers/demo-snippet.js";`;

  t.is(rewriteBareModuleSpecifiers(before, {}, ''), after);
});

test('rewrites basic unscoped import', (t) => {
  const before = `import "package/test.js";`;
  const after = `import "/package/test.js";`;

  t.is(rewriteBareModuleSpecifiers(before, {}, ''), after);
});

test('rewrites basic bare unscoped import', (t) => {
  const before = `import "express";`;
  const after = `import "/express";`;

  t.is(rewriteBareModuleSpecifiers(before, {}, ''), after);
});

test('does not touch relative paths', (t) => {
  const before = `import "./my-element.js";`;

  t.is(rewriteBareModuleSpecifiers(before, {}, ''), before);
});

test('does not touch absolute paths', (t) => {
  const before = `import "/@scope/test.js";`;

  t.is(rewriteBareModuleSpecifiers(before, {}, ''), before);
});

test('rewrites long complex file', async (t) => {
  const beforeStream = fs.createReadStream(
      path.join(__dirname, '../../src/test/goldens/paper-button-demo.html'));
  beforeStream.setEncoding('utf8');
  const expected = await fs.readFile(
      path.join(
          __dirname, '../../src/test/goldens/paper-button-demo-expected.html'),
      'utf8');

  const actualStream = beforeStream.pipe(new HTMLRewriter({}));
  t.is(await getStream(actualStream), expected);
});

test('rewrites /node_modules references, root', async (t) => {
  const filePath = '/';
  const beforeStream = new Readable();
  beforeStream.push('<script src="./node_modules/other-package/file.html">');
  beforeStream.push(null);
  beforeStream.setEncoding('utf8');

  const expected = '<script src="/other-package/file.html">';

  const actualStream = beforeStream.pipe(new HTMLRewriter({}, filePath));
  t.is(await getStream(actualStream), expected);
});

test('rewrites /node_modules references with package root', async (t) => {
  const filePath = '/';
  const beforeStream = new Readable();
  beforeStream.push('<script src="./node_modules/other-package/file.html">');
  beforeStream.push(null);
  beforeStream.setEncoding('utf8');

  const expected =
      '<script src="/other-package/file.html?@scope/package@3.0.0">';

  const actualStream =
      beforeStream.pipe(new HTMLRewriter({}, filePath, '@scope/package@3.0.0'));
  t.is(await getStream(actualStream), expected);
});

test('rewrites /node_modules references, 1 dir nested', async (t) => {
  const filePath = '/demo/index.html';
  const beforeStream = new Readable();
  beforeStream.push('<script src="../node_modules/other-package/file.html">');
  beforeStream.push(null);
  beforeStream.setEncoding('utf8');

  const expected = '<script src="/other-package/file.html">';

  const actualStream = beforeStream.pipe(new HTMLRewriter({}, filePath));
  t.is(await getStream(actualStream), expected);
});

test('rewrites /node_modules references, 2 dirs nested', async (t) => {
  const filePath = '/demo/parent/index.html';
  const beforeStream = new Readable();
  beforeStream.push(
      '<script src="../../node_modules/other-package/file.html">');
  beforeStream.push(null);
  beforeStream.setEncoding('utf8');

  const expected = '<script src="/other-package/file.html">';

  const actualStream = beforeStream.pipe(new HTMLRewriter({}, filePath));
  t.is(await getStream(actualStream), expected);
});

test('rewrites import with specified package lock version', (t) => {
  const before = `import "express/test.js";`;
  const versions = {'express': '4.15.2'};
  const after = `import "/express@4.15.2/test.js";`;

  t.is(rewriteBareModuleSpecifiers(before, versions, ''), after);
});

test('rewrites import with version and root package param', (t) => {
  const before = `import "express/test.js";`;
  const versions = {'express': '4.15.2'};
  const after = `import "/express@4.15.2/test.js?@polymer/polymer";`;

  t.is(
      rewriteBareModuleSpecifiers(before, versions, '@polymer/polymer'), after);
});

test('rewrites relative import by appending root package param', (t) => {
  const before = `import "./test.js";`;
  const after = `import "./test.js?my-package@3.0.0";`;

  t.is(rewriteBareModuleSpecifiers(before, {}, 'my-package@3.0.0'), after);
});

test(
    'rewrites relative import with query param by appending root package param',
    (t) => {
      const before = `import "./test.js?foo&bar";`;
      const after = `import "./test.js?my-package@3.0.0";`;

      t.is(rewriteBareModuleSpecifiers(before, {}, 'my-package@3.0.0'), after);
    });

test('rewrites export all by appending root package param', (t) => {
  const before = `export * from "./module.js";`;
  const after = `export * from "./module.js?my-package@3.0.0";`;

  t.is(rewriteBareModuleSpecifiers(before, {}, 'my-package@3.0.0'), after);
});

test(
    'rewrites export all with bare module specifier and package lock by appending root package param',
    (t) => {
      const before = `export * from "@scoped/my-module";`;
      const versions = {'@scoped/my-module': '4.15.2'};
      const after =
          `export * from "/@scoped/my-module@4.15.2?my-package@3.0.0";`;

      t.is(
          rewriteBareModuleSpecifiers(before, versions, 'my-package@3.0.0'),
          after);
    });

test('rewrites relative named export by appending root package param', (t) => {
  const before = `export { Polymer } from "./test.js";`;
  const after = `export { Polymer } from "./test.js?my-package@3.0.0";`;

  t.is(rewriteBareModuleSpecifiers(before, {}, 'my-package@3.0.0'), after);
});

test('does not touch absolute urls', (t) => {
  const before = `import "https://example.com/my-module";`;
  t.is(rewriteBareModuleSpecifiers(before, {}, 'my-package@3.0.0'), before);
})

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

test('rewrites <script type="module"> src attribute references', async (t) => {
  const filePath = '/';
  const beforeStream = new Readable();
  beforeStream.push('<script type="module" src="./module.js">');
  beforeStream.push(null);
  beforeStream.setEncoding('utf8');

  const expected =
      '<script type="module" src="./module.js?@scope/package@3.0.0">';

  const actualStream =
      beforeStream.pipe(new HTMLRewriter({}, filePath, '@scope/package@3.0.0'));
  t.is(await getStream(actualStream), expected);
});
