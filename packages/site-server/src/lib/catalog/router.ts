/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import Router from '@koa/router';
import {handleCatalogRoute} from './routes/catalog-page.js';
import {handleCatalogImportRoute} from './routes/import-page.js';
import {handleCatalogImportApiRoute} from './routes/import-api.js';
import {handleElementRoute} from './routes/element-page.js';
import {handleCatalogSearchRoute} from './routes/search-api.js';
import bodyParser from 'koa-bodyparser';

export const catalogRouter = new Router();

// Needed for /import
catalogRouter.use(bodyParser());

catalogRouter.get('/', handleCatalogRoute);

catalogRouter.get('/search', handleCatalogSearchRoute);

catalogRouter.get('/import', handleCatalogImportRoute);
catalogRouter.post('/import', handleCatalogImportApiRoute);

catalogRouter.get('/element/:path+', handleElementRoute);
