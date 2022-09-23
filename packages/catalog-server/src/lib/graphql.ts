/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {readFile} from 'fs/promises';
import {createRequire} from 'module';
import {makeExecutableSchema} from '@graphql-tools/schema';
import {isReadablePackage, Resolvers} from '@webcomponents/catalog-api/lib/schema.js';
import {Catalog} from './catalog.js';

const require = createRequire(import.meta.url);

export const makeExecutableCatalogSchema = async (catalog: Catalog) => {
  const schemaPath = require.resolve(
    '@webcomponents/registry-api/src/lib/schema.graphql'
  );
  const schemaSource = await readFile(schemaPath, 'utf8');

  const resolvers: Resolvers = {
    Query: {
      async package(_parent, {packageName}: {packageName: string}) {
        console.log('query package', packageName);
        const packageInfo = await catalog.getPackageInfo(packageName);
        if (packageInfo === undefined) {
          console.log(`package ${packageName} not found in db`);
          const result = await catalog.importPackage(packageName);
          if (isReadablePackage(result)) {
            return packageInfo;
          } else {
            return undefined;
          }
        } else if (isReadablePackage(packageInfo)) {
          return packageInfo;
        } else {
          return undefined;
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
          distTags.find((distTag) => distTag.tag === versionOrTag)?.version ??
          versionOrTag;

        const packageVersion = await getPackageVersion(packageInfo.name, version);
        if (packageVersion === undefined) {
          throw new Error(`tag ${packageInfo.name}@${versionOrTag} not found`);
        }
        return packageVersion;
      },
    },
    ReadablePackageVersion: {
      customElements: async (
        packageVersion,
        {tagName}: {tagName?: string | null},
        context,
        _info
      ) => {
        const packageName = context.packageName;
        return catalog.getCustomElements(
          packageName,
          packageVersion.version,
          tagName ?? undefined
        );
      },
    },
    Mutation: {
      async importPackage(_parent, {packageName}: {packageName: string}) {
        console.log('mutation deletePackage', packageName);
        const packageInfo = await catalog.importPackage(packageName);
        return packageInfo;
      },
    },
  };

  const schema = makeExecutableSchema({
    typeDefs: schemaSource,
    resolvers,
  });
  return schema;
};
