/**
 * @license
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {CustomElement} from '@webcomponents/catalog-api/lib/_schema.js';
import {html, css} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import {unsafeHTML} from 'lit/directives/unsafe-html.js';

import {WCOPage} from '../../shared/wco-page.js';
import '../catalog/wco-element-card.js';

export interface PackageData {
  name: string;
  description: string;
  version: string;
  elements: CustomElement[];
}

@customElement('wco-package-page')
export class WCOPackagePage extends WCOPage {
  static styles = [
    WCOPage.styles,
    css`
      h1 {
        display: inline-block;
      }
      .elements {
        display: grid;
        grid-template-columns: repeat(4, 200px);
        grid-template-rows: auto;
        grid-auto-columns: 200px;
        grid-auto-rows: 200px;
        gap: 8px;
      }
    `,
  ];

  @property({attribute: false})
  packageData?: PackageData;

  renderContent() {
    if (this.packageData === undefined) {
      return this.fullScreenError('No package to display');
    }

    return html`
      <div>
        <h1>${this.packageData.name}</h1>
        v${this.packageData.version}
      </div>
      <div>${unsafeHTML(this.packageData.description)}</div>
      <div class="elements">
        ${this.packageData.elements.map((e) => {
          return html`<wco-element-card .element=${e}></wco-element-card>`;
        })}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'wco-package-page': WCOPackagePage;
  }
}
