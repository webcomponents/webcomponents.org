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
    await import(
      '@webcomponents/internal-site-client/lib/components/wco-docs-page.js'
    );

    // Set location because wco-nav-bar reads pathname from it. URL isn't
    // exactly a Location, but it's close enough for read-only uses

    globalThis.location = new URL(
      `http://localhost:5450${data.page.url || '/'}`
    );

    const navEntries = this.eleventyNavigation(data.collections.all);

    return [
      ...renderPage({
        ...data,
        content: html`<wco-docs-page .navEntries=${navEntries}>
          ${unsafeHTML(data.content)}
        </wco-docs-page>`,
      }),
    ].join('');
  },
};
