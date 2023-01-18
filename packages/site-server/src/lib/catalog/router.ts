/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import Router from '@koa/router';
import {handleCatalogRoute} from './routes/catalog-route.js';
import {handleCatalogSearchRoute} from './routes/search-route.js';
import {handleElementRoute} from './routes/element-route.js';

export const catalogRouter = new Router();

catalogRouter.get('/', handleCatalogRoute);

catalogRouter.get('/search', handleCatalogSearchRoute);

catalogRouter.get('/element/:path+', handleElementRoute);
