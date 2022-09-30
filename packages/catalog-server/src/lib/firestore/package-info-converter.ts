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
  WithFieldValue,
} from '@google-cloud/firestore';

import {
  DistTag,
  isReadablePackage,
  PackageInfo,
  ReadablePackageInfo,
  ReadablePackageStatus,
  UnreadablePackageInfo,
} from '@webcomponents/catalog-api/lib/schema.js';
import { distTagListToMap } from '../npm.js';

export const packageInfoConverter: FirestoreDataConverter<PackageInfo> = {
  fromFirestore(snapshot: QueryDocumentSnapshot<DocumentData>): PackageInfo {
    const name = idToPackageName(snapshot.id);
    const status = snapshot.get('status');
    const lastUpdate = (snapshot.get('lastUpdate') as Timestamp).toDate();

    if (status === ReadablePackageStatus.READY || status === ReadablePackageStatus.UPDATING) {
      const distTagsMap = snapshot.get('distTags');
      const distTags = distTagsMap && Object.entries(distTagsMap).map(
        ([tag, version]) => ({tag, version} as DistTag)
      );
      return {
        name,
        status,
        lastUpdate,
        description: snapshot.get('description'),
        distTags,
        // `version` is left to a sub-collection query
      } as ReadablePackageInfo;  
    } else {
      return {
        name,
        status,
        lastUpdate,
      } as UnreadablePackageInfo;
    }
  },
  toFirestore(packageInfo: WithFieldValue<PackageInfo>) {
    if (isReadablePackage(packageInfo as PackageInfo)) {
      const data = packageInfo as WithFieldValue<ReadablePackageInfo>;
      return {
        status: data.status,
        // TODO (justinfagnani): we could force this to be
        // FieldValue.serverTimestamp() here.
        lastUpdate: data.lastUpdate,
        description: data.description,
        distTags: distTagListToMap(data.distTags as Array<DistTag>),
        // new Map(
        //   // We don't support FieldValues in distTags, so cast away:
        //   (data.distTags as DistTag[]).map((t) => [t.tag, t.version])
        // ),
      };
    } else {
      return {
        status: packageInfo.status,
        lastUpdate: packageInfo.lastUpdate,
      };
    }
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
  packageName.replace('__', '/');
