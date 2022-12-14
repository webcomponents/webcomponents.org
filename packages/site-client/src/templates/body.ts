/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {html} from 'lit';
import '../components/wco-top-bar.js';

export const renderBody = (content: unknown) => html`<wco-top-bar></wco-top-bar>
  ${content}`;
