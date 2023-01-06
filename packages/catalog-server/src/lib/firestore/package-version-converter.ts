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
  ReadablePackageVersion,
  UnreadablePackageVersion,
} from '@webcomponents/catalog-api/lib/schema.js';

export type ReadableCompressedPackageVersion = Omit<
  ReadablePackageVersion,
  'customElementsManifest' | '__typename'
> & {
  customElementsManifestCompressed?: string;
  // Prevent this from being assignable to a ReadablePackageVersion to force
  // consumer to convert correctly.
  __typename: 'ReadableCompressedPackageVersion';
};

export type CompressedPackageVersion =
  | ReadableCompressedPackageVersion
  | UnreadablePackageVersion;

export const packageVersionConverter: FirestoreDataConverter<CompressedPackageVersion> =
  {
    fromFirestore(
      snapshot: QueryDocumentSnapshot<DocumentData>
    ): CompressedPackageVersion {
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
        customElementsManifestCompressed: snapshot.get(
          'customElementsManifest'
        ),
      };
    },
    toFirestore(packageVersion: CompressedPackageVersion) {
      if (isReadableCompressedPackageVersion(packageVersion)) {
        return {
          author: packageVersion.author,
          customElementsManifest:
            packageVersion.customElementsManifestCompressed,
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

export const isReadableCompressedPackageVersion = (
  p: CompressedPackageVersion
): p is ReadableCompressedPackageVersion =>
  isReadablePackageVersion(p as PackageVersion);
