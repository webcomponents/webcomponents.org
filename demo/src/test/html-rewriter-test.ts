import {test} from 'ava';
import * as fs from 'fs-extra';
import getStream from 'get-stream';
import * as path from 'path';

import {HTMLRewriter, jsRewrite} from '../html-rewriter';

test('rewrites basic scoped import', (t) => {
  const before = `import "@polymer/iron-demo-helpers/demo-snippet.js";`;
  const after = `import "/@polymer/iron-demo-helpers/demo-snippet.js";`;

  t.is(jsRewrite(before), after);
});

test('rewrites basic unscoped import', (t) => {
  const before = `import "package/test.js";`;
  const after = `import "/package/test.js";`;

  t.is(jsRewrite(before), after);
});

test('rewrites basic bare unscoped import', (t) => {
  const before = `import "express";`;
  const after = `import "/express";`;

  t.is(jsRewrite(before), after);
});

test('does not touch relative paths', (t) => {
  const before = `import "./my-element.js";`;

  t.is(jsRewrite(before), before);
});

test('does not touch absolute paths', (t) => {
  const before = `import "/@scope/test.js";`;

  t.is(jsRewrite(before), before);
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

test('rewrites import with version semver', (t) => {
  const before = `import "express/test.js";`;
  const packageJson = {'dependencies': {'express': '^4.15.2'}};
  const after = `import "/express@^4.15.2/test.js";`;

  t.is(jsRewrite(before, packageJson), after);
});

test('rewrites import with strict version', (t) => {
  const before = `import "express/test.js";`;
  const packageJson = {'dependencies': {'express': '3.9.0'}};
  const after = `import "/express@3.9.0/test.js";`;

  t.is(jsRewrite(before, packageJson), after);
});

test('ignores non-semver values', (t) => {
  const before = `import "express/test.js";`;
  const packageJson = {'dependencies': {'express': 'http://blah.com/module'}};
  const after = `import "/express/test.js";`;

  t.is(jsRewrite(before, packageJson), after);
});
