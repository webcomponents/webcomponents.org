/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {hydrate} from 'lit/experimental-hydrate.js';
import {renderBody} from '@webcomponents/internal-site-content/templates/lib/body.js';
import {renderElementPage} from './element.js';

const data = (
  window as unknown as {__ssrData: Parameters<typeof renderElementPage>}
).__ssrData;

// We need to hydrate the whole page to remove any defer-hydration attributes.
// We could also remove the attribute manually, or not use deferhydration, but
// instead manually assign the data into the <wco-element-page> element, and
// time imports so that automatic element hydration happend after.
hydrate(renderBody(renderElementPage(...data)), document.body);
