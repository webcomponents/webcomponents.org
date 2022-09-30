/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {AddressInfo} from 'net';
import {makeServer} from './lib/server.js';

const app = await makeServer();
const server = app.listen(8080, () => {
  const port = (server.address() as AddressInfo).port;
  console.log(`Server started: http://localhost:${port}`);
});
