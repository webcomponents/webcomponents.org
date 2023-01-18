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
import {ElementRenderer} from '@lit-labs/ssr/lib/element-renderer.js';

import '@webcomponents/internal-site-client/lib/pages/catalog/wco-catalog-page.js';

type Interface<T> = {
  [P in keyof T]: T[P];
};

// TODO (justinfagnani): Update Lit SSR to use this type for
// ElementRendererConstructor
export type ElementRendererConstructor = (new (
  tagName: string
) => Interface<ElementRenderer>) &
  typeof ElementRenderer;

// Excludes the given tag names from being handled by the given renderer.
// Returns a subclass of the renderer that returns `false` for matches()
// for any element in the list of tag names.
const excludeElements = (
  renderer: ElementRendererConstructor,
  excludedTagNames: Array<string>
) => {
  return class ExcludeElementRenderer extends renderer {
    static matchesClass(
      ceClass: typeof HTMLElement,
      tagName: string,
      attributes: Map<string, string>
    ) {
      return excludedTagNames.includes(tagName)
        ? false
        : super.matchesClass(ceClass, tagName, attributes);
    }

    // This tells SSR to not render a shadow root.
    // renderShadow _can_ be undefined in lit-html's render-value.ts
    // We should make it optional in ElementRenderer.
    renderShadow = undefined as unknown as ElementRenderer['renderShadow'];
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
