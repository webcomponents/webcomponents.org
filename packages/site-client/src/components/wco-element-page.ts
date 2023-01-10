/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {html, css} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import {WCOPage} from './wco-page.js';

import type {Package, Reference} from 'custom-elements-manifest/schema.js';
import {
  getModule,
  parseReferenceString,
  resolveReference,
  normalizeModulePath,
} from '@webcomponents/custom-elements-manifest-tools';

export interface ElementData {
  packageName: string;
  elementName: string;
  declarationReference: string;
  customElementExport: string;
  manifest: Package;
}

@customElement('wco-element-page')
export class WCOElementPage extends WCOPage {
  static styles = [
    WCOPage.styles,
    css`
      :host {
        display: flex;
        flex-direction: column;
      }

      .full-screen-error {
        display: flex;
        flex: 1;
        align-items: center;
        justify-items: center;
      }
    `,
  ];

  @property({attribute: false})
  elementData?: ElementData;

  renderMain() {
    if (this.elementData === undefined) {
      return html`<div class="full-screen-error">No element to display</div>`;
    }
    const {
      packageName,
      elementName,
      declarationReference,
      customElementExport,
      manifest,
    } = this.elementData;
    const ceExportRef = parseReferenceString(customElementExport);
    const declarationRef = parseReferenceString(declarationReference);
    const module =
      declarationRef.module === undefined
        ? undefined
        : getModule(manifest, declarationRef.module);
    const declaration =
      module === undefined
        ? undefined
        : resolveReference(manifest, module, declarationRef, packageName, '');

    if (declaration === undefined || declaration.kind !== 'class') {
      return html`<div class="full-screen-error">
        Could not find element declaration
      </div>`;
    }

    const fields = declaration.members?.filter((m) => m.kind === 'field');
    const methods = declaration.members?.filter((m) => m.kind === 'method');

    return html`
      <h1>${packageName}/${elementName}</h1>
      <h3>${declaration.summary}</h3>

      <p>${declaration.description}</p>

      <h2>Usage</h2>
      <pre><code>
import '${getElementImportSpecifier(packageName, ceExportRef)}';
     </code></pre>

      <h2>Fields</h2>
      <ul>
        ${fields?.map((f) => html`<li>${f.name}: ${f.description}</li>`)}
      </ul>

      <h2>Methods</h2>
      <ul>
        ${methods?.map((m) => html`<li>${m.name}: ${m.description}</li>`)}
      </ul>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'wco-element-page': WCOElementPage;
  }
}

const getElementImportSpecifier = (
  packageName: string,
  ceExportRef: Reference
) =>
  ceExportRef.module === undefined
    ? packageName
    : `${packageName}/${normalizeModulePath(ceExportRef.module)}`;
