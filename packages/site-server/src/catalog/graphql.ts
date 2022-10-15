/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {ApolloClient, InMemoryCache} from '@apollo/client/core/index.js';

const CATALOG_GRAPHQL_URL =
  process.env['CATALOG_GRAPHQL_URL'] || `http://localhost:6451/graphql`;

export const client = new ApolloClient({
  uri: CATALOG_GRAPHQL_URL,
  cache: new InMemoryCache(),
});
