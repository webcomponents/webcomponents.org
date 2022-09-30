/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  FieldValue,
  Timestamp,
  DocumentReference,
  Query,
  CollectionReference,
} from '@google-cloud/firestore';
import {Firestore} from '@google-cloud/firestore';
import firebase from 'firebase-admin';
import {CustomElementInfo} from '@webcomponents/custom-elements-manifest-tools';
import {referenceString} from '@webcomponents/custom-elements-manifest-tools/lib/reference-string.js';

import {getDistTagsForVersion} from '../npm.js';

import {
  CustomElement,
  PackageInfo,
  PackageStatus,
  PackageVersion,
  VersionStatus,
  ValidationProblem
} from '@webcomponents/catalog-api/lib/schema.js';
import {Package} from '@webcomponents/custom-elements-manifest-tools/lib/npm.js';
import {Repository} from '../repository.js';
import {packageInfoConverter} from './package-info-converter.js';
import {packageVersionConverter} from './package-version-converter.js';
import {customElementConverter} from './custom-element-converter.js';
import {validationProblemConverter} from './validation-problem-converter.js';

const projectId = 'wc-catalog';
firebase.initializeApp({projectId});
export const db = new Firestore({projectId});

export class FirestoreRepository implements Repository {
  async startPackageVersionImport(
    packageName: string,
    version: string
  ): Promise<void> {
    // TODO: verify that the package exists. Or does Firestore already do that
    // with subcollections?
    const versionRef = getPackageVersionRef(packageName, version);
    // Since create() fails if the document exists, we don't need a transaction
    await versionRef.create({
      status: VersionStatus.INITIALIZING,
      lastUpdate: FieldValue.serverTimestamp(),
    });
  }

  async endPackageVersionImportWithReady(
    packageName: string,
    version: string,
    packageMetadata: Package,
    customElementsManifestSource: string | undefined
  ): Promise<void> {
    const packageVersionMetadata = packageMetadata.versions[version]!;
    await db.runTransaction(async (t) => {
      const versionRef = getPackageVersionRef(packageName, version);
      const packageVersionDoc = await t.get(
        versionRef.withConverter(packageVersionConverter)
      );
      const packageVersionData = packageVersionDoc.data();
      if (packageVersionData === undefined) {
        console.error(`Package version not found: ${packageName}@${version}`);
        throw new Error(`Package version not found: ${packageName}@${version}`);
      }
      if (packageVersionData.status !== VersionStatus.INITIALIZING) {
        console.error(
          `Unexpected package version status: ${packageVersionData.status}`
        );
        throw new Error(
          `Unexpected package version status: ${packageVersionData.status}`
        );
      }
      const packageTime = packageMetadata.time[version]!;
      const packageType = packageVersionMetadata.type ?? 'commonjs';
      const author = packageVersionMetadata.author?.name ?? '';
      const distTags = packageMetadata['dist-tags'];
      const versionDistTags = getDistTagsForVersion(distTags, version);

      // Store package data and mark version as ready
      // TODO: we want this type to match the schema and converter type. How do
      // we get strongly typed refs?
      await t.set(versionRef, {
        status: VersionStatus.READY,
        lastUpdate: FieldValue.serverTimestamp(),
        // TODO (justinfagnani): augment PackageVersion type with denormalized
        // fields:
        // package: packageName,
        version,
        description: packageVersionMetadata.description ?? '',
        type: packageType,
        distTags: versionDistTags,
        author,
        // TODO: convert to Timestamp
        time: packageTime,
        homepage: packageVersionMetadata.homepage ?? null,
        customElementsManifest: customElementsManifestSource ?? null,
      });
    });
  }

  async endPackageVersionImportWithError(
    packageName: string,
    version: string
  ): Promise<void> {
    await db.runTransaction(async (t) => {
      const versionRef = getPackageVersionRef(packageName, version);
      const packageVersionDoc = await t.get(
        versionRef.withConverter(packageVersionConverter)
      );
      const packageVersionData = packageVersionDoc.data();
      if (packageVersionData === undefined) {
        throw new Error(`Package version not found: ${packageName}@${version}`);
      }
      if (packageVersionData.status !== VersionStatus.INITIALIZING) {
        throw new Error(
          `Unexpected package version status: ${packageVersionData.status}`
        );
      }
      await t.update(versionRef, {
        status: VersionStatus.ERROR,
        lastUpdate: FieldValue.serverTimestamp(),
      });
    });
  }

  async writeCustomElements(
    packageName: string,
    version: string,
    customElements: CustomElementInfo[],
    distTags: string[],
    author: string
  ): Promise<void> {
    // Store custom elements data in subcollection
    const versionRef = getPackageVersionRef(packageName, version);
    const customElementsCollectionRef = versionRef.collection('customElements');
    await Promise.all(
      customElements.map(async (c) => {
        const customElementRef = customElementsCollectionRef.doc();
        await customElementRef.set({
          package: packageName,
          version,
          distTags,
          author,
          tagName: c.export.name,
          className: c.declaration.name,
          // TODO (justinfagnani): Do we need to namespace custom element exports
          // to separate them from JS exports? Or do we just know the export name
          // is in the global registry here?
          customElementExport: referenceString(
            packageName,
            c.module,
            c.export.name
          ),
          declaration: referenceString(
            packageName,
            c.module,
            c.declaration.name
          ),
        });
      })
    );
  }

  async writeProblems(
    packageName: string,
    version: string,
    problems: Array<ValidationProblem>
  ): Promise<void> {
    const versionRef = getPackageVersionRef(packageName, version);
    const problemsRef = versionRef
      .collection('problems')
      .withConverter(validationProblemConverter);
    const batch = db.batch();
    for (const problem of problems) {
      batch.create(problemsRef.doc(), problem);
    }
    await batch.commit();
  }

  async getProblems(packageName: string, version: string): Promise<ValidationProblem[]> {
    const versionRef = getPackageVersionRef(packageName, version);
    const problemsRef = versionRef
      .collection('problems')
      .withConverter(validationProblemConverter);
    const result = await problemsRef.get();
    return result.docs.map((d) => d.data());
  }

  /**
   * Gets the PackageInfo for a package, excluding package versions.
   *
   * TODO: Currently only works for packages with a status of READY
   */
  async getPackageInfo(packageName: string): Promise<PackageInfo | undefined> {
    const packageDocId = getPackageDocId(packageName);
    // console.log('packageInfo', packageName, packageDocId);
    const packageRef = db.collection('packages').doc(packageDocId);
    const packageDoc = await packageRef
      .withConverter(packageInfoConverter)
      .get();
    if (packageDoc.exists) {
      const packageInfo = packageDoc.data()!;
      const status = packageInfo.status;
      switch (status) {
        case PackageStatus.READY: {
          return packageInfo;
        }
        case PackageStatus.INITIALIZING:
        case PackageStatus.INVALID:
        case PackageStatus.NOT_FOUND:
        case PackageStatus.ERROR:
        case PackageStatus.UPDATING: {
          throw new Error(`Unhandled package status ${status}`);
        }
        default:
          // exhaustiveness check
          status as void;
      }
      throw new Error(`Unhandled package status  ${status}`);
    } else {
      return undefined;
    }
  }

  /**
   * Gets a PackageVersion object from the database, not including all the
   * custom elements exported by the package.
   */
  async getPackageVersion(
    packageName: string,
    version: string
  ): Promise<PackageVersion | undefined> {
    const packageDocId = getPackageDocId(packageName);
    const packageRef = db
      .collection('packages')
      .doc(packageDocId) as DocumentReference<PackageInfoData>;
    const versionRef = packageRef.collection('versions').doc(version);
    const versionDoc = await versionRef
      .withConverter(packageVersionConverter)
      .get();
    return versionDoc.data();
  }

  async getCustomElements(
    packageName: string,
    version: string,
    tagName?: string
  ): Promise<CustomElement[]> {
    const packageDocId = getPackageDocId(packageName);
    const packageRef = db
      .collection('packages')
      .doc(packageDocId) as DocumentReference<PackageInfoData>;
    const versionRef = packageRef.collection('versions').doc(version);
    const customElementsRef = versionRef.collection('customElements');
    let customElementsQuery:
      | CollectionReference<CustomElement>
      | Query<CustomElement> = customElementsRef.withConverter(
      customElementConverter
    );
    if (tagName !== undefined) {
      customElementsQuery = customElementsQuery.where('tagName', '==', tagName);
    }
    const customElementsResults = await customElementsQuery.get();
    return customElementsResults.docs.map((d) => d.data());
  }
}

/**
 * Returns a Firestore document ID based on the package name.
 */
const getPackageDocId = (packageName: string) =>
  packageName.replaceAll('/', '__');

const getPackageVersionRef = (packageName: string, version: string) => {
  const packageDocId = getPackageDocId(packageName);
  const packageRef = db.collection('packages').doc(packageDocId);
  return packageRef.collection('versions').doc(version);
};

/**
 * Generates a type representing a Firestore document from a GraphQL schema
 * type.
 *
 *  - Removes __typename
 *  - Date -> Timestamp
 *  - Removes specified collection fields
 *  - Transforms list of tuples to maps
 */
type FirestoreType<
  SchemaType,
  MapFields extends {[k: string]: string},
  Collections extends string
> = {
  [K in keyof SchemaType]: K extends '__typename'
    ? never
    : K extends Date
    ? Timestamp
    : K extends keyof MapFields
    ? {
        [key: string]: MapFields[K] extends string
          ? SchemaType[K] extends ReadonlyArray<infer T>
            ? Omit<T, MapFields[K]>
            : never
          : MapFields[K];
      }
    : K extends Collections
    ? never
    : SchemaType[K];
};

/**
 * Firestore DocumentData for PackageInfo documents.
 */
type PackageInfoData = FirestoreType<
  PackageInfo,
  {distTags: string},
  'version'
>;
