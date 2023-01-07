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
    await import('@webcomponents/internal-site-client/lib/components/wco-nav-page.js');

    // URL isn't exactly a Location, but it's close enough for read-only uses
    window.location = new URL('http://localhost:5450/docs/');

    return [
      ...renderPage({
        ...data,
        content: html`<wco-nav-page>${unsafeHTML(data.content)}</wco-nav-page>`,
      }),
    ].join('');
  },
};
