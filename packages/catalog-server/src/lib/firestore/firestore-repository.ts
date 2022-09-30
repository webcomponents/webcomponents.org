/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  FieldValue,
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
  ValidationProblem,
  ReadablePackageVersion,
  ReadablePackageInfo,
} from '@webcomponents/catalog-api/lib/schema.js';
import {Package} from '@webcomponents/custom-elements-manifest-tools/lib/npm.js';
import {Repository} from '../repository.js';
import {
  packageInfoConverter,
  packageNameToId,
} from './package-info-converter.js';
import {packageVersionConverter} from './package-version-converter.js';
import {customElementConverter} from './custom-element-converter.js';
import {validationProblemConverter} from './validation-problem-converter.js';

const projectId = 'wc-catalog';
firebase.initializeApp({projectId});
export const db = new Firestore({projectId});

export class FirestoreRepository implements Repository {
  /**
   * A namespace suffix to apply to the 'packages' collection to support
   * multi-tenant-like separation of the database. Used for testing.
   */
  private readonly namespace?: string;

  constructor(namespace?: string) {
    this.namespace = namespace;
  }

  async startPackageImport(packageName: string): Promise<void> {
    const packageRef = this.getPackageRef(packageName);
    await packageRef.create({
      name: packageName,
      status: PackageStatus.INITIALIZING,
      lastUpdate: FieldValue.serverTimestamp(),
    });
  }

  async startPackageUpdate(packageName: string): Promise<void> {
    const packageRef = this.getPackageRef(packageName);
    await packageRef.update({
      status: PackageStatus.UPDATING,
      lastUpdate: FieldValue.serverTimestamp(),
    });
  }

  async endPackageImportWithReady(
    packageName: string,
    packageInfo: ReadablePackageInfo
  ): Promise<void> {
    const packageRef = this.getPackageRef(packageName);
    await db.runTransaction(async (t) => {
      const packageDoc = await t.get(packageRef);
      const packageData = packageDoc.data();
      if (packageData === undefined) {
        throw new Error(`Package not found: ${packageName}`);
      }
      if (
        packageData.status !== PackageStatus.INITIALIZING &&
        packageData.status !== PackageStatus.UPDATING
      ) {
        throw new Error(`Unexpected package status: ${packageData.status}`);
      }
      await t.update(packageRef, {
        status: PackageStatus.READY,
        lastUpdate: FieldValue.serverTimestamp(),
        description: packageInfo.description,
        distTags: packageInfo.distTags,
      });
    });
  }

  async endPackageImportWithNotFound(packageName: string): Promise<void> {
    const packageRef = this.getPackageRef(packageName);
    await db.runTransaction(async (t) => {
      const packageDoc = await t.get(packageRef);
      const packageData = packageDoc.data();
      if (packageData === undefined) {
        throw new Error(`Package not found: ${packageName}`);
      }
      if (packageData.status !== PackageStatus.INITIALIZING) {
        throw new Error(`Unexpected package status: ${packageData.status}`);
      }
      await t.set(packageRef, {
        name: packageName,
        status: PackageStatus.NOT_FOUND,
        lastUpdate: FieldValue.serverTimestamp(),
      });
    });
  }

  async endPackageImportWithError(packageName: string): Promise<void> {
    const packageRef = this.getPackageRef(packageName);
    await db.runTransaction(async (t) => {
      const packageDoc = await t.get(packageRef);
      const packageData = packageDoc.data();
      if (packageData === undefined) {
        throw new Error(`Package not found: ${packageName}`);
      }
      if (packageData.status !== PackageStatus.INITIALIZING) {
        throw new Error(`Unexpected package status: ${packageData.status}`);
      }
      await t.set(packageRef, {
        name: packageName,
        status: PackageStatus.ERROR,
        lastUpdate: FieldValue.serverTimestamp(),
      });
    });
  }

  /**
   * Update the dist-tags for `versionsToUpdate` and all the elements they
   * contain in a single transaction.
   */
  async updateDistTags(
    packageName: string,
    versionsToUpdate: Array<string>,
    newDistTags: {[tag: string]: string}
  ): Promise<void> {
    await db.runTransaction(async (t) => {
      await Promise.all(
        versionsToUpdate.map(async (version) => {
          const versionDistTags = getDistTagsForVersion(newDistTags, version);
          const versionRef = this.getPackageVersionRef(packageName, version);

          // Updat the PackageVersion doc
          await t.update(versionRef, {
            distTags: versionDistTags,
          });

          // Update all custom elements of the PackageVersion
          const customElementsRef = versionRef
            .collection('customElements')
            .withConverter(customElementConverter);
          // TODO: can we structure this for less data transfer by using a
          // fieldMask or update() without a get()? We would have to use store
          // the list of custom elements with the packageVersion object so that
          // we can construct custom element refs without a query on the
          // collection first.
          const elements = await t.get(customElementsRef);
          await Promise.all(
            elements.docs.map(async (element) => {
              await t.update(element.ref, {
                distTags: versionDistTags,
              });
            })
          );
        })
      );
    });
  }

  async startPackageVersionImport(
    packageName: string,
    version: string
  ): Promise<void> {
    // TODO: verify that the package exists. Or does Firestore already do that
    // with subcollections?
    const versionRef = this.getPackageVersionRef(packageName, version);
    // Since create() fails if the document exists, we don't need a transaction
    await versionRef.create({
      version,
      status: VersionStatus.INITIALIZING,
      lastUpdate: FieldValue.serverTimestamp(),
    });
  }

  async endPackageVersionImportWithReady(
    packageName: string,
    version: string,
    packageMetadata: Package,
    customElementsManifestSource: string | undefined
  ): Promise<ReadablePackageVersion> {
    const packageVersionMetadata = packageMetadata.versions[version]!;
    const versionRef = this.getPackageVersionRef(packageName, version);

    await db.runTransaction(async (t) => {
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
      // TODO: make converter handle denormalized data
      console.log('Writing to DB A');
      t.set(versionRef, {
        name: packageName,
        version,
        status: VersionStatus.READY,
        lastUpdate: FieldValue.serverTimestamp(),
        description: packageVersionMetadata.description ?? '',
        type: packageType,
        distTags: versionDistTags,
        author,
        time: new Date(packageTime),
        homepage: packageVersionMetadata.homepage ?? null,
        customElementsManifest: customElementsManifestSource ?? null,
      });
      console.log('  Wrote to DB A');
    });
    const packageVersion = await db.runTransaction(async (t) => {
      // There doesn't seem to be a way to get a WriteResult and therefore
      // a writeTime inside a transaction, so we read from the database to
      // get the server timestamp.
      return (await t.get(versionRef)).data() as ReadablePackageVersion;
    });
    return packageVersion;
  }

  async endPackageVersionImportWithError(
    packageName: string,
    version: string
  ): Promise<void> {
    await db.runTransaction(async (t) => {
      const versionRef = this.getPackageVersionRef(packageName, version);
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
    const versionRef = this.getPackageVersionRef(packageName, version);
    const customElementsRef = versionRef.collection('customElements');
    const batch = db.batch();

    for (const c of customElements) {
      batch.create(customElementsRef.doc(), {
        package: packageName,
        version,
        distTags,
        author,
        tagName: c.export.name,
        className: c.declaration.name,
        customElementExport: referenceString(
          packageName,
          c.module,
          c.export.name
        ),
        declaration: referenceString(packageName, c.module, c.declaration.name),
      });
    }

    await batch.commit();
  }

  async writeProblems(
    packageName: string,
    version: string,
    problems: Array<ValidationProblem>
  ): Promise<void> {
    const versionRef = this.getPackageVersionRef(packageName, version);
    const problemsRef = versionRef
      .collection('problems')
      .withConverter(validationProblemConverter);
    const batch = db.batch();
    for (const problem of problems) {
      batch.create(problemsRef.doc(), problem);
    }
    await batch.commit();
  }

  async getProblems(
    packageName: string,
    version: string
  ): Promise<ValidationProblem[]> {
    const versionRef = this.getPackageVersionRef(packageName, version);
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
    const packageDoc = await this.getPackageRef(packageName).get();
    if (packageDoc.exists) {
      // eslint-disable-next-line
      const packageInfo = packageDoc.data()!;
      const status = packageInfo.status;
      switch (status) {
        // These statuses are the "readable" status: they indicate that
        // the package has been successfully imported.
        case PackageStatus.READY:
        case PackageStatus.UPDATING: {
          return packageInfo as ReadablePackageInfo;
        }
        // These three statuses are "unreadable": they indicate that the
        // package has failed to import.
        case PackageStatus.INITIALIZING:
        case PackageStatus.NOT_FOUND:
        case PackageStatus.ERROR: {
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
  ): Promise<Omit<PackageVersion, 'customElements' | 'problems'> | undefined> {
    console.log(
      'FirestoreRepository.getPackageVersion',
      packageName,
      version,
    );
    if (/^\d/.test(version)) {
      // If `version` starts with a digit, it's a version number and we can build a ref
      const versionRef = this.getPackageVersionRef(packageName, version);
      const versionDoc = await versionRef.get();
      return versionDoc.data();
    } else {
      // If `version` doesn't start with a digit, it's a dist-tag and we need to query
      const result = await this.getPackageVersionCollectionRef(packageName)
        .where('distTags', 'array-contains', version)
        .limit(1)
        .get();
      if (result.size !== 0) {
        return result.docs[0]!.data();
      }
      return undefined;
    }
  }

  async getCustomElements(
    packageName: string,
    version: string,
    tagName?: string
  ): Promise<CustomElement[]> {
    const versionRef = this.getPackageVersionRef(packageName, version);
    const customElementsRef = versionRef
      .collection('customElements')
      .withConverter(customElementConverter);
    let customElementsQuery:
      | CollectionReference<CustomElement>
      | Query<CustomElement> = customElementsRef;
    if (tagName !== undefined) {
      customElementsQuery = customElementsQuery.where('tagName', '==', tagName);
    }
    const customElementsResults = await customElementsQuery.get();
    return customElementsResults.docs.map((d) => d.data());
  }

  getPackageRef(packageName: string) {
    return db
      .collection('packages' + (this.namespace ? `-${this.namespace}` : ''))
      .doc(packageNameToId(packageName))
      .withConverter(packageInfoConverter);
  }

  getPackageVersionCollectionRef(packageName: string) {
    return this.getPackageRef(packageName)
      .collection('versions')
      .withConverter(packageVersionConverter);
  }

  getPackageVersionRef(packageName: string, version: string) {
    return this.getPackageVersionCollectionRef(packageName).doc(version);
  }
}

// /**
//  * Generates a type representing a Firestore document from a GraphQL schema
//  * type.
//  *
//  *  - Removes __typename
//  *  - Date -> Timestamp
//  *  - Removes specified collection fields
//  *  - Transforms list of tuples to maps
//  */
// type FirestoreType<
//   SchemaType,
//   MapFields extends {[k: string]: string},
//   Collections extends string
// > = {
//   [K in keyof SchemaType]: K extends '__typename'
//     ? never
//     : K extends Date
//     ? Timestamp
//     : K extends keyof MapFields
//     ? {
//         [key: string]: MapFields[K] extends string
//           ? SchemaType[K] extends ReadonlyArray<infer T>
//             ? Omit<T, MapFields[K]>
//             : never
//           : MapFields[K];
//       }
//     : K extends Collections
//     ? never
//     : SchemaType[K];
// };

// /**
//  * Firestore DocumentData for PackageInfo documents.
//  */
// type PackageInfoData = FirestoreType<
//   PackageInfo,
//   {distTags: string},
//   'version'
// >;
