/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {html, LitElement} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import type * as cem from 'custom-elements-manifest/schema.js';
import {styles} from './common.js';

import './cem-reference.js';

@customElement('cem-reexport')
export class CemReexport extends LitElement {
  static styles = styles;
  @property()
  name!: string;
  @property()
  reference!: cem.Reference;
  render() {
    return html` <h4 class="title">${this.name}</h4>
      Re-export of
      <cem-reference .reference=${this.reference}></cem-reference>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'cem-reexport': CemReexport;
  }
}
