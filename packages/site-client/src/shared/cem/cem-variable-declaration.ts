/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {html, LitElement} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import type * as cem from 'custom-elements-manifest/schema.js';
import {
  styles,
  whenDefined,
  markdown,
  renderDeclarationInfo,
} from './common.js';

import './cem-type.js';

@customElement('cem-variable-declaration')
export class CemVariableDeclaration extends LitElement {
  static styles = styles;
  @property()
  declaration!: cem.VariableDeclaration;
  @property()
  exportName?: string;
  render() {
    return html`
      ${renderDeclarationInfo(this.declaration, this.exportName)}
      ${markdown(this.declaration.summary)}
      ${markdown(this.declaration.description)}
      ${whenDefined(
        this.declaration.type,
        (t: cem.Type) => html`Type: <cem-type .type=${t}></cem-type>`
      )}
    `;
  }
}
declare global {
  interface HTMLElementTagNameMap {
    'cem-variable-declaration': CemVariableDeclaration;
  }
}
