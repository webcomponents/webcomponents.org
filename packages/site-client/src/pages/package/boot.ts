/**
 * @license
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import 'lit/experimental-hydrate-support.js';
import {hydrate} from 'lit/experimental-hydrate.js';
import {renderPackagePage} from './shell.js';

const data = (
  globalThis as unknown as {__ssrData: Parameters<typeof renderPackagePage>}
).__ssrData;

// We need to hydrate the whole page to remove any defer-hydration attributes.
// We could also remove the attribute manually, or not use deferhydration, but
// instead manually assign the data into the <wco-package-page> element, and
// time imports so that automatic element hydration happend after.
hydrate(renderPackagePage(...data), document.body);
