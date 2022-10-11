/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @overview
 * This module contains utilities for interacting with the npm registry and
 * downloading custom element manifests from it.
 */
import * as semver from 'semver';

export const getDistTagsForVersion = (
  distTags: {[tag: string]: string},
  version: string
) =>
  Object.entries(distTags)
    .filter(([, v]) => v === version)
    .map(([t]) => t);

export const distTagMapToList = (distTags: {[tag: string]: string}) =>
  Object.entries(distTags).map(([tag, version]) => ({
    tag,
    version,
  }));

export const distTagListToMap = (
  distTags: ReadonlyArray<{readonly tag: string; readonly version: string}>
) => Object.fromEntries(distTags.map(({tag, version}) => [tag, version]));

export const isValidSemver = (versionOrTag: string) =>
  semver.valid(versionOrTag) === null ? false : true;
