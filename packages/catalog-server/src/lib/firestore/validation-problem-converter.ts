/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  DocumentData,
  FirestoreDataConverter,
  QueryDocumentSnapshot,
} from '@google-cloud/firestore';
import type {ValidationProblem} from '@webcomponents/catalog-api/lib/schema.js';

export const validationProblemConverter: FirestoreDataConverter<ValidationProblem> =
  {
    fromFirestore(
      snapshot: QueryDocumentSnapshot<DocumentData>
    ): ValidationProblem {
      return {
        code: snapshot.get('status') as string,
        filePath: snapshot.get('filePath') as string,
        start: snapshot.get('start') as number,
        length: snapshot.get('length') as number,
        message: snapshot.get('message') as string,
        severity: snapshot.get('severity') as 'error' | 'warning',
      };
    },
    toFirestore(problem: ValidationProblem) {
      return problem;
    },
  };
