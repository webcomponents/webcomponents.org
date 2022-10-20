/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

module.exports = {
  async render(data) {
    const {renderPage} = await import(
      '@webcomponents/internal-site-server/lib/templates/base.js'
    );
    return [...renderPage(data)].join('');
  },
};
