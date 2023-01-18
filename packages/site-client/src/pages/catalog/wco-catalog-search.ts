/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {html, css, LitElement} from 'lit';
import {customElement, query, state} from 'lit/decorators.js';

import '@material/web/textfield/outlined-text-field.js';
import type {MdOutlinedTextField} from '@material/web/textfield/outlined-text-field.js';

import '@material/web/icon/icon.js';

import type {CustomElement} from '@webcomponents/catalog-api/lib/schema.js';

import './wco-element-card.js';

@customElement('wco-catalog-search')
export class WCOCatalogSearch extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    div {
      display: grid;
      grid-template-columns: repeat(4, 200px);
      grid-template-rows: auto;
      grid-auto-columns: 200px;
      grid-auto-rows: 200px;
      gap: 8px;
    }

    md-outlined-text-field {
      width: 40em;
      --md-outlined-field-container-shape-start-start: 28px;
      --md-outlined-field-container-shape-start-end: 28px;
      --md-outlined-field-container-shape-end-start: 28px;
      --md-outlined-field-container-shape-end-end: 28px;
    }
  `;

  @query('#search')
  private _search!: MdOutlinedTextField;

  @state()
  private _elements: Array<CustomElement> | undefined;

  render() {
    return html`
      <section id="search-panel">
        <h2>Web Components.org Catalog</h2>
        <md-outlined-text-field id="search" @change=${this._onChange}
          ><md-icon slot="leadingicon">search</md-icon></md-outlined-text-field
        >
      </section>
      <div>
        ${this._elements?.map(
          (e) => html`<wco-element-card .element=${e}></wco-element-card>`
        )}
      </div>
    `;
  }

  protected firstUpdated() {
    // TODO (justinfagnani): we may want to use a router (and write the search
    // to the URL) but this is easy for now.
    const urlQuery = new URLSearchParams(globalThis.location.search).get(
      'query'
    );
    if (urlQuery) {
      this._search.value = urlQuery;
      this._onChange();
    }
  }

  async _onChange() {
    const searchText = this._search.value;
    const response = await fetch(`/catalog/search?query=${searchText}`);
    const result = await response.json();
    this._elements = result.elements;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'wco-catalog-search': WCOCatalogSearch;
  }
}
