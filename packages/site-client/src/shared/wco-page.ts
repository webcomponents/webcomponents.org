/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {html, css, LitElement, CSSResultGroup} from 'lit';
import {customElement} from 'lit/decorators.js';
import './wco-top-bar.js';
import './wco-footer.js';

/**
 * The base class for all pages. Includes a top bar and <main> element.
 */
@customElement('wco-page')
export class WCOPage extends LitElement {
  static styles: CSSResultGroup = css`
    :host {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
      align-items: center;

      --content-width: 1200px;
    }

    main {
      flex: 1;
    }

    wco-footer {
      width: 100%;
    }

    .full-screen-error {
      display: flex;
      flex: 1;
      align-items: center;
      justify-items: center;
    }
  `;

  render() {
    return html`
      <wco-top-bar></wco-top-bar>
      <main>${this.renderMain()}</main>
      <wco-footer></wco-footer>
    `;
  }

  protected renderMain() {
    return this.renderContent();
  }

  protected renderContent() {
    return html`<slot></slot>`;
  }

  protected fullScreenError(message: unknown) {
    return html`<div class="full-screen-error">${message}</div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'wco-page': WCOPage;
  }
}
