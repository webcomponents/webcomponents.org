/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {html, LitElement} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import type * as cem from 'custom-elements-manifest/schema.js';
import {styles, whenDefined, markdown} from './common.js';

import './cem-variable-declaration.js';
import './cem-class-declaration.js';
import './cem-mixin-declaration.js';
import './cem-function-declaration.js';
import './cem-reexport.js';

@customElement('cem-js-module')
export class CemJsModule extends LitElement {
  static styles = styles;
  @property()
  module!: cem.JavaScriptModule;
  render() {
    const ceExports = this.module.exports?.filter(
      (e) => e.kind === 'custom-element-definition'
    );
    const jsExports = this.module.exports?.filter(
      (e) =>
        e.kind === 'js' &&
        !ceExports?.find(
          (ce) =>
            e.declaration.package === undefined &&
            ce.declaration.name === e.declaration.name
        )
    );
    return html`
      <h2 class="title">Module: ${this.module.path}</h2>
      ${whenDefined(
        this.module.summary,
        (s) => html`
          <h3>Summary</h3>
          ${markdown(s)}
        `
      )}
      ${whenDefined(
        this.module.description,
        (s) => html`
          <h3>Description</h3>
          ${markdown(s)}
        `
      )}
      ${whenDefined(
        ceExports,
        (e) => html`
          <h3>Custom Elements</h3>
          ${e.map((exp) =>
            renderExport(
              exp as cem.JavaScriptExport,
              this.module.declarations ?? []
            )
          )}
        `
      )}
      ${whenDefined(
        jsExports,
        (e) => html`
          <h3>JavaScript Exports</h3>
          ${e.map((exp) =>
            renderExport(
              exp as cem.JavaScriptExport,
              this.module.declarations ?? []
            )
          )}
        `
      )}
    `;
  }
}

const renderDeclaration = (
  d: cem.Declaration | undefined,
  exportName?: string
) => {
  if (d === undefined) {
    return html`<i>Error: Declaration not found</i>`;
  }
  switch (d.kind) {
    case 'function':
      return html`<cem-function-declaration
        .declaration=${d}
        .exportName=${exportName}
      ></cem-function-declaration>`;
    case 'class':
      return html`<cem-class-declaration
        .declaration=${d}
        .exportName=${exportName}
      ></cem-class-declaration>`;
    case 'variable':
      return html`<cem-variable-declaration
        .declaration=${d}
        .exportName=${exportName}
      ></cem-variable-declaration>`;
    case 'mixin':
      return html`<cem-mixin-declaration
        .declaration=${d}
        .exportName=${exportName}
      ></cem-mixin-declaration>`;
    default:
      return html`<i>Unsupported declartion kind</i>`;
  }
};

const renderExport = (
  exp: cem.JavaScriptExport,
  declarations: cem.Declaration[]
) => {
  return exp.declaration.package === undefined
    ? renderDeclaration(
        declarations.find((d) => d.name === exp.declaration.name),
        exp.name
      )
    : html`<cem-reexport
        .name=${exp.name}
        .reference=${exp.declaration}
      ></cem-reexport>`;
};

declare global {
  interface HTMLElementTagNameMap {
    'cem-js-module': CemJsModule;
  }
}
