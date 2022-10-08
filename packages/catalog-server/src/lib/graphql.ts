/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {readFile} from 'fs/promises';
import {createRequire} from 'module';
import {makeExecutableSchema} from '@graphql-tools/schema';
import {
  CustomElement,
  isReadablePackage,
  isReadablePackageVersion,
  PackageInfo,
  Resolvers,
} from '@webcomponents/catalog-api/lib/schema.js';
import {Catalog} from './catalog.js';

const require = createRequire(import.meta.url);

/**
 * Creates a GraphQLSchema object with resolvers
 */
export const makeExecutableCatalogSchema = async (catalog: Catalog) => {
  const schemaPath = require.resolve(
    '@webcomponents/catalog-api/src/lib/schema.graphql'
  );
  const schemaSource = await readFile(schemaPath, 'utf8');

  // Resolvers for our schema. See https://graphql.org/learn/execution/ for
  // an explanation of the role of resolvers in performing GraphQL queries.
  const resolvers: Resolvers = {
    Query: {
      async package(
        _parent,
        {packageName}: {packageName: string}
      ): Promise<PackageInfo | null> {
        console.log('query package', packageName);
        const packageInfo = await catalog.getPackageInfo(packageName);
        if (packageInfo === undefined) {
          console.log(`package ${packageName} not found in db, importing`);
          let result;
          try {
            result = await catalog.importPackage(packageName);
          } catch (e) {
            console.error(e);
            throw e;
          }
          const {packageInfo} = result;
          if (isReadablePackage(packageInfo)) {
            console.log(`package ${packageName} is readable`);
            return packageInfo;
          } else {
            console.log(`package ${packageName} is not readable`);
            return null;
          }
        } else if (isReadablePackage(packageInfo)) {
          console.log(`package ${packageName} found in db and readable`);
          return packageInfo;
        } else {
          console.log(`package ${packageName} found in db and not readable`);
          return null;
        }
      },
      async elements(_parent, {query, limit}): Promise<Array<CustomElement>> {
        console.log('query elements', {query, limit});
        return catalog.queryElements({
          query: query ?? undefined,
          limit: limit ?? 25,
        });
      },
    },
    PackageInfo: {
      __resolveType(obj) {
        if (isReadablePackage(obj)) {
          return 'ReadablePackageInfo';
        } else {
          return 'UnreadablePackageInfo';
        }
      },
    },
    ReadablePackageInfo: {
      version: async (packageInfo, {versionOrTag}, context, _info) => {
        // TODO(justinfagnani): strongly type context?
        context.packageName = packageInfo.name;
        console.log('PackageInfo version', packageInfo.name, versionOrTag);

        // Check to see if versionOrTag is a distTag
        const distTags = packageInfo.distTags;
        const version =
          distTags?.find((distTag) => distTag.tag === versionOrTag)?.version ??
          versionOrTag;

        const packageVersion = await catalog.getPackageVersion(
          packageInfo.name,
          version
        );
        if (packageVersion === undefined) {
          throw new Error(`tag ${packageInfo.name}@${versionOrTag} not found`);
        }
        return packageVersion;
      },
    },
    PackageVersion: {
      __resolveType(obj) {
        if (isReadablePackageVersion(obj)) {
          return 'ReadablePackageVersion';
        } else {
          return 'UnreadablePackageVersion';
        }
      },
    },
    ReadablePackageVersion: {
      customElements: async (
        packageVersion,
        {tagName}: {tagName?: string | null},
        context,
        _info
      ) => {
        // TODO (justinfagnani): we should get the package name from the
        // PackageVersion object:
        // const packageName = packageVersion.name;
        const packageName = context.packageName;
        const version = packageVersion.version;
        return catalog.getCustomElements(
          packageName,
          version,
          tagName ?? undefined
        );
      },
    },
    Mutation: {
      async importPackage(_parent, {packageName}: {packageName: string}) {
        console.log('mutation importPackage', packageName);
        // This mutation would be for an explicit call to import a package,
        // rather than importing on-demand like in Query.package
        const {packageInfo} = await catalog.importPackage(packageName);
        return packageInfo ?? null;
      },
    },
  };

  // See https://www.graphql-tools.com/docs/generate-schema
  const schema = makeExecutableSchema({
    typeDefs: schemaSource,
    resolvers,
  });
  return schema;
};
