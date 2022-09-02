/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  Declaration,
  Module,
  Package,
  Reference,
} from 'custom-elements-manifest/schema';
import {getModule} from '../index.js';

/**
 * Resolves a manifest reference from a local package and module into a
 * Declaration object.
 *
 * The current implementatino can only resolve within the local package. To
 * resolve to external packages would require some kind of package registry.
 *
 * The `packageName` and `packageVersion` parameters are required for good
 * error messages if the reference can't be resolved.
 */
export const resolveReference = (
  pkg: Package,
  localModule: Module,
  ref: Reference,
  packageName: string,
  packageVersion: string
): Declaration | undefined => {
  // Check for local reference
  if (ref.package !== undefined && ref.package !== packageName) {
    // We don't know how to resolve cross-package references yet
    console.warn("Can't resolve cross-package reference", ref);
    return undefined;
  }
  // Local reference
  const mod =
    ref.module === undefined ? localModule : getModule(pkg, ref.module);
  if (mod === undefined) {
    // Module not found
    const modules = pkg.modules.map((m) => m.path);
    console.warn(
      "Can't find module",
      packageName,
      packageVersion,
      ref.module,
      modules
    );
    return undefined;
  }
  if (mod.declarations) {
    for (const d of mod.declarations) {
      if (d.name === ref.name) {
        return d;
      }
    }
  }
  console.warn(
    "Can't find declaration",
    packageName,
    packageVersion,
    ref.module,
    ref.name
  );
  return undefined;
};
