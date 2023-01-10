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
      '@webcomponents/internal-site-client/lib/components/wco-nav-page.js'
    );

    // Set location because wco-nav-bar reads pathname from it. URL isn't
    // exactly a Location, but it's close enough for read-only uses
    globalThis.location = new URL('http://localhost:5450/docs/');

    const navigationEntries = this.eleventyNavigation(data.collections.all);

    // TODO: use custom navigation HTML generation so that we can leave out
    // links for section items.
    // See https://github.com/lit/lit.dev/blob/main/packages/lit-dev-content/site/_includes/docs-nav.html
    const navigationHTML = this.eleventyNavigationToHtml(navigationEntries);

    return [
      ...renderPage({
        ...data,
        content: html`<wco-nav-page>
          <div slot="outline">${unsafeHTML(navigationHTML)}</div>
          ${unsafeHTML(data.content)}
        </wco-nav-page>`,
      }),
    ].join('');
  },
};
