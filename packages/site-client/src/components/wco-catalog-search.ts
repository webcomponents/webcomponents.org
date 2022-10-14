/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

 import {html, css, LitElement} from 'lit';
 import {customElement} from 'lit/decorators.js';
 
 @customElement('wco-catalog-search')
 export class WCOCatalogSearch extends LitElement {
   static styles = css`
     :host {
       display: flex;
       align-items: center;
     }
   `;
 
   render() {
     return html`
       Search: <input>
     `;
   }
 }
 
 declare global {
   interface HTMLElementTagNameMap {
     'wco-catalog-search': WCOCatalogSearch;
   }
 }
 