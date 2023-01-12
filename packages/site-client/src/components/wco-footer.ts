/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {html, css, LitElement} from 'lit';
import {customElement} from 'lit/decorators.js';

@customElement('wco-footer')
export class WCOFooter extends LitElement {
  static styles = css`
    :host {
      display: flex;
      justify-content: center;
      align-items: center;
      background: #eee;
      border-top: solid 1px #aaa;
      height: 120px;
    }
  `;

  render() {
    return html`[Footer]`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'wco-footer': WCOFooter;
  }
}
