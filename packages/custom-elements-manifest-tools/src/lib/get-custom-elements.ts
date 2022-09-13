/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  CustomElementDeclaration,
  CustomElementExport,
  Module,
  Package,
} from 'custom-elements-manifest/schema.js';
import {resolveReference} from './resolve-reference.js';

export type CustomElementInfo = {
  package: Package;
  module: Module;
  export: CustomElementExport;
  declaration: CustomElementDeclaration;
};

/**
 * Gets all the custom element exports of a package
 */
export const getCustomElements = (
  pkg: Package,
  packageName: string,
  packageVersion: string
): Array<CustomElementInfo> => {
  const customElements: Array<CustomElementInfo> = [];
  for (const mod of pkg.modules) {
    if (mod.exports) {
      for (const e of mod.exports) {
        if (e.kind === 'custom-element-definition') {
          // TODO (justinfagnani): for large manifests we want to index ahead
          // of time to avoid polynomial lookups
          const decl = resolveReference(
            pkg,
            mod,
            e.declaration,
            packageName,
            packageVersion
          );
          if (decl?.kind === 'class') {
            customElements.push({
              package: pkg,
              module: mod,
              export: e,
              declaration: decl,
            });
          }
        }
      }
    }
  }
  return customElements;
};
