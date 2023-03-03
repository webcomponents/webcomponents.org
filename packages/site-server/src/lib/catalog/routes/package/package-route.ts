/**
 * @license
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// This must be imported before lit
import {renderPage} from '@webcomponents/internal-site-templates/lib/base.js';

import {DefaultContext, DefaultState, ParameterizedContext} from 'koa';
import {Readable} from 'stream';
import {gql} from '@apollo/client/core/index.js';
import Router from '@koa/router';

import {renderPackagePage} from '@webcomponents/internal-site-client/lib/pages/package/shell.js';
import {client} from '../../graphql.js';
import {PackageData} from '@webcomponents/internal-site-client/lib/pages/package/wco-package-page.js';
import {marked} from 'marked';

export const handlePackageRoute = async (
  context: ParameterizedContext<
    DefaultState,
    DefaultContext & Router.RouterParamContext<DefaultState, DefaultContext>,
    unknown
  >
) => {
  const {params} = context;

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const packageName = params['name']!;

  // TODO (justinfagnani): To make this type-safe, we need to write
  // a query .graphql document and generate a TypedDocumentNode from it.
  const result = await client.query({
    query: gql`{
      package(packageName: "${packageName}") {
        ... on ReadablePackageInfo {
          name
          description
          version {
            ... on ReadablePackageVersion {
              version
              description
              customElements {
                tagName
                package
                declaration
                customElementExport
                declaration
              }
            }
          }
        }
      }
    }`,
  });

  if (result.errors !== undefined && result.errors.length > 0) {
    throw new Error(result.errors.map((e) => e.message).join('\n'));
  }
  const {data} = result;
  const packageVersion = data.package?.version;
  if (packageVersion === undefined) {
    throw new Error(`No such package version: ${packageName}`);
  }

  // Set location because wco-nav-bar reads pathname from it. URL isn't
  // exactly a Location, but it's close enough for read-only uses
  globalThis.location = new URL(context.URL.href) as unknown as Location;

  const responseData: PackageData = {
    name: packageName,
    description: marked(data.package.description ?? ''),
    version: packageVersion.version,
    elements: packageVersion.customElements,
  };

  context.type = 'html';
  context.status = 200;
  context.body = Readable.from(
    renderPage(
      {
        title: `${packageName}`,
        initScript: '/js/package/boot.js',
        content: renderPackagePage(responseData),
        initialData: [responseData],
      },
      {
        // We need to defer elements from hydrating so that we can
        // manually provide data to the element in element-hydrate.js
        deferHydration: true,
      }
    )
  );
};
