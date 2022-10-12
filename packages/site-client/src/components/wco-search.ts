/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {html, css, LitElement} from 'lit';
import {customElement} from 'lit/decorators.js';

@customElement('wco-search')
export class WCOSearch extends LitElement {
  static styles = css``;

  render() {
    return html`<input type="text" placeholder="Search" />`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'wco-search': WCOSearch;
  }
}
