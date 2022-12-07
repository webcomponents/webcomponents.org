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

const CATALOG_GRAPHQL_URL =
  process.env['CATALOG_GRAPHQL_URL'] || `http://localhost:6451`;

console.log(`K_SERVICE ${process.env['K_SERVICE']}`);
console.log(`K_REVISION ${process.env['K_REVISION']}`);

// The GoogleAuth class will use Application Default Credientials,
// which are automatically provided to GCP services with attached
// service accounts.
// See:
// - https://github.com/googleapis/google-auth-library-nodejs#application-default-credentials
// - https://cloud.google.com/docs/authentication/provide-credentials-adc#attached-sa
const auth = new GoogleAuth({
  scopes: 'https://www.googleapis.com/auth/cloud-platform',
});
// const authClient = await auth.getClient();
const authClient = await auth.getIdTokenClient(CATALOG_GRAPHQL_URL);
console.log('CATALOG_GRAPHQL_URL', CATALOG_GRAPHQL_URL);

const link = new HttpLink({
  uri: CATALOG_GRAPHQL_URL + '/graphql',
  async fetch(
    input: RequestInfo | URL,
    init?: RequestInit | undefined
  ): Promise<Response> {
    const authHeaders = await authClient.getRequestHeaders(CATALOG_GRAPHQL_URL);
    console.log('GoogleAuth request headers', authHeaders);
    const headers = {
      ...(init?.headers ?? {}),
      ...authHeaders,
    };
    return fetch(input, {...(init ?? {}), headers});
  },
});

export const client = new ApolloClient({
  link,
  cache: new InMemoryCache(),
});
