/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {EleventyContext, EleventyPageData} from '@11ty/eleventy';

module.exports = {
  async render(this: EleventyContext, data: EleventyPageData): Promise<string> {
    const {renderPage} = await import('../../../site-templates/lib/base.js');
    const {renderDocsPage} = await import(
      '@webcomponents/internal-site-client/lib/pages/docs/shell.js'
    );

    // Set location because wco-nav-bar reads pathname from it. URL isn't
    // exactly a Location, but it's close enough for read-only uses
    globalThis.location = new URL(
      `http://localhost:5450${data.page.url || '/'}`
    ) as object as Location;

    const navEntries = this.eleventyNavigation(data.collections.all);

    return [
      ...renderPage(
        {
          ...data,
          content: renderDocsPage(data.content, navEntries),
          initialData: [navEntries],
          initScript: '/js/docs/boot.js',
        },
        {
          // We need to defer elements from hydrating so that we can
          // manually provide data to the element in docs/boot.js
          deferHydration: true,
        }
      ),
    ].join('');
  },
};
