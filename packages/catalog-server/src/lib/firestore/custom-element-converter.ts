/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  DocumentData,
  FirestoreDataConverter,
  QueryDocumentSnapshot,
} from '@google-cloud/firestore';

import {CustomElement} from '@webcomponents/catalog-api/lib/schema.js';

export const customElementConverter: FirestoreDataConverter<CustomElement> = {
  fromFirestore(snapshot: QueryDocumentSnapshot<DocumentData>): CustomElement {
    return {
      package: snapshot.get('package'),
      version: snapshot.get('version'),
      // TODO: convert from Map to list
      distTags: snapshot.get('distTags'),
      author: snapshot.get('author'),
      tagName: snapshot.get('tagName'),
      className: snapshot.get('className'),
      customElementExport: snapshot.get('customElementExport'),
      declaration: snapshot.get('declaration'),
    };
  },
  toFirestore(_packageInfo: CustomElement) {
    throw new Error('not implemented');
  },
};
