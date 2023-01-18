/**
 * @license
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {DefaultContext, DefaultState, ParameterizedContext} from 'koa';
import Router from '@koa/router';
import {client} from '../graphql.js';
import {gql} from '@apollo/client/core/index.js';

const importMutation = gql`
  mutation ImportPackage($packageName: String!) {
    importPackage(packageName: $packageName) {
      ... on ReadablePackageInfo {
        version {
          ... on ReadablePackageVersion {
            version
            problems {
              code
              severity
              message
              filePath
            }
            customElements {
              tagName
              declaration
              className
              jsExport
            }
          }
          ... on UnreadablePackageVersion {
            version
            status
            problems {
              code
              severity
              message
              filePath
            }
          }
        }
      }
    }
  }
`;

export const handleCatalogImportApiRoute = async (
  context: ParameterizedContext<
    DefaultState,
    DefaultContext & Router.RouterParamContext<DefaultState, DefaultContext>,
    unknown
  >
) => {
  console.log('context.request.body', context.request.body);
  const packageName = (context.request.body as Record<string, string>)[
    'packageName'
  ];
  context.type = 'json';

  if (typeof packageName !== 'string') {
    context.status = 400;
    context.body = {
      message: 'Body parmeter `packageName` must be a string',
    };
    return;
  }

  const result = await client.mutate({
    mutation: importMutation,
    variables: {packageName},
  });

  if (result.errors) {
    context.status = 500;
    context.body = {
      message: result.errors,
    };
    return;
  }

  context.status = 200;
  context.body = result.data;
};
