/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Package} from 'custom-elements-manifest/schema';

export const getModule = (pkg: Package, path: string) => {
  if (path.startsWith('/')) {
    path = path.substring(1);
  }
  for (const mod of pkg.modules) {
    // TODO: do we need to normalize paths?
    if (mod.path === path) {
      return mod;
    }
  }
  return undefined;
};
