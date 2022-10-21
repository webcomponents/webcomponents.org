/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {DefaultContext, DefaultState, ParameterizedContext} from 'koa';
import {html} from 'lit';
import {Readable} from 'stream';
import Router from '@koa/router';
import {render} from '@lit-labs/ssr/lib/render-with-global-dom-shim.js';

import '@webcomponents/internal-site-client/lib/entrypoints/catalog.js';
import {renderPage} from '../../../templates/base.js';

export const handleCatalogRoute = async (
  context: ParameterizedContext<
    DefaultState,
    DefaultContext & Router.RouterParamContext<DefaultState, DefaultContext>,
    unknown
  >
) => {
  context.body = Readable.from(
    renderPage({
      title: `Web Components Catalog`,
      scripts: ['/js/hydrate.js', '/js/catalog.js'],
      content: render(html`
        <wco-top-bar></wco-top-bar>
        <h1>Catalog</h1>
        <wco-catalog-search></wco-catalog-search>
      `),
    })
  );
  context.type = 'html';
  context.status = 200;
};
