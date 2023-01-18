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

import {LitElementRenderer} from '@lit-labs/ssr/lib/lit-element-renderer.js';
import {
  ElementRenderer,
  ElementRendererConstructor,
} from '@lit-labs/ssr/lib/element-renderer.js';

import '@webcomponents/internal-site-client/lib/pages/catalog/wco-catalog-page.js';
import {RenderInfo, RenderResult} from '@lit-labs/ssr';

const excludeElements = (
  renderer: ElementRendererConstructor,
  tagNames: Array<string>
) => {
  return class ExcludeElementRenderer extends ElementRenderer {
    static matchesClass(
      ceClass: typeof HTMLElement,
      tagName: string,
      attributes: Map<string, string>
    ) {
      if (tagNames.includes(tagName)) {
        return false;
      }
      return renderer.matchesClass(ceClass, tagName, attributes);
    }

    connectedCallback() {
      // do nothing
    }

    attributeChangedCallback(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _name: string,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _old: string | null,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _value: string | null
    ) {
      // do nothing
    }

    get shadowRootOptions() {
      return {mode: 'open' as const};
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    renderShadow(_renderInfo: RenderInfo): RenderResult | undefined {
      return undefined;
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    renderLight(_renderInfo: RenderInfo): RenderResult | undefined {
      return undefined;
    }
  };
};

export const handleCatalogRoute = async (
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
    renderPage(
      {
        title: `Web Components Catalog`,
        initScript: '/js/catalog/boot.js',
        content: html`<wco-catalog-page></wco-catalog-page>`,
      },
      {
        elementRenderers: [
          excludeElements(LitElementRenderer, ['md-outlined-text-field']),
        ],
      }
    )
  );
  context.type = 'html';
  context.status = 200;
};
