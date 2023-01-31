/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {html, LitElement} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import {ifDefined} from 'lit/directives/if-defined.js';
import type * as cem from 'custom-elements-manifest/schema.js';
import {CemReferenceResolver, defaultReferenceResolver} from './common.js';

const specifierFromReference = (ref: cem.Reference) => {
  const {package: pkg, module} = ref;
  return `${pkg}${module === undefined ? '' : `/${module}`}`;
};

@customElement('cem-reference')
export class CemReference extends LitElement {
  // TODO(kschaaf) Eventually use context to provide this
  // @consume({context: cemReferenceResolver, subscribe: true})
  @property()
  resolveReference: CemReferenceResolver = defaultReferenceResolver;
  @property()
  reference!: cem.Reference;
  render() {
    return html`<a href="${ifDefined(this.resolveReference?.(this.reference))}"
        ><code>${this.reference.name}</code></a
      >
      from <code>${specifierFromReference(this.reference)}</code>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'cem-reference': CemReference;
  }
}
