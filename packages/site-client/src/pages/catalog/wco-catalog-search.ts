/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {html, css, LitElement} from 'lit';
import {customElement, query, state} from 'lit/decorators.js';
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
  `;

  @query('input')
  private _search!: HTMLInputElement;

  @state()
  private _elements: Array<CustomElement> | undefined;

  render() {
    return html`
      <p>Search: <input id="search" @change=${this._onChange} /></p>
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
