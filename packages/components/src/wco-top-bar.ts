/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
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
    img {
      margin-right: 10px;
    }
  `;

  render() {
    return html`
      <img src="/assets/logo.svg" alt="webcomponents.org" width="40" />
      webcomponents.org
    `;
  }
}
