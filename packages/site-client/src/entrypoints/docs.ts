/**
 * @license
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import '../components/wco-docs-page.js';
import type {NavEntry} from '../components/wco-docs-page.js';
import {html} from 'lit';

export const renderDocsPage = (navEntries: NavEntry[]) =>
  html`<wco-docs-page .navEntries=${navEntries}></wco-docs-page>`;
