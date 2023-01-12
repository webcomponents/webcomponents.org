/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import Koa from 'koa';
import koaStatic from 'koa-static';
import koaConditionalGet from 'koa-conditional-get';
import koaEtag from 'koa-etag';
import Router from '@koa/router';
import {fileURLToPath} from 'url';
import {catalogRouter} from './catalog/router.js';
import {GoogleAuth} from 'google-auth-library';

const PORT = process.env['PORT'] || 5451;
const STATIC_ROOT = fileURLToPath(
  new URL('../../site-content/_site', import.meta.url)
);

const app = new Koa();
app.use(koaConditionalGet()); // Needed for etag
app.use(koaEtag());

const router = new Router();
router.use('/catalog', catalogRouter.routes());
router.use('/test', async ({response: res}) => {
  const auth = new GoogleAuth();
  const catalogUrl = 'https://catalog-khswqo4xea-wl.a.run.app';
  const client = await auth.getIdTokenClient(catalogUrl);
  try {
    // const response = await client.request({url: serviceAUrl});
    // res.end(response.data);
    const headers = await client.getRequestHeaders();
    const response = await fetch(catalogUrl, {headers});
    const text = await response.text();
    res.body = text;
  } catch (e) {
    res.body = `Error: ${(e as Error).stack}`;
  }
});
app.use(router.routes());

app.use(
  koaStatic(STATIC_ROOT, {
    // Serve pre-compressed .br and .gz files if available.
    brotli: true,
    gzip: true,
  })
);

const server = app.listen(PORT);
console.log(`serving ${STATIC_ROOT} on port ${PORT}`);

// Node only automatically exits on SIGINT when the PID is not 1 (e.g. launched
// as the child of a shell process). When the Node PID is 1 (e.g. launched with
// Docker `CMD ["node", ...]`) then it's our responsibility.
let shuttingDown = false;
process.on('SIGINT', () => {
  if (!shuttingDown) {
    // First signal: try graceful shutdown and let Node exit normally.
    server.close();
    shuttingDown = true;
  } else {
    // Second signal: somebody really wants to exit.
    process.exit(1);
  }
});
