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

let CATALOG_SERVER_URL =
  process.env['CATALOG_SERVER_URL'] || `http://localhost:6451/`;

if (!CATALOG_SERVER_URL.endsWith('/')) {
  CATALOG_SERVER_URL = CATALOG_SERVER_URL + '/';
}

const auth = new GoogleAuth();

const link = new HttpLink({
  uri: CATALOG_SERVER_URL + 'graphql',
  async fetch(
    input: RequestInfo | URL,
    init?: RequestInit | undefined
  ): Promise<Response> {
    {
      const auth = new GoogleAuth();
      const catalogUrl = CATALOG_SERVER_URL;
      const client = await auth.getIdTokenClient(catalogUrl);
      try {
        const headers = await client.getRequestHeaders();
        const response = await fetch(catalogUrl, {headers});
        const text = await response.text();
        console.log('YYY', text);
      } catch (e) {
        console.log(`YYY Error: ${(e as Error).stack}`);
      }
    }
    const authClient = await auth.getIdTokenClient(CATALOG_SERVER_URL);
    const authHeaders = await authClient.getRequestHeaders();
    const headers = {
      ...(init?.headers ?? {}),
      ...authHeaders,
    };
    console.log('audience', CATALOG_SERVER_URL);
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
