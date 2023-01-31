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
  renderDeclarationInfo,
  markdown,
} from './common.js';

import './cem-type.js';
import './cem-reference.js';

const renderMemberName = (
  name: string,
  deprecated: boolean | string | undefined,
  privacy?: cem.Privacy | undefined,
  statik?: boolean | undefined,
  optional?: boolean,
  rest?: boolean
) => {
  return html`
    <code>
      ${whenDefined(
        deprecated,
        (d) =>
          html`<span
            class="deprecated"
            title="${d !== true ? d : 'This field is deprecated.'}"
            >deprecated
          </span>`
      )}
      ${privacy !== undefined && privacy !== 'public'
        ? privacy + ' '
        : ''}${statik ? 'static ' : ''}${rest ? '...' : ''}
      ${name}</code
    >
    ${optional ? html`<span class="optional"> (optional)</span>` : ''}
  `;
};

const renderClassField = (field: cem.ClassField) => {
  const {
    name,
    privacy,
    static: statik,
    deprecated,
    description,
    summary,
    type,
    default: def,
    // source,
    // inheritedFrom,
  } = field;
  return html`<tr>
    <td>${renderMemberName(name, deprecated, privacy, statik)}</td>
    <td>${whenDefined(type, (t) => html`<cem-type .type=${t}></cem-type>`)}</td>
    <td>${markdown(summary)}${markdown(description)}</td>
    <td>${whenDefined(def, (d) => html`<code>${d}</code>`)}</td>
  </tr>`;
};

const renderParameter = (param: cem.Parameter) => {
  const {
    name,
    description,
    summary,
    type,
    default: def,
    rest,
    optional,
    deprecated,
  } = param;
  return html`
    <tr>
      <td>
        <code
          >${renderMemberName(
            name,
            deprecated,
            'public',
            false,
            optional,
            rest
          )}</code
        >
      </td>
      <td>
        ${whenDefined(type, (t) => html`<cem-type .type=${t}></cem-type>`)}
      </td>
      <td>${markdown(summary)}${markdown(description)}</td>
      <td>${whenDefined(def, (d) => html`<code>${d}</code>`)}</td>
    </tr>
  `;
};

const renderClassMethod = (method: cem.ClassMethod) => {
  const {
    name,
    privacy,
    static: statik,
    deprecated,
    description,
    summary,
    return: ret,
    parameters,
    // TODO(kschaaf) Not implemented in CEM yet
    // source,
    // inheritedFrom,
  } = method;
  return html`<tr>
    <td>${renderMemberName(name, deprecated, privacy, statik)}</td>
    <td>${markdown(summary)}${markdown(description)}</td>
    <td>
      ${whenDefined(
        parameters,
        (params: cem.Parameter[]) =>
          html`
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Description</th>
                  <th>Default</th>
                </tr>
              </thead>
              <tbody>
                ${params.map(renderParameter)}
              </tbody>
            </table>
          `
      )}
    </td>
    <td>
      ${whenDefined(
        ret?.type,
        (t) =>
          html`Type: <cem-type .type=${t}></cem-type>${markdown(
              ret?.summary
            )}${markdown(ret?.description)}`
      )}
    </td>
  </tr>`;
};

const renderSlot = (slot: cem.Slot) => {
  return html`<tr>
    <td>${renderMemberName(slot.name, slot.deprecated)}}</td>
    <td>${markdown(slot.summary)}${markdown(slot.description)}</td>
  </tr>`;
};

const renderCssProperty = (prop: cem.CssCustomProperty) => {
  return html`<tr>
    <td>${renderMemberName(prop.name, prop.deprecated)}}</td>
    <td>${whenDefined(prop.syntax)}</td>
    <td>${markdown(prop.summary)}${markdown(prop.description)}</td>
    <td>${whenDefined(prop.default)}</td>
  </tr>`;
};

const renderCssPart = (part: cem.CssPart) => {
  return html`<tr>
    <td>${renderMemberName(part.name, part.deprecated)}}</td>
    <td>${markdown(part.summary)}${markdown(part.description)}</td>
  </tr>`;
};

@customElement('cem-class-declaration')
export class CemClassDeclaration extends LitElement {
  static styles = styles;
  @property()
  declaration!: cem.ClassDeclaration;
  @property()
  exportName?: string;
  render() {
    return html`
      ${renderDeclarationInfo(this.declaration, this.exportName)}
      <slot name="usage"></slot>
      ${whenDefined(
        this.declaration.members?.filter(
          (m) => m.kind === 'field' && m.privacy !== 'private'
        ),
        (m) => html` <h4>Fields</h4>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Description</th>
                <th>Default</th>
              </tr>
            </thead>
            <tbody>
              ${m.map((p) => renderClassField(p as cem.ClassField))}
            </tbody>
          </table>`
      )}
      ${whenDefined(
        this.declaration.members?.filter(
          (m) => m.kind === 'method' && m.privacy !== 'private'
        ),
        (m) => html` <h4>Methods</h4>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Parameters</th>
                <th>Return</th>
              </tr>
            </thead>
            <tbody>
              ${m.map((p) => renderClassMethod(p as cem.ClassMethod))}
            </tbody>
          </table>`
      )}
      ${whenDefined(
        (this.declaration as cem.CustomElementDeclaration).slots,
        (m) => html` <h4>Slots</h4>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              ${m.map((p) => renderSlot(p as cem.ClassMethod))}
            </tbody>
          </table>`
      )}
      ${whenDefined(
        (this.declaration as cem.CustomElementDeclaration).cssProperties,
        (m) => html` <h4>CSS Custom Properties</h4>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Syntax</th>
                <th>Description</th>
                <th>Default</th>
              </tr>
            </thead>
            <tbody>
              ${m.map((p) => renderCssProperty(p as cem.ClassMethod))}
            </tbody>
          </table>`
      )}
      ${whenDefined(
        (this.declaration as cem.CustomElementDeclaration).cssParts,
        (m) => html` <h4>CSS Parts</h4>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              ${m.map((p) => renderCssPart(p as cem.ClassMethod))}
            </tbody>
          </table>`
      )}
      ${whenDefined(
        this.declaration.superclass,
        (s) => html`<h4>Super Class</h4>
          <cem-reference .reference=${s}></cem-reference>`
      )}
      ${whenDefined(
        this.declaration.mixins,
        (mixins) => html`<h4>Mixins</h4>
          ${mixins.map(
            (m) => html`<cem-reference .reference=${m}></cem-reference>`
          )}`
      )}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'cem-class-declaration': CemClassDeclaration;
  }
}
