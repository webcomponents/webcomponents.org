/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */

import Koa from 'koa';
import cors from '@koa/cors';
import Router from '@koa/router';

import bodyParser from 'koa-bodyparser';

import {makeExecutableCatalogSchema} from '../graphql.js';
import {Catalog} from '../catalog.js';
import {FirestoreRepository} from '../firestore/firestore-repository.js';
import {NpmAndUnpkgFiles} from '@webcomponents/custom-elements-manifest-tools/lib/npm-and-unpkg-files.js';

import {makeGraphQLRoute} from './routes/graphql.js';
import {makeBootstrapPackagesRoute} from './routes/bootstrap-packages.js';
import {makeUpdatePackagesRoute} from './routes/update-packages.js';

export const makeServer = async () => {
  const files = new NpmAndUnpkgFiles();
  const repository = new FirestoreRepository();
  const catalog = new Catalog({files, repository});
  const schema = await makeExecutableCatalogSchema(catalog);

  const router = new Router();

  router.use(bodyParser());

  router.all('/graphql', makeGraphQLRoute(schema));

  router.get('/bootstrap-packages', makeBootstrapPackagesRoute(catalog));

  router.get('/update-packages', makeUpdatePackagesRoute(catalog));

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

  const app = new Koa();
  app.use(cors());
  app.use(router.routes());
  app.use(router.allowedMethods());
  return app;
};
