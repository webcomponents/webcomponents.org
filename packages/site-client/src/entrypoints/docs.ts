/**
 * @license
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import '../components/wco-docs-page.js';
import type {NavEntry} from '../components/wco-docs-page.js';
import {html} from 'lit';
import {unsafeHTML} from 'lit/directives/unsafe-html.js';

export const renderDocsPage = (content: string, navEntries: NavEntry[]) =>
  html`<wco-docs-page .navEntries=${navEntries}
    >${unsafeHTML(content)}</wco-docs-page
  >`;
