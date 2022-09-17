/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  DocumentData,
  FirestoreDataConverter,
  QueryDocumentSnapshot,
  Timestamp,
  WithFieldValue,
} from '@google-cloud/firestore';

import {
  DistTag,
  PackageInfo,
  ReadablePackageInfo,
} from '@webcomponents/catalog-api/lib/schema.js';

export const packageInfoConverter: FirestoreDataConverter<PackageInfo> = {
  fromFirestore(snapshot: QueryDocumentSnapshot<DocumentData>): PackageInfo {
    const distTags = snapshot.get('distTags');
    const graphQLDistTags = Object.entries(distTags).map(
      ([tag, version]) => ({tag, version} as DistTag)
    );
    return {
      name: idToPackageName(snapshot.id),
      lastUpdate: (snapshot.get('lastUpdate') as Timestamp).toDate(),
      status: snapshot.get('status'),
      description: snapshot.get('description'),
      distTags: graphQLDistTags,
      // `version` is left to a sub-collection query
    } as ReadablePackageInfo;
  },
  toFirestore(packageInfo: WithFieldValue<PackageInfo>) {
    const data = packageInfo as ReadablePackageInfo;
    return {
      status: data.status,
      // TODO (justinfagnani): we could force this to be
      // FieldValue.serverTimestamp() here.
      lastUpdate: data.lastUpdate,
      description: data.description,
      distTags: new Map(data.distTags.map((t) => [t.tag, t.version])),
    };
  },
};

/**
 * Converts a package name to a Firestore ID.
 *
 * Firestore IDs cannot include a '/', so we convert it to '__'.
 *
 * This is a similar to the transform TypeScript does for `@types`
 * packages.
 */
export const packageNameToId = (packageName: string) =>
  packageName.replace('/', '__');

/**
 * Converts a Firestore ID to a package name.
 */
export const idToPackageName = (packageName: string) =>
  packageName.replace('/', '__');
