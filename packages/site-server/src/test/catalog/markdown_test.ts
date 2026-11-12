/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {suite} from 'uvu';
// eslint-disable-next-line import/extensions
import * as assert from 'uvu/assert';
import {renderUntrustedMarkdown} from '../../lib/catalog/markdown.js';

const test = suite('renderUntrustedMarkdown');

/**
 * Asserts that no tag in `html` can run script. Payload text left behind as
 * escaped text content (e.g. `" onmouseover="...` outside any tag) is inert,
 * so only markup inside `<...>` is inspected.
 */
const assertNoScript = (html: string) => {
  const tags = (html.toLowerCase().match(/<[^>]*>/g) ?? []).join('\n');
  assert.not.match(tags, /<script/, html);
  assert.not.match(tags, /<(iframe|object|embed|form|svg|math|style)\b/, html);
  assert.not.match(tags, /\son[a-z]+\s*=/, html);
  assert.not.match(
    tags,
    /\s(href|src|action|data|formaction)\s*=\s*["']?\s*(javascript|vbscript|data):/,
    html
  );
};

test('returns an empty string for missing input', () => {
  assert.is(renderUntrustedMarkdown(undefined), '');
  assert.is(renderUntrustedMarkdown(null), '');
  assert.is(renderUntrustedMarkdown(''), '');
});

test('preserves benign markdown', () => {
  const html = renderUntrustedMarkdown(
    [
      '# Title',
      '',
      'Some *emphasis*, **strong** and `code`.',
      '',
      '- one',
      '- two',
      '',
      '[docs](https://example.com/docs) and [relative](./readme.md)',
      '',
      '![logo](https://example.com/logo.png)',
      '',
      '```js',
      'const x = 1 < 2;',
      '```',
    ].join('\n')
  );
  assert.match(html, /<h1[^>]*>Title<\/h1>/);
  assert.match(html, /<em>emphasis<\/em>/);
  assert.match(html, /<strong>strong<\/strong>/);
  assert.match(html, /<code>code<\/code>/);
  assert.match(html, /<li>one<\/li>/);
  assert.match(html, /<a href="https:\/\/example.com\/docs">docs<\/a>/);
  assert.match(html, /<a href=".\/readme.md">relative<\/a>/);
  assert.match(
    html,
    /<img src="https:\/\/example.com\/logo.png" alt="logo" ?\/?>/
  );
  assert.match(html, /<code class="language-js">/);
  assert.match(html, /const x = 1 &lt; 2;/);
});

test('keeps text around removed markup', () => {
  const html = renderUntrustedMarkdown(
    'Totally normal package. <img src=x onerror="alert(1)">'
  );
  assert.match(html, /Totally normal package\./);
  assertNoScript(html);
});

const payloads: Array<[string, string]> = [
  ['script element', '<script>alert(document.domain)</script>'],
  ['img onerror', '<img src=x onerror=alert(document.domain)>'],
  ['svg onload', '<svg onload=alert(1)></svg>'],
  ['math', '<math><mtext><img src=x onerror=alert(1)></mtext></math>'],
  ['iframe srcdoc', '<iframe srcdoc="<script>alert(1)</script>"></iframe>'],
  ['iframe js src', '<iframe src="javascript:alert(1)"></iframe>'],
  ['object', '<object data="javascript:alert(1)"></object>'],
  ['embed', '<embed src="javascript:alert(1)">'],
  ['form', '<form action="https://evil.example"><button>Go</button></form>'],
  ['raw anchor js', '<a href="javascript:alert(1)">x</a>'],
  ['markdown link js', '[x](javascript:alert(1))'],
  ['markdown link vbscript', '[x](vbscript:msgbox(1))'],
  ['markdown link data html', '[x](data:text/html,<script>alert(1)</script>)'],
  ['markdown link entity-encoded', '[x](&#106;avascript:alert(1))'],
  ['markdown link mixed case', '[x](JaVaScRiPt:alert(1))'],
  ['markdown image js', '![x](javascript:alert(1))'],
  ['attribute breakout', '[x](https://a.example/" onmouseover="alert(1))'],
  ['nested html in markdown', '**<img src=x onerror=alert(1)>**'],
  ['html block', '<div>\n<img src=x onerror=alert(1)>\n</div>'],
  ['style tag', '<style>body{background:url(javascript:alert(1))}</style>'],
  ['details ontoggle', '<details open ontoggle=alert(1)>'],
];

for (const [name, payload] of payloads) {
  test(`strips ${name}`, () => {
    assertNoScript(renderUntrustedMarkdown(payload));
  });
}

test('drops non-language classes and protocol-relative URLs', () => {
  const html = renderUntrustedMarkdown(
    '<code class="evil language-js">x</code> [x](//evil.example/)'
  );
  assert.match(html, /<code class="language-js">x<\/code>/);
  assert.not.match(html, /href="\/\/evil/);
});

test('drops data: URLs on links', () => {
  const html = renderUntrustedMarkdown(
    '[x](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)'
  );
  assert.not.match(html, /href="data:/);
});

test.run();
