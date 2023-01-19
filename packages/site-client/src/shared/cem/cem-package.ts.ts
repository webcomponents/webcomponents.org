/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {html, LitElement} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import type * as cem from 'custom-elements-manifest/schema.js';
import {styles, markdown} from './common.js';

import './cem-js-module.js';

@customElement('cem-package')
export class CemPackage extends LitElement {
  static styles = styles;
  @property()
  name!: string;
  @property()
  package!: cem.Package;
  render() {
    return html`
      <h1 class="title" class="title">Package: ${this.name}</h1>
      ${markdown(this.package.readme)} ${this.package.modules.map(module)}
    `;
  }
}

const module = (m: cem.Module) => {
  switch (m.kind) {
    case 'javascript-module':
      return html`<cem-js-module .module=${m}></cem-js-module>`;
    default:
      return html`<i>Not implemented</i>`;
  }
};

declare global {
  interface HTMLElementTagNameMap {
    'cem-package': CemPackage;
  }
}
