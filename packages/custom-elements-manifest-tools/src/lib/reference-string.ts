/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {Reference} from 'custom-elements-manifest/schema.js';

/**
 * Serializes a reference to a string, as used in the GraphQL API of the
 * custom elements catalog.
 *
 * TODO (justinfagnani): define format for package and module relative refs.
 * Take a Reference object instead of individual params.
 */
export const referenceString = (
  packageName: string,
  modulePath: string,
  name: string
) => {
  if (modulePath.startsWith('/')) {
    modulePath = modulePath.substring(1);
  }
  return `${packageName}/${modulePath}#${name}`;
};

/**
 * Parses a serialized reference string produced by referenceString*()
 */
export const parseReferenceString = (reference: string): Reference => {
  const hashIndex = reference.indexOf('#');
  if (hashIndex === -1) {
    throw new Error(`Invalid reference string ${reference}`);
  }
  const name = reference.substring(hashIndex + 1);
  const path = reference.substring(0, hashIndex);
  const pathSegments = path.split('/');
  const isScoped = pathSegments[0]?.startsWith('@');
  const packageName = isScoped
    ? pathSegments[0] + '/' + pathSegments[1]
    : pathSegments[0]!;
  const modulePath = path.substring(packageName.length);
  return {
    package: packageName,
    module: modulePath,
    name,
  };
};
