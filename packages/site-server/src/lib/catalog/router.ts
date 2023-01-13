/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import Router from '@koa/router';
import {handleCatalogRoute} from './routes/catalog/catalog-route.js';
import {handleCatalogSearchRoute} from './routes/catalog/search-route.js';
import {handleElementRoute} from './routes/element/element-route.js';
// import cors from '@koa/cors';

export const catalogRouter = new Router();

// catalogRouter.use(cors());

catalogRouter.get('/', handleCatalogRoute);

catalogRouter.get('/search', handleCatalogSearchRoute);

catalogRouter.get('/element/:path+', handleElementRoute);
