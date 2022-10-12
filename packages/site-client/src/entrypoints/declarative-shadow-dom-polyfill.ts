/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {hydrateShadowRoots as polyfillDeclarativeShadowRoots} from '@webcomponents/template-shadowroot/template-shadowroot.js';

// eslint-disable-next-line no-prototype-builtins
if (!HTMLTemplateElement.prototype.hasOwnProperty('shadowRoot')) {
  polyfillDeclarativeShadowRoots(document.body);
}
