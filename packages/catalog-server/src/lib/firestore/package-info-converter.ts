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
} from '@google-cloud/firestore';

import {
  DistTag,
  PackageInfo,
  ReadablePackageInfo,
} from '@webcomponents/catalog-api/lib/schema.js';

export const packageInfoConverter: FirestoreDataConverter<
  Omit<PackageInfo, 'version'>
> = {
  fromFirestore(
    snapshot: QueryDocumentSnapshot<DocumentData>
  ): Omit<PackageInfo, 'version'> {
    const distTags = snapshot.get('distTags');
    const graphQLDistTags = Object.entries(distTags).map(
      ([tag, version]) => ({tag, version} as DistTag)
    );
    return {
      name: snapshot.id,
      lastUpdate: (snapshot.get('lastUpdate') as Timestamp).toDate(),
      status: snapshot.get('status'),
      description: snapshot.get('description'),
      distTags: graphQLDistTags,
    } as ReadablePackageInfo;
  },
  toFirestore(_packageInfo: PackageInfo) {
    throw new Error('not implemented');
  },
};