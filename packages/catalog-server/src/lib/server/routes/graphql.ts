/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  getGraphQLParameters,
  processRequest,
  renderGraphiQL,
  sendResult,
  shouldRenderGraphiQL,
} from 'graphql-helix';
import type {GraphQLSchema} from 'graphql';
import type Koa from 'koa';

export const makeGraphQLRoute =
  (schema: GraphQLSchema) => async (context: Koa.Context) => {
    // Build the graphql-helix request object
    const request = {
      body: context.request.body,
      headers: context.req.headers,
      method: context.request.method,
      query: context.request.query,
    };

    if (shouldRenderGraphiQL(request)) {
      // This renders the interactive GraphiQL interface.
      // We might want to turn this off in production, or limit its use to
      // project owners.
      context.body = renderGraphiQL({});
    } else {
      const params = getGraphQLParameters(request);
      const {operationName, query, variables} = params;

      const result = await processRequest({
        operationName,
        query,
        variables,
        request,
        schema,
      });

      if (result.type === 'RESPONSE') {
        // Log errors that are not normally logged.
        // The errors are actual Error objects, so we get the stack traces
        if (result.payload.errors && result.payload.errors.length > 0) {
          for (const e of result.payload.errors) {
            console.error(e);
          }
        }
      }

      sendResult(result, context.response.res);
    }
  };
