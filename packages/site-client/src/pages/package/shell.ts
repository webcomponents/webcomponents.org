/**
 * @license
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import './wco-package-page.js';
import type {PackageData} from './wco-package-page.js';
import {html} from 'lit';

export const renderPackagePage = (packageData: PackageData) =>
  html`<wco-package-page .packageData=${packageData}></wco-package-page>`;
