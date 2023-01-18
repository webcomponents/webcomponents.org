/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// This must be imported before lit
import {renderPage} from '@webcomponents/internal-site-templates/lib/base.js';
import {DefaultContext, DefaultState, ParameterizedContext} from 'koa';
import {html} from 'lit';
import {Readable} from 'stream';
import Router from '@koa/router';

import '@webcomponents/internal-site-client/lib/pages/import/wco-catalog-import-page.js';

export const handleCatalogImportRoute = async (
  context: ParameterizedContext<
    DefaultState,
    DefaultContext & Router.RouterParamContext<DefaultState, DefaultContext>,
    unknown
  >
) => {
  // Set location because wco-nav-bar reads pathname from it. URL isn't
  // exactly a Location, but it's close enough for read-only uses
  globalThis.location = new URL(context.URL.href) as unknown as Location;

  context.body = Readable.from(
    renderPage({
      title: `Web Components Catalog - Import Package`,
      initScript: '/js/import/boot.js',
      content: html`<wco-catalog-import-page></wco-catalog-import-page>`,
    })
  );
  context.type = 'html';
  context.status = 200;
};
