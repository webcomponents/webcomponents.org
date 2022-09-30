/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */

import Koa from 'koa';
import Router from '@koa/router';
import {
  getGraphQLParameters,
  processRequest,
  renderGraphiQL,
  sendResult,
  shouldRenderGraphiQL,
} from 'graphql-helix';
import bodyParser from 'koa-bodyparser';

import {makeExecutableCatalogSchema} from './graphql.js';
import {Catalog} from './catalog.js';
import {FirestoreRepository} from './firestore/firestore-repository.js';
import {NpmAndUnpkgFiles} from './npm.js';

export const makeServer = async () => {
  const files = new NpmAndUnpkgFiles();
  const repository = new FirestoreRepository();
  const catalog = new Catalog({files, repository});
  const schema = await makeExecutableCatalogSchema(catalog);

  const app = new Koa();

  const router = new Router();

  router.use(bodyParser());

  router.all('/graphql', async (context) => {
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
  });

  router.get('/', async (ctx) => {
    ctx.status = 200;
    ctx.type = 'html';
    ctx.body = `
    <h1>Web Components Registry</h1>
    <p>
      This server hosts a GraphQL API for interacting with the
      web components registry.
    </p>
    <p>See the interactive query editor at <a href="/graphql">/graphql</a>.
  `;
  });

  app.use(router.routes());
  app.use(router.allowedMethods());
  return app;
};
