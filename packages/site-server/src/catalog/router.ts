/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import Router from '@koa/router';
import {handleCatalogRoute} from './routes/catalog/catalog-route.js';
import {handleElementRoute} from './routes/element/element-route.js';

export const catalogRouter = new Router();

catalogRouter.get('/', handleCatalogRoute);

catalogRouter.get('/element/:path+', handleElementRoute);
