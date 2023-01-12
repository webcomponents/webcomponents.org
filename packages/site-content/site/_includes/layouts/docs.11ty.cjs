/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

module.exports = {
  async render(data) {
    const {renderPage} = await import('../../../templates/lib/base.js');
    await import(
      '@webcomponents/internal-site-client/lib/components/wco-nav-page.js'
    );
    const {renderDocsPage} = await import(
      '@webcomponents/internal-site-client/lib/entrypoints/docs.js'
    );

    // Set location because wco-nav-bar reads pathname from it. URL isn't
    // exactly a Location, but it's close enough for read-only uses
    globalThis.location = new URL(
      `http://localhost:5450${data.page.url || '/'}`
    );

    const navEntries = this.eleventyNavigation(data.collections.all);

    return [
      ...renderPage(
        {
          ...data,
          content: renderDocsPage(data.content, navEntries),
          initialData: [data.content, navEntries],
          initScript: '/js/docs-hydrate.js',
        },
        {
          // We need to defer elements from hydrating so that we can
          // manually provide data to the element in docs-hydrate.js
          deferHydration: true,
        }
      ),
    ].join('');
  },
};
