/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {html, css, TemplateResult} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import {classMap} from 'lit/directives/class-map.js';
import {WCOPage} from './wco-page.js';
import './wco-top-bar.js';

export interface NavEntry {
  key: string;
  url: string;
  children?: NavEntry[];
}

/**
 * A page with left and right side navigation areas.
 */
@customElement('wco-nav-page')
export class WCONavPage extends WCOPage {
  static styles = [
    WCOPage.styles,
    css`
      main {
        display: grid;
        --docs-margin-block: 32px;
        --docs-nav-min-width: 14em;
        --docs-nav-max-width: 1fr;
        --docs-article-min-width: 30em;
        --docs-article-max-width: 49em;
        padding-block: var(--docs-margin-block);
        grid-template-columns:
          minmax(var(--docs-nav-min-width), var(--docs-nav-max-width))
          minmax(0, var(--docs-article-max-width)) 1fr;
      }

      nav {
        display: flex;
        justify-content: center;
        align-items: center;
        border: solid 1px red;
      }

      nav li.active {
        font-weight: bold;
      }
    `,
  ];

  @property({attribute: false})
  navEntries?: NavEntry[];

  protected override renderMain() {
    return html`
      <nav id="main-outline">${this._renderNav(this.navEntries)}</nav>
      <article>${this.renderContent()}</article>
      <nav id="right-nav">[Page ToC]</nav>
    `;
  }

  private _renderNav(
    entries: NavEntry[] | undefined
  ): TemplateResult | undefined {
    if (entries === undefined || entries.length === 0) {
      return;
    }
    return html`<ul>
      ${entries.map(
        (entry) => html`<li
          class="${classMap({
            active: entry.url === globalThis.location.pathname,
          })}"
        >
          ${entry.url
            ? html`<a href="${entry.url}">${entry.key}</a>`
            : entry.key}
          ${this._renderNav(entry.children)}
        </li>`
      )}
    </ul>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'wco-nav-page': WCONavPage;
  }
}
