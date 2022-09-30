/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  ReadablePackageStatus,
  UnreadablePackageStatus,
  ReadableVersionStatus,
  UnreadableVersionStatus,
} from './_schema.js';
export * from './_schema.js';

export const PackageStatus = {
  ...ReadablePackageStatus,
  ...UnreadablePackageStatus,
} as const;
export type PackageStatus = typeof PackageStatus[keyof typeof PackageStatus];

export const VersionStatus = {
  ...ReadableVersionStatus,
  ...UnreadableVersionStatus,
} as const;
export type VersionStatus = typeof VersionStatus[keyof typeof VersionStatus];
