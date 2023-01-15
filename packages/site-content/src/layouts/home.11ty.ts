/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {EleventyContext, EleventyPageData} from '@11ty/eleventy';

module.exports = {
  async render(this: EleventyContext, data: EleventyPageData): Promise<string> {
    const {renderPage, html, unsafeHTML} = await import(
      '../../../site-templates/lib/base.js'
    );
    await import(
      '@webcomponents/internal-site-client/lib/pages/home/wco-home-page.js'
    );

    // Set location because wco-nav-bar reads pathname from it. URL isn't
    // exactly a Location, but it's close enough for read-only uses
    globalThis.location = new URL(
      'http://localhost:5450/'
    ) as object as Location;

    return [
      ...renderPage({
        ...data,
        content: html`<wco-home-page
          >${unsafeHTML(data.content)}</wco-home-page
        >`,
      }),
    ].join('');
  },
};
