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

const CATALOG_GRAPHQL_URL = process.env['CATALOG_GRAPHQL_URL'];
if (!CATALOG_GRAPHQL_URL) {
  throw new Error('CATALOG_GRAPHQL_URL must be set');
}

let linkFetch: typeof fetch | undefined = undefined;
if (process.env['CLOUD_RUN_JOB']) {
  const CATALOG_SERVER_AUTH_ID = process.env['CATALOG_SERVER_AUTH_ID'];
  if (!CATALOG_SERVER_AUTH_ID) {
    throw new Error('CATALOG_SERVER_AUTH_ID must be set');
  }
  const auth = new GoogleAuth();
  linkFetch = async (
    input: RequestInfo | URL,
    init?: RequestInit | undefined
  ): Promise<Response> => {
    const authClient = await auth.getIdTokenClient(CATALOG_SERVER_AUTH_ID);
    const authHeaders = await authClient.getRequestHeaders();
    const headers = {
      ...(init?.headers ?? {}),
      ...authHeaders,
    };
    return fetch(input, {
      ...(init ?? {}),
      headers,
    });
  };
}

export const client = new ApolloClient({
  link: new HttpLink({
    uri: CATALOG_GRAPHQL_URL,
    fetch: linkFetch,
  }),
  cache: new InMemoryCache(),
});
