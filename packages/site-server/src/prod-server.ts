/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import Koa from 'koa';
import koaStatic from 'koa-static';
import koaConditionalGet from 'koa-conditional-get';
import koaEtag from 'koa-etag';
import {fileURLToPath} from 'url';
import * as pathlib from 'path';

const PORT = process.env['PORT'] || 8080;
const STATIC_ROOT = pathlib.resolve(
  fileURLToPath(import.meta.url),
  '..',
  '..',
  '..',
  'content',
  '_site'
);

const app = new Koa();
app.use(koaConditionalGet()); // Needed for etag
app.use(koaEtag());
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
