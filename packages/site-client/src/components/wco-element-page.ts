/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {html, css} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import {unsafeHTML} from 'lit/directives/unsafe-html.js';

import type {Package, Reference} from 'custom-elements-manifest/schema.js';
import {
  getModule,
  parseReferenceString,
  resolveReference,
  normalizeModulePath,
} from '@webcomponents/custom-elements-manifest-tools';
import {WCOPage} from './wco-page.js';

export interface ElementData {
  packageName: string;
  elementName: string;
  declarationReference: string;
  customElementExport: string;
  manifest: Package;
  elementDescriptionHtml: string;
}

@customElement('wco-element-page')
export class WCOElementPage extends WCOPage {
  static styles = [
    WCOPage.styles,
    css`
      .full-screen-error {
        display: flex;
        flex: 1;
        align-items: center;
        justify-items: center;
      }

      main {
        display: grid;
        max-width: var(--content-width);
        padding: 25px;
        gap: 1em;
        grid-template-areas:
          'a a'
          'b c';
      }

      main > * {
        border: solid 1px gray;
        border-radius: 9px;
      }

      header {
        display: flex;
        grid-area: a;
        gap: 1em;
        padding: 1em;
      }

      #logo {
        aspect-ratio: 4/3;
        height: 160px;
        background: blue;
        border-radius: 5px;
      }

      header h3 {
        text-overflow: ellipsis;
        height: 1em;
      }

      #side-bar {
        grid-area: b;
        min-width: 200px;
        padding: 1em;
      }

      #content {
        grid-area: c;
        padding: 1em;
      }
    `,
  ];

  @property({attribute: false})
  elementData?: ElementData;

  renderContent() {
    if (this.elementData === undefined) {
      return html`<div class="full-screen-error">No element to display</div>`;
    }
    const {
      packageName,
      elementName,
      declarationReference,
      customElementExport,
      manifest,
      elementDescriptionHtml,
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

    const summary =
      declaration.summary ?? declaration.description?.substring(0, 140) ?? '';

    return html`
      <header>
        <div id="logo-container"><div id="logo"></div></div>
        <div id="meta-container">
          <span id="package-meta"
            >${packageName}<select>
              <option>x.x.x</option>
            </select></span
          >
          <h1>&lt;${elementName}&gt;</h1>
          <h3>${summary}</h3>
        </div>
      </header>
      <div id="side-bar">
        <h3 id="author">[Author]</h3>
        <div>[Package Stats]</div>
        <h3>Install</h3>
        <code>npm install ${packageName}</code>
      </div>
      <div id="content">
        <p>${unsafeHTML(elementDescriptionHtml)}</p>

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
      </div>
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
