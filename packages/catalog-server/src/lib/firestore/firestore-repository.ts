/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  brotliCompress as brotliCompressCallbackStyle,
  brotliDecompress as brotliDecompressCallbackStyle,
} from 'node:zlib';
import {promisify} from 'node:util';
import {
  FieldValue,
  Query,
  CollectionReference,
  CollectionGroup,
  UpdateData,
} from '@google-cloud/firestore';
import {Firestore} from '@google-cloud/firestore';
import firebase from 'firebase-admin';
import {CustomElementInfo} from '@webcomponents/custom-elements-manifest-tools';
import {referenceString} from '@webcomponents/custom-elements-manifest-tools/lib/reference-string.js';
import clean from 'semver/functions/clean.js';
import semverValidRange from 'semver/ranges/valid.js';
import natural from 'natural';

import {distTagListToMap, getDistTagsForVersion} from '../npm.js';

import {
  CustomElement,
  PackageInfo,
  PackageStatus,
  PackageVersion,
  VersionStatus,
  ValidationProblem,
  ReadablePackageVersion,
  ReadablePackageInfo,
  UnreadablePackageStatus,
  UnreadablePackageVersion,
} from '@webcomponents/catalog-api/lib/schema.js';
import {
  Package,
  Version,
} from '@webcomponents/custom-elements-manifest-tools/lib/npm.js';
import {Repository} from '../repository.js';
import {
  packageInfoConverter,
  packageNameToId,
} from './package-info-converter.js';
import {
  CompressedPackageVersion,
  isReadableCompressedPackageVersion,
  packageVersionConverter,
  ReadableCompressedPackageVersion,
} from './package-version-converter.js';
import {customElementConverter} from './custom-element-converter.js';
import {validationProblemConverter} from './validation-problem-converter.js';

const projectId = process.env['GCP_PROJECT_ID'] || 'wc-catalog';
firebase.initializeApp({projectId});
export const db = new Firestore({projectId});

const brotliCompress = promisify(brotliCompressCallbackStyle);
const brotliDecompress = promisify(brotliDecompressCallbackStyle);

export class FirestoreRepository implements Repository {
  /**
   * A namespace suffix to apply to the 'packages' collection to support
   * multi-tenant-like separation of the database. Used for testing.
   */
  private readonly namespace: string | null;

  constructor(namespace?: string) {
    this.namespace = namespace ?? null;
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
      // Note: update() does not use the Firestore data converters, so
      // specific field conversion, like dist tags, must be done here.
      // We remove the converter to fix the types:
      // https://github.com/googleapis/nodejs-firestore/issues/1745
      await t.update(packageRef.withConverter(null), {
        status: PackageStatus.READY,
        lastUpdate: FieldValue.serverTimestamp(),
        description: packageInfo.description ?? '',
        distTags: distTagListToMap(packageInfo.distTags),
      });
    });
  }

  async endPackageImportWithError(
    packageName: string,
    status: UnreadablePackageStatus
  ): Promise<PackageInfo> {
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
      t.set(packageRef, {
        name: packageName,
        status,
        lastUpdate: FieldValue.serverTimestamp(),
      });
    });
    const packageInfo = await db.runTransaction(async (t) => {
      // There doesn't seem to be a way to get a WriteResult and therefore
      // a writeTime inside a transaction, so we read from the database to
      // get the server timestamp.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return (await t.get(packageRef)).data()!;
    });
    return packageInfo;
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

          const isLatest = versionDistTags.includes('latest');

          // Update the PackageVersion doc
          // We remove the converter to fix the types:
          // https://github.com/googleapis/nodejs-firestore/issues/1745
          await t.update(versionRef.withConverter(null), {
            distTags: versionDistTags,
            isLatest,
          });

          // Update all elements
          await Promise.all(
            elements.docs.map(async (element) => {
              await t.update(element.ref.withConverter(null), {
                distTags: versionDistTags,
                isLatest,
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

      const compressedManifest =
        customElementsManifestSource &&
        (await brotliCompress(customElementsManifestSource)).toString('base64');

      // Store package data and mark version as ready
      t.set(versionRef, {
        __typename: 'ReadableCompressedPackageVersion',
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
        customElementsManifestCompressed: compressedManifest,
      });
    });
    const packageVersion = await db.runTransaction(async (t) => {
      // There doesn't seem to be a way to get a WriteResult and therefore
      // a writeTime inside a transaction, so we read from the database to
      // get the server timestamp.
      const packageVersionCompressed = (await t.get(versionRef)).data()!;
      if (isReadableCompressedPackageVersion(packageVersionCompressed)) {
        return decompressPackageVersion(
          packageVersionCompressed,
          versionRef.id
        );
      }
      throw new Error(
        `Internal error: expected package version ${versionRef.id} to be readable`
      );
    });
    return packageVersion;
  }

  async endPackageVersionImportWithError(
    packageName: string,
    version: string,
    status: VersionStatus
  ): Promise<PackageVersion> {
    const versionRef = this.getPackageVersionRef(packageName, version);
    await db.runTransaction(async (t) => {
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
      // TODO (justinfagnani): figure out why we need the cast, since
      // UpdateData<T> should allow a Partial<T>
      t.update(versionRef, {
        status,
        lastUpdate: FieldValue.serverTimestamp(),
      } as UpdateData<UnreadablePackageVersion> as UnreadablePackageVersion);
    });
    const packageVersion = await db.runTransaction(async (t) => {
      // There doesn't seem to be a way to get a WriteResult and therefore
      // a writeTime inside a transaction, so we read from the database to
      // get the server timestamp.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return (await t.get(versionRef)).data() as UnreadablePackageVersion;
    });
    return packageVersion;
  }

  async writeCustomElements(
    {name: packageName, version, description}: Version,
    customElements: CustomElementInfo[],
    distTags: string[],
    author: string
  ): Promise<void> {
    // Store custom elements data in subcollection
    const versionRef = this.getPackageVersionRef(packageName, version);
    const customElementsRef = versionRef.collection('customElements');
    const isLatest = distTags.includes('latest');
    const batch = db.batch();

    // Stem the package description
    const packageDescriptionStems = natural.PorterStemmer.tokenizeAndStem(
      description ?? ''
    );

    for (const c of customElements) {
      const tagName = c.export.name;
      // Grab longer tag name parts for searching. We want "button" from
      // md-button, etc.
      const tagNameParts = tagName.split('-').filter((s) => s.length > 3);
      const descriptionStems = natural.PorterStemmer.tokenizeAndStem(
        c.declaration.description ?? ''
      );
      const summaryStems = natural.PorterStemmer.tokenizeAndStem(
        c.declaration.summary ?? ''
      );

      // Combine and deduplicate terms
      const searchTerms = [
        ...new Set([
          ...packageDescriptionStems,
          ...descriptionStems,
          ...summaryStems,
          ...tagNameParts,
          tagName,
          // TODO (justinfagnani): tokenizing the package name is temporary
          // until we don't tokenize the *entire* query
          ...natural.PorterStemmer.tokenizeAndStem(packageName),
        ]),
      ];

      batch.create(customElementsRef.doc(), {
        namespace: this.namespace,
        package: packageName,
        version,
        distTags,
        isLatest,
        author,
        tagName,
        className: c.declaration.name,
        customElementExport: referenceString(
          packageName,
          c.module.path,
          c.export.name
        ),
        declaration: referenceString(
          packageName,
          c.declarationReference.module ?? c.module.path,
          c.declaration.name
        ),
        searchTerms,
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
    versionOrTag: string
  ): Promise<PackageVersion | undefined> {
    const versionNumber = clean(versionOrTag);

    if (versionNumber !== null) {
      // If version is valid semver we can build a document reference.
      const versionRef = this.getPackageVersionRef(packageName, versionNumber);
      const versionDoc = await versionRef.get();
      const packageVersion = versionDoc.data();
      if (
        packageVersion &&
        isReadableCompressedPackageVersion(packageVersion)
      ) {
        return decompressPackageVersion(packageVersion, versionRef.id);
      }
      return packageVersion;
    } else {
      // If version is not a valid semver it may be a dist-tag

      // First, filter out semver ranges, since npm doesn't allow semver
      // ranges to be dist tags
      if (semverValidRange(versionOrTag)) {
        return undefined;
      }

      // Now query for a version that's assigned this dist-tag
      let query:
        | CollectionReference<CompressedPackageVersion>
        | Query<CompressedPackageVersion> =
        this.getPackageVersionCollectionRef(packageName);
      if (versionOrTag === 'latest') {
        query = query.where('isLatest', '==', true);
      } else {
        query = query.where('distTags', 'array-contains', versionOrTag);
      }
      const result = await query.limit(1).get();
      if (result.size !== 0) {
        const doc = result.docs[0]!;
        const packageVersion = doc.data();
        // Decompress the custom elements manifest.
        // Note: We'd like to do this in the packageVersionConverter Firestore
        // converter so that we don't have to remember to compress/decompress
        // at every read and write operation, but we can't because we also want
        // this to be an async operation and not block the main thread.
        if (isReadableCompressedPackageVersion(packageVersion)) {
          return decompressPackageVersion(packageVersion, doc.id);
        }
      }
      return undefined;
    }
  }

  async getCustomElements(
    packageName: string,
    versionOrTag: string,
    tagName?: string
  ): Promise<CustomElement[]> {
    const versionNumber = clean(versionOrTag);

    let version: string;

    if (versionNumber === null) {
      // If version is not a valid semver, we look up a document to get the
      // dist tag. This is temporary until we add a
      // collectionGroup('collections') query with a distTag condition
      const packageVersion = await this.getPackageVersion(
        packageName,
        versionOrTag
      );
      if (packageVersion === undefined) {
        return [];
      }
      version = packageVersion.version;
    } else {
      version = versionOrTag;
    }

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

  async queryElements({
    query,
    limit,
  }: {
    query?: string;
    limit?: number;
  }): Promise<Array<CustomElement>> {
    let dbQuery: Query<CustomElement> | CollectionGroup<CustomElement> = db
      .collectionGroup('customElements')
      .withConverter(customElementConverter)
      .where('isLatest', '==', true)
      .where('namespace', '==', this.namespace)
      .limit(limit ?? 25);

    if (query !== undefined) {
      // Split query
      const queryTerms = natural.PorterStemmer.tokenizeAndStem(query);
      if (queryTerms.length > 10) {
        queryTerms.length = 10;
      }
      dbQuery = dbQuery.where('searchTerms', 'array-contains-any', queryTerms);
    }

    const result = await (await dbQuery.get()).docs.map((d) => d.data());
    return result;
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

export const decompressPackageVersion = async (
  packageVersion: ReadableCompressedPackageVersion,
  id: string
): Promise<ReadablePackageVersion> => {
  const manifestCompressed = packageVersion.customElementsManifestCompressed;
  try {
    const customElementsManifest =
      manifestCompressed &&
      (
        await brotliDecompress(Buffer.from(manifestCompressed, 'base64'))
      ).toString();
    return {
      ...packageVersion,
      __typename: undefined,
      customElementsManifest,
    };
  } catch (e) {
    console.error(`Filed to decompress manifest for package version ${id}`);
    throw e;
  }
};

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
