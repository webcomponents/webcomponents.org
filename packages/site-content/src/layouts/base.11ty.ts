/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {EleventyContext, EleventyPageData} from '@11ty/eleventy';

module.exports = {
  async render(this: EleventyContext, data: EleventyPageData): Promise<string> {
    const {renderPage, unsafeHTML} = await import(
      '../../../site-templates/lib/base.js'
    );
    return [
      ...renderPage({
        ...data,
        content: unsafeHTML(data.content),
      }),
    ].join('');
  },
};
