/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ApolloClient,
  HttpLink,
  InMemoryCache,
} from '@apollo/client/core/index.js';
import {GoogleAuth} from 'google-auth-library';

let CATALOG_GRAPHQL_URL =
  process.env['CATALOG_GRAPHQL_URL'] || `http://localhost:6451/graphql`;

if (!CATALOG_GRAPHQL_URL.endsWith('/')) {
  CATALOG_GRAPHQL_URL = CATALOG_GRAPHQL_URL + '/';
}

const auth = new GoogleAuth();

const link = new HttpLink({
  uri: CATALOG_GRAPHQL_URL + 'graphql',
  async fetch(
    input: RequestInfo | URL,
    init?: RequestInit | undefined
  ): Promise<Response> {
    const authClient = await auth.getIdTokenClient(CATALOG_GRAPHQL_URL);
    const authHeaders = await authClient.getRequestHeaders();
    const headers = {
      ...(init?.headers ?? {}),
      ...authHeaders,
    };
    console.log('audience', CATALOG_GRAPHQL_URL);
    console.log('input', input);
    console.log('init', init);
    console.log('request headers', headers);

    return fetch(input, {
      ...(init ?? {}),
      headers,
    });
  },
});

export const client = new ApolloClient({
  link,
  cache: new InMemoryCache(),
});
