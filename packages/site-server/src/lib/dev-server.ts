/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {DefaultContext, DefaultState, Middleware} from 'koa';
import {fileURLToPath} from 'url';
import Router from '@koa/router';
import {catalogRouter} from './catalog/router.js';
import {startDevServer} from '@web/dev-server';

const PORT = process.env['PORT'] ? parseInt(process.env['PORT']) : 5450;
const STATIC_ROOT = fileURLToPath(
  new URL('../../site-content/_dev', import.meta.url)
);

console.log('Serving static files from', STATIC_ROOT);

const router = new Router();
router.use('/catalog', catalogRouter.routes());

startDevServer({
  config: {
    port: PORT,
    rootDir: STATIC_ROOT,
    plugins: [],
    middleware: [
      router.routes() as Middleware<DefaultState, DefaultContext, unknown>,
    ],
    watch: true,
    nodeResolve: {
      exportConditions: ['development'],
    },    
  },
});
