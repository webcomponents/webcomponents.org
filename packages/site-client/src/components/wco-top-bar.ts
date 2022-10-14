/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {html, css, LitElement} from 'lit';
import {customElement} from 'lit/decorators.js';

@customElement('wco-top-bar')
export class WCOTopBar extends LitElement {
  static styles = css`
    :host {
      position: sticky;
      top: 0;
      left: 0;
      width: 100vw;
      height: 50px;
      padding: 10px 20px;
      display: flex;
      align-items: center;
      background: #eee;
      border-bottom: 1px solid #ccc;
      font-family: sans-serif;
    }
  `;

  render() {
    return html`🚧 webcomponents.org `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'wco-top-bar': WCOTopBar;
  }
}