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
  ReadablePackageInfo,
  PackageInfo,
  PackageVersion,
  ReadablePackageVersion,
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

export const isReadablePackage = (
  p: PackageInfo | undefined
): p is ReadablePackageInfo =>
  p !== undefined &&
  (p.status === PackageStatus.READY || p.status === PackageStatus.UPDATING);

export const isReadablePackageVersion = (
  p: PackageVersion | undefined
): p is ReadablePackageVersion =>
  p !== undefined &&
  (p.status === VersionStatus.READY || p.status === VersionStatus.INVALID);
