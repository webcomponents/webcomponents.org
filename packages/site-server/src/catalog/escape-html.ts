/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const replacements: Record<string, string> = {
  '<': '&lt;',
  '>': '&gt;',
  '&': '&amp;',
  "'": '&#39;',
  '"': '&quot;',
};
// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const replacer = (s: string) => replacements[s]!;
export const escapeHTML = (html: string | undefined | null) =>
  html == null ? '' : html.replaceAll(/[<>&'"]/g, replacer);
