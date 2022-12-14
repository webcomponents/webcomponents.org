/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// This must be imported before lit
import {
  render,
  RenderInfo,
} from '@lit-labs/ssr/lib/render-with-global-dom-shim.js';

import type {TemplateResult} from 'lit';
import type {DirectiveResult} from 'lit/directive.js';
import {renderBody} from '@webcomponents/internal-site-client/lib/templates/body.js';

import {escapeHTML} from './escape-html.js';
export {unsafeHTML} from 'lit/directives/unsafe-html.js';

export function* renderPage(
  data: {
    scripts?: Array<string>;
    title?: string;
    content: TemplateResult | DirectiveResult;
    initialData?: object;
    initScript?: string;
  },
  options?: Partial<RenderInfo>
) {
  yield `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link
      href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;700&display=swap"
      rel="stylesheet"
    />
    <link
      href="https://fonts.googleapis.com/css?family=Material+Icons&display=block"
      rel="stylesheet"
    />
    <!-- TODO (justinfagnani): only add this in dev. In prod we should have
         compiled any process access out. DO_NOT_LAUNCH -->
    <script>
      window.process = {env: {NODE_ENV: 'development'}};
    </script>`;

  if (data.scripts !== undefined) {
    yield* data.scripts.map(
      (s) => `<script type="module" src="${s}"></script>`
    );
  }

  yield `<style>
      body {
        margin: 0;
        --mdc-typography-font-family: 'Open Sans', Arial, Helvetica, sans-serif;
        font-family: var(--mdc-typography-font-family);
        min-height: 100vh;
      }
      @media (max-width: 500px), (max-height: 500px) {
        body {
          max-height: 100vh;
          overflow: auto;
        }
      }
    </style>
    <title>${escapeHTML(data.title)}</title>
  </head>
  <body>
`;
  yield* render(renderBody(data.content), options);

  if (data.initialData !== undefined) {
    yield `<script>window.__ssrData = ${JSON.stringify(
      data.initialData
    ).replace(/</g, '\\u003c')}</script>`;
  }

  if (data.initScript !== undefined) {
    yield `<script type="module" src="${data.initScript}"></script>`;
  }

  yield `
  </body>
</html>
`;
}
