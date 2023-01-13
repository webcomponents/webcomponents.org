/**
 * @license
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {NavEntry} from '../../shared/wco-nav-page.js';

const data = (globalThis as unknown as {__ssrData: [NavEntry[]]}).__ssrData;

const navEntries = data[0];
// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const el = document.querySelector('wco-docs-page')!;
el.navEntries = navEntries;
el.removeAttribute('defer-hydration');
