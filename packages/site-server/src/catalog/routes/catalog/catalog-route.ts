/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// This must be imported before lit
import {render} from '@lit-labs/ssr/lib/render-with-global-dom-shim.js';

import {DefaultContext, DefaultState, ParameterizedContext} from 'koa';
import {html} from 'lit';
import {Readable} from 'stream';
import Router from '@koa/router';

import '@webcomponents/internal-site-client/lib/entrypoints/catalog.js';
import {renderPage} from '@webcomponents/internal-site-content/templates/lib/base.js';

export const handleCatalogRoute = async (
  context: ParameterizedContext<
    DefaultState,
    DefaultContext & Router.RouterParamContext<DefaultState, DefaultContext>,
    unknown
  >
) => {
  // URL isn't exactly a Location, but it's close enough for read-only uses
  window.location = new URL(context.URL.href) as unknown as Location;

  context.body = Readable.from(
    renderPage({
      title: `Web Components Catalog`,
      scripts: ['/js/hydrate.js', '/js/catalog.js'],
      content: render(html`<wco-catalog-page></wco-catalog-page>`),
    })
  );
  context.type = 'html';
  context.status = 200;
};
