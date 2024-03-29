/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import './wco-element-page.js';
import type {ElementData} from './wco-element-page.js';
import {html} from 'lit';

export const renderElementPage = (elementData: ElementData) =>
  html`<wco-element-page .elementData=${elementData}></wco-element-page>`;
