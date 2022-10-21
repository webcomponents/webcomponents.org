/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {DefaultContext, DefaultState, ParameterizedContext} from 'koa';
import {Readable} from 'stream';
import {gql} from '@apollo/client/core/index.js';
import Router from '@koa/router';
import {render} from '@lit-labs/ssr/lib/render-with-global-dom-shim.js';
import '@webcomponents/internal-site-client/lib/entrypoints/element.js';

import {renderPage} from '../../../templates/base.js';
import {client} from '../../graphql.js';
import {renderElement} from './element-template.js';

export const handleElementRoute = async (
  context: ParameterizedContext<
    DefaultState,
    DefaultContext & Router.RouterParamContext<DefaultState, DefaultContext>,
    unknown
  >
) => {
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

  context.body = Readable.from(renderPage({
    title: `${packageName}/${elementName}`,
    scripts: [
      '/js/element.js'
    ],
    content: render(
      renderElement({
        packageName: packageName,
        elementName: elementName,
        declarationReference: customElement.declaration,
        customElementExport: customElement.export,
        manifest: customElementsManifest,
      })
    ),
  }));
  context.type = 'html';
  context.status = 200;
};
