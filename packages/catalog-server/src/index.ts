/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {AddressInfo} from 'net';
import {makeServer} from './lib/server/server.js';

const PORT = process.env['PORT'] ? parseInt(process.env['PORT']) : 6451;

const app = await makeServer();
const server = app.listen(PORT, () => {
  const port = (server.address() as AddressInfo).port;
  console.log(`Server started: http://localhost:${port}`);
});
