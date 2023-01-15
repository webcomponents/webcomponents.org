/**
 * @license
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {DefaultContext, DefaultState, ParameterizedContext} from 'koa';
import Router from '@koa/router';
import {client} from '../../graphql.js';
import {gql} from '@apollo/client/core/index.js';

const elementsQuery = gql`
  query Elements($query: String) {
    elements(query: $query, limit: 16) {
      tagName
      package
      version
      className
    }
  }
`;

export const handleCatalogSearchRoute = async (
  context: ParameterizedContext<
    DefaultState,
    DefaultContext & Router.RouterParamContext<DefaultState, DefaultContext>,
    unknown
  >
) => {
  const searchText = context.query['query'];
  context.type = 'json';

  if (typeof searchText !== 'string') {
    context.status = 400;
    context.body = {
      message: 'Query parmeter `query` must be a string',
    };
    return;
  }

  const result = await client.query({
    query: elementsQuery,
    variables: {query: searchText},
  });

  if (result.error) {
    context.status = 500;
    context.body = {
      message: result.error,
    };
    return;
  }

  context.status = 200;
  context.body = {
    elements: result.data?.elements,
  };
};
