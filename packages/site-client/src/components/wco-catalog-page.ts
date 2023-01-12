/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {html} from 'lit';
import {customElement} from 'lit/decorators.js';
import './wco-catalog-search.js';
import {WCOPage} from './wco-page.js';

@customElement('wco-catalog-page')
export class WCOCatalogPage extends WCOPage {
  renderContent() {
    return html`
      <h1>Catalog</h1>
      <wco-catalog-search></wco-catalog-search>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'wco-catalog-page': WCOCatalogPage;
  }
}
