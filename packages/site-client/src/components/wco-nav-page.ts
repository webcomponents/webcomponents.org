/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {html, css} from 'lit';
import {customElement} from 'lit/decorators.js';
import {WCOPage} from './wco-page.js';
import './wco-top-bar.js';

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
    `,
  ];

  protected override renderMain() {
    return html`
      <nav id="main-outline"><slot name="outline"></slot></nav>
      <article>${this.renderContent()}</article>
      <nav id="right-nav">[Page ToC]</nav>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'wco-nav-page': WCONavPage;
  }
}
