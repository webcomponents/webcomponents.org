import {test} from 'ava';
import * as fs from 'fs-extra';
import * as path from 'path';

import {htmlRewrite} from '../html-rewriter';

test('rewrites basic scoped import', (t) => {
  const before = `import '@polymer/iron-demo-helpers/demo-snippet.js';`;
  const after =
      `import 'https://unpkg.com/@polymer/iron-demo-helpers/demo-snippet.js?module`;

  t.is(htmlRewrite(before), after);
});

test('rewrites basic unscoped import', (t) => {
  const before = `import 'package/test.js';`;
  const after = `import 'https://unpkg.com/package/test.js?module`;

  t.is(htmlRewrite(before), after);
});

test('rewrites basic bare unscoped import', (t) => {
  const before = `import 'express';`;
  const after = `import 'https://unpkg.com/express`;

  t.is(htmlRewrite(before), after);
});

test('does not touch relative paths', (t) => {
  const before = `import './my-element.js';`;

  t.is(htmlRewrite(before), before);
});

test('does not touch absolute paths', (t) => {
  const before = `import 'https://unpkg.com/@scope/test.js';`;

  t.is(htmlRewrite(before), before);
});

test('rewrites long complex file', async (t) => {
  const beforeBuffer = await fs.readFile(
      path.join(__dirname, '../../src/test/goldens/paper-button-demo.html'));
  const afterBuffer = await fs.readFile(path.join(
      __dirname, '../../src/test/goldens/paper-button-demo-expected.html'));

  t.is(htmlRewrite(beforeBuffer.toString()), afterBuffer.toString());
});

test('rewrites import with version semver', (t) => {
  const before = `import 'express/test.js`;
  const packageJson = {'dependencies': {'express': '^4.15.2'}};
  const after = `import 'https://unpkg.com/express@^4.15.2/test.js?module`;

  t.is(htmlRewrite(before, packageJson), after);
});

test('rewrites import with strict version', (t) => {
  const before = `import 'express/test.js`;
  const packageJson = {'dependencies': {'express': '3.9.0'}};
  const after = `import 'https://unpkg.com/express@3.9.0/test.js?module`;

  t.is(htmlRewrite(before, packageJson), after);
});

test('ignores non-semver values', (t) => {
  const before = `import 'express/test.js`;
  const packageJson = {'dependencies': {'express': 'http://blah.com/module'}};
  const after = `import 'https://unpkg.com/express/test.js?module`;

  t.is(htmlRewrite(before, packageJson), after);
});
