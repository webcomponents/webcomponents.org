/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {html, css, LitElement} from 'lit';
import {customElement} from 'lit/decorators.js';
import {classMap} from 'lit/directives/class-map.js';

const pathStartsWith = (s: string) => window.location.pathname.startsWith(s);

@customElement('wco-top-bar')
export class WCOTopBar extends LitElement {
  static styles = css`
    :host {
      position: sticky;
      top: 0;
      left: 0;
      width: 100vw;
      height: 70px;
      padding: 0 20px;
      display: flex;
      align-items: center;
      background: #eee;
      border-bottom: 1px solid #ccc;
      box-sizing: border-box;
      font-weight: 500;
      color: #222;
    }

    #title {
      font-size: 1.5rem;
      letter-spacing: 0.05em;
      text-transform: lowercase;
    }

    #logo {
      border-radius: 10%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      background: #444;
      color: white;
      font-size: 1.25rem;
      font-weight: normal;
      margin-right: 8px;
      text-transform: initial;
    }

    nav {
      display: flex;
      justify-content: right;
      align-items: center;
      flex: 1;
      height: 100%;
      font-size: 1.25rem;
    }

    nav > a {
      display: flex;
      align-items: center;
      height: 100%;
      padding: 0 16px;
      text-decoration: none;
      color: inherit;
    }

    nav > a:hover {
      background: #00000008;
    }

    nav > a.active {
      color: blue;
    }

    a {
      color: inherit;
      text-decoration: none;
    }
  `;

  render() {
    return html`
      <a href="/"
        ><span id="title"><span id="logo">WC</span> WebComponents.org</span></a
      >
      <nav>
        <a
          class="${classMap({
            active: pathStartsWith('/catalog'),
          })}"
          href="/catalog"
          >Catalog</a
        >
        <a
          class="${classMap({
            active: pathStartsWith('/docs'),
          })}"
          href="/docs"
          >Docs</a
        >
        <a
          class="${classMap({
            active: pathStartsWith('/articles'),
          })}"
          href="/articles"
          >Articles</a
        >
        <a
          class="${classMap({
            active: pathStartsWith('/community'),
          })}"
          href="/community"
          >Community</a
        >
      </nav>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'wco-top-bar': WCOTopBar;
  }
}
