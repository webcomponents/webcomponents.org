/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import Router from '@koa/router';
import {renderPage} from '../../../templates/base.js';
import {DefaultContext, DefaultState, ParameterizedContext} from 'koa';
import {Readable} from 'stream';

export const handleCatalogRoute = async (
  context: ParameterizedContext<
    DefaultState,
    DefaultContext & Router.RouterParamContext<DefaultState, DefaultContext>,
    unknown
  >
) => {
  context.body = Readable.from(renderPage({
    title: `Web Components Catalog`,
    scripts: [
      '/js/catalog.js'
    ],
    content: `
    <h1>Catalog</h1>
    <wco-catalog-search></wco-catalog-search>
  `,
  }));
  context.type = 'html';
  context.status = 200;
};
