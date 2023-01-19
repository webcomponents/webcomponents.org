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

@customElement('cem-type')
export class CemType extends LitElement {
  // TODO(kschaaf) Eventually use context to provide this
  // @consume({context: cemReferenceResolver, subscribe: true})
  @property()
  resolveReference: CemReferenceResolver = defaultReferenceResolver;
  @property()
  type!: cem.Type;
  render() {
    const {text, references: refs = []} = this.type;
    return html`<code
      >${[
        ...refs.map(
          (r, idx) =>
            html`${text.slice(refs[idx - 1]?.end ?? 0, r.start)}<a
                href="${ifDefined(this.resolveReference?.(r))}"
                >${text.slice(r.start, r.end)}</a
              >`
        ),
        text.slice(refs[refs.length - 1]?.end ?? 0),
      ]}</code
    >`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'cem-type': CemType;
  }
}
