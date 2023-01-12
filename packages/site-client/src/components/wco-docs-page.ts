/**
 * @license
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {customElement} from 'lit/decorators.js';
import {WCONavPage} from './wco-nav-page.js';

export type {NavEntry} from './wco-nav-page.js';

@customElement('wco-docs-page')
export class WCODocsPage extends WCONavPage {}

declare global {
  interface HTMLElementTagNameMap {
    'wco-docs-page': WCODocsPage;
  }
}
