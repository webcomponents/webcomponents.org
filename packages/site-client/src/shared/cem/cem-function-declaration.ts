/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {LitElement} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import type * as cem from 'custom-elements-manifest/schema.js';
import {styles, renderDeclarationInfo} from './common.js';

@customElement('cem-function-declaration')
export class CemFunctionDeclaration extends LitElement {
  static styles = styles;
  @property()
  declaration!: cem.FunctionDeclaration;
  @property()
  exportName?: string;
  render() {
    return renderDeclarationInfo(this.declaration, this.exportName);
    //TODO(kschaaf) Render the rest of the stuff
  }
}
declare global {
  interface HTMLElementTagNameMap {
    'cem-function-declaration': CemFunctionDeclaration;
  }
}
