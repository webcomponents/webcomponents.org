/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {marked} from 'marked';
import sanitizeHtml from 'sanitize-html';

/**
 * Allowlist for HTML generated from third-party markdown. Keep it tight:
 * sanitize-html is parser-based rather than DOM-based, so no SVG, MathML or
 * inline styles, and only http(s)/mailto URLs.
 */
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img', 'del'],
  allowedAttributes: {
    a: ['href', 'name', 'title'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    code: ['class'],
    th: ['align'],
    td: ['align'],
  },
  allowedClasses: {
    code: ['language-*'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesAppliedToAttributes: ['href', 'src'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
};

/**
 * Renders markdown that comes from a third party (npm package metadata,
 * custom elements manifests, READMEs, ...) to HTML that is safe to pass to
 * Lit's `unsafeHTML()`.
 *
 * `marked` does not sanitize: raw HTML in the source is passed through
 * verbatim. All untrusted markdown that ends up in an HTML sink must go
 * through this function instead of calling `marked()` directly.
 */
export const renderUntrustedMarkdown = (
  markdown: string | null | undefined
): string => {
  if (!markdown) {
    return '';
  }
  return sanitizeHtml(marked(markdown), SANITIZE_OPTIONS);
};
