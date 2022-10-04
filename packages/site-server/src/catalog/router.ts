/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import Router from '@koa/router';
import {ApolloClient, InMemoryCache, gql} from '@apollo/client/core/index.js';
import {renderElement} from './element-template.js';

const CATALOG_PORT = process.env['CATALOG_PORT']
  ? parseInt(process.env['CATALOG_PORT'])
  : 8100;

const client = new ApolloClient({
  uri: `http://localhost:${CATALOG_PORT}/graphql`,
  cache: new InMemoryCache(),
});

export const catalogRouter = new Router();

catalogRouter.get('/element/:path+', async (context) => {
  const {params} = context;

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const elementPath = params['path']!;
  const elementPathSegments = elementPath.split('/');
  const isScoped = elementPathSegments[0]?.startsWith('@');
  const packageName = isScoped
    ? elementPathSegments[0] + '/' + elementPathSegments[1]
    : elementPathSegments[0]!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const elementName = elementPathSegments[isScoped ? 2 : 1]!;

  // TODO (justinfagnani): To make this type-safe, we need to write
  // a query .graphql document and generate a TypedDocumentNode from it.
  const result = await client.query({
    query: gql`
      {
        package(packageName: "${packageName}") {
          ... on ReadablePackageInfo {
            name
            description
            version {
              ... on ReadablePackageVersion {
                version
                description
                customElements(tagName: "${elementName}") {
                  tagName
                  declaration
                  customElementExport
                  declaration
                }
                customElementsManifest
              }
            }
          }
        }
      }
    `,
  });

  if (result.errors !== undefined && result.errors.length > 0) {
    throw new Error(result.errors.map((e) => e.message).join('\n'));
  }
  const {data} = result;
  const packageVersion = data.package?.version;
  if (packageVersion === undefined) {
    throw new Error(`No such package version: ${packageName}`);
  }
  const customElementsManifest =
    packageVersion.customElementsManifest !== undefined &&
    JSON.parse(packageVersion.customElementsManifest);

  const customElement = packageVersion.customElements?.[0];

  if (customElement === undefined || customElement.tagName !== elementName) {
    throw new Error('Internal error');
  }

  const content = renderElement({
    packageName: packageName,
    elementName: elementName,
    declarationReference: customElement.declaration,
    customElementExport: customElement.export,
    manifest: customElementsManifest,
  });

  context.body = content;
  context.type = 'html';
  context.status = 200;
});
