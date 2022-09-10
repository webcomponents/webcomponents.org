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

import {PackageVersion} from '@webcomponents/catalog-api/lib/schema.js';

export const packageVersionConverter: FirestoreDataConverter<PackageVersion> = {
  fromFirestore(snapshot: QueryDocumentSnapshot<DocumentData>): PackageVersion {
    return {
      status: snapshot.get('status'),
      lastUpdate: (snapshot.get('lastUpdate') as Timestamp).toDate(),
      version: snapshot.id,
      // TODO: convert from Map to list
      distTags: snapshot.get('distTags'),
      description: snapshot.get('description'),
      type: snapshot.get('type'),
      author: snapshot.get('author'),
      time: snapshot.get('time'),
      homepage: snapshot.get('homepage'),
      customElements: snapshot.get('customElements'),
      customElementsManifest: snapshot.get('customElementsManifest'),
    };
  },
  toFirestore(_packageInfo: PackageVersion) {
    throw new Error('not implemented');
  },
};
