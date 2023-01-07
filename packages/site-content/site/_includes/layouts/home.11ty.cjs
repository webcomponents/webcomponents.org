/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

module.exports = {
  async render(data) {
    const {renderPage, html, unsafeHTML} = await import(
      '../../../templates/lib/base.js'
    );
    await import('@webcomponents/internal-site-client/lib/components/wco-home-page.js');
    return [
      ...renderPage({
        ...data,
        content: html`<wco-home-page>${unsafeHTML(data.content)}</wco-home-page>`,
      }),
    ].join('');
  },
};
