/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {html, css, LitElement} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import type {CustomElement} from '@webcomponents/catalog-api/lib/schema.js';

@customElement('wco-element-card')
export class WCOElementCard extends LitElement {
  static styles = css`
    :host {
      display: block;
      /* TODO (justinfagnani): who controls the size? This or the containing
         grid? */
      width: 200px;
      height: 200px;
      border: solid 1px #444;
      border-radius: 8px;
      padding: 4px;
      overflow: clip;
      box-sizing: border-box;
      cursor: pointer;
    }

    :host(:hover) {
      box-shadow: 5px 5px 10px gray;
    }

    a#card-link {
      display: flex;
      flex-direction: column;
      align-items: center;
      color: inherit;
      text-decoration: none;
      height: 100%;
    }

    h2 {
      margin: 0;
      font-size: 1em;
    }

    h3 {
      margin: 0;
      font-size: 1em;
      color: #888;
      font-weight: normal;
    }

    #initials {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 64px;
      height: 64px;
      border-radius: 10%;
      color: white;
      background: #d6543d;
      font-size: 2em;
      font-weight: bold;
    }
  `;

  @property()
  private element?: CustomElement;

  render() {
    if (this.element === undefined) {
      return undefined;
    }
    const packageName = this.element.package;
    const tagName = this.element.tagName ?? '';

    // Generate one or two-letter initials starting after what we assyme is
    // the tagname prefix. This is a stand-in for icons, which aren't
    // represented in the CE manifest yet.
    const tagNameParts = tagName.split('-');
    let initials = (tagNameParts[1]?.[0] ?? '') + (tagNameParts[2]?.[0] ?? '');
    initials = initials.toUpperCase();

    return html`
      <a id="card-link" href="/catalog/element/${packageName}/${tagName}">
        <div id="initials">${initials}</div>
        <h2>&lt;${tagName}&gt;</h2>
        <h3>${packageName}</h3>
        <div>${this.element?.author}</div>
      </a>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'wco-element-card': WCOElementCard;
  }
}
