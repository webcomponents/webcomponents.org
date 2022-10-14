/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import Router from '@koa/router';
import {renderPage} from '../../../templates/base.js';
import {DefaultContext, DefaultState, ParameterizedContext} from 'koa';

export const handleCatalogRoute = async (
  context: ParameterizedContext<
    DefaultState,
    DefaultContext & Router.RouterParamContext<DefaultState, DefaultContext>,
    unknown
  >
) => {
  context.body = renderPage({
    title: `Web Components Catalog`,
    content: `
    <h1>Catalog</h1>
  `,
  });
  context.type = 'html';
  context.status = 200;
};
