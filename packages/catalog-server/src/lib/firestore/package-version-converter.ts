/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  DocumentData,
  FirestoreDataConverter,
  QueryDocumentSnapshot,
  Timestamp,
} from '@google-cloud/firestore';

import {
  isReadablePackageVersion,
  PackageVersion,
} from '@webcomponents/catalog-api/lib/schema.js';

export const packageVersionConverter: FirestoreDataConverter<PackageVersion> = {
  fromFirestore(snapshot: QueryDocumentSnapshot<DocumentData>): PackageVersion {
    return {
      status: snapshot.get('status'),
      lastUpdate: (snapshot.get('lastUpdate') as Timestamp).toDate(),
      version: snapshot.id,
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
  toFirestore(packageVersion: PackageVersion) {
    if (isReadablePackageVersion(packageVersion)) {
      return {
        author: packageVersion.author,
        customElementsManifest: packageVersion.customElementsManifest,
        description: packageVersion.description,
        distTags: packageVersion.distTags,
        isLatest: packageVersion.distTags.includes('latest'),
        homepage: packageVersion.homepage,
        lastUpdate: packageVersion.lastUpdate,
        status: packageVersion.status,
        time: Timestamp.fromDate(packageVersion.time),
        type: packageVersion.type,
      };
    } else {
      return {
        status: packageVersion.status,
        lastUpdate: packageVersion.lastUpdate,
      };
    }
  },
};
