/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import Router from '@koa/router';

export const catalogRouter = new Router();

catalogRouter.get('/element/:path+', async (context) => {
  const {params} = context;

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const elementPath = params['path']!;
  const elementPathSegments = elementPath.split('/');
  const isScoped = elementPathSegments[0]?.startsWith('@');
  const packageName = isScoped
    ? elementPathSegments[0] + '/' + elementPathSegments[1]
    : elementPathSegments[0]!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
  const elementName = elementPathSegments[isScoped ? 2 : 1];
  
  context.body = `
    <!doctype html>
    <html>
      <body>
        <h1>${escapeHTML(`<${elementName}>`)}</h1>
        <h2>In ${escapeHTML(packageName)}</h2>
      </body>
    </html>
  `;
  context.type = 'html';
  context.status = 200;
});

const replacements: Record<string, string> = {
  '<': '&lt;',
  '>': '&gt;',
  '&': '&amp;',
  "'": '&#39;',
  '"': '&quot;',
};
// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const replacer = (s: string) => replacements[s]!;
const escapeHTML = (html: string) => html.replaceAll(/[<>&'"]/g, replacer);
