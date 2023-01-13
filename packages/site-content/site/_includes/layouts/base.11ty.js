/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

module.exports = {
  async render(data) {
    const {renderPage, unsafeHTML} = await import(
      '../../../../site-templates/lib/base.js'
    );
    return [
      ...renderPage({
        ...data,
        content: unsafeHTML(data.content),
      }),
    ].join('');
  },
};
