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
      console.log('matchesClass', tagName, !excludedTagNames.includes(tagName));
      return excludedTagNames.includes(tagName)
        ? false
        : super.matchesClass(ceClass, tagName, attributes);
    }
  };
};

const replacements = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  // Note &apos; was not defined in the HTML4 spec, and is not supported by very
  // old browsers like IE8, so a codepoint entity is used instead.
  "'": '&#39;',
};

/**
 * Replaces characters which have special meaning in HTML (&<>"') with escaped
 * HTML entities ("&amp;", "&lt;", etc.).
 */
const escapeHtml = (str: string) =>
  str.replace(
    /[&<>"']/g,
    (char) => replacements[char as keyof typeof replacements]
  );

// The built-in FallbackRenderer incorrectly causes a
// shadow root to be rendered, which breaks hydration
class FallbackRenderer extends ElementRenderer {
  static matchesClass(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _ceClass: typeof HTMLElement,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _tagName: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _attributes: Map<string, string>
  ) {
    return true;
  }
  private readonly _attributes: {[name: string]: string} = {};

  override setAttribute(name: string, value: string) {
    this._attributes[name] = value;
  }

  override *renderAttributes() {
    for (const [name, value] of Object.entries(this._attributes)) {
      if (value === '' || value === undefined || value === null) {
        yield ` ${name}`;
      } else {
        yield ` ${name}="${escapeHtml(value)}"`;
      }
    }
  }

  connectedCallback() {
    // do nothing
  }
  attributeChangedCallback() {
    // do nothing
  }
  *renderLight() {
    // do nothing
  }

  declare renderShadow: ElementRenderer['renderShadow'];
}

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
          FallbackRenderer,
        ],
      }
    )
  );
  context.type = 'html';
  context.status = 200;
};
