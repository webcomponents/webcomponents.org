/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {renderElementPage} from './element.js';
import {hydrate} from 'lit/experimental-hydrate.js';

const data = (
  window as unknown as {__ssrData: Parameters<typeof renderElementPage>}
).__ssrData;
hydrate(renderElementPage(...data), document.body);
