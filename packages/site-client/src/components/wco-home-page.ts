/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {css} from 'lit';
import {customElement} from 'lit/decorators.js';
import {WCOPage} from '../shared/wco-page.js';
import '../shared/wco-top-bar.js';

@customElement('wco-home-page')
export class WCOHomePage extends WCOPage {
  static styles = [WCOPage.styles, css``];
}

declare global {
  interface HTMLElementTagNameMap {
    'wco-home-page': WCOHomePage;
  }
}
