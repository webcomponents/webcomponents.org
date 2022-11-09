/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {readFile} from 'fs/promises';
import {fileURLToPath} from 'url';

import Koa from 'koa';
import cors from '@koa/cors';
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
import {NpmAndUnpkgFiles} from '@webcomponents/custom-elements-manifest-tools/lib/npm-and-unpkg-files.js';

import {
  PackageVersion,
  ValidationProblem,
  PackageInfo,
  CustomElement,
} from '@webcomponents/catalog-api/lib/schema.js';

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

  router.get('/bootstrap-packages', async (context) => {
    const bootstrapListFilePath = fileURLToPath(
      new URL('../data/bootstrap-packages.json', import.meta.url)
    );
    const bootstrapListFile = await readFile(bootstrapListFilePath, 'utf-8');
    const bootstrapList = JSON.parse(bootstrapListFile);
    const packageNames = bootstrapList['packages'] as Array<string>;
    const results = await Promise.all(
      packageNames.map(
        async (
          packageName
        ): Promise<
          | {error: unknown; packageName: string}
          | {
              packageName: string;
              elements: Array<CustomElement>;
              packageInfo?: PackageInfo | undefined;
              packageVersion?: PackageVersion | undefined;
              problems?: ValidationProblem[] | undefined;
            }
        > => {
          try {
            const importResult = await catalog.importPackage(packageName);
            const elements = await catalog.getCustomElements(
              packageName,
              'latest',
              undefined
            );
            return {
              packageName,
              elements,
              ...importResult,
            };
          } catch (error) {
            return {
              packageName,
              error,
            };
          }
        }
      )
    );
    context.status = 200;
    context.type = 'html';
    context.body = `
      <h1>Bootstrap Import Results</h1>
      ${results
        .map((result) => {
          const {packageName} = result;
          if ('error' in result) {
            return `
              <h3>${packageName}</h3>
              <code><pre>${result.error}</pre></code>
            `;
          } else {
            const {elements} = result;
            return `
              <h3>${packageName}</h3>
              <p>Imported ${elements.length} element${
              elements.length === 1 ? '' : 's'
            }</p>
          `;
          }
        })
        .join('\n')}
    `;
  });

  app.use(cors());
  app.use(router.routes());
  app.use(router.allowedMethods());
  return app;
};
