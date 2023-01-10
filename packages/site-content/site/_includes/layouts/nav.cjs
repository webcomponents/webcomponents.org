/**
 * @license
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Converts an eleventy-navigation entries array to a nested <ul> list.
 *
 * Entries with `url: false` (caused by `permalink: false` in page data) do
 * not generate a link, and so are just section headers.
 *
 * When an entry matches the current page, it's `<li>` element is give the
 * `active` class.
 */
const navToHTML = (navigationEntries, attributes, page) => {
  const makeItems = (entries) =>
    entries
      ?.map(
        (e) =>
          `<li ${getEntryClassString(e, page)}>${maybeWrapInLink(
            e,
            e.key
          )}${renderChildren(e.children, page)}</li>`
      )
      .join('') ?? '';

  return `<ul ${getAttributesString(attributes)}>${makeItems(
    navigationEntries
  )}</ul>`;
};

const getEntryClassString = (entry, page) =>
  entry.url === page.url ? 'class="active"' : '';

const maybeWrapInLink = (entry, s) =>
  entry.url !== false ? `<a href="${entry.url}">${s}</a>` : s;

const renderChildren = (children, page) =>
  children?.length > 0 ? navToHTML(children, {}, page) : '';

const getAttributesString = (attributes) =>
  attributes !== undefined
    ? Object.entries(attributes)
        .map(([name, value]) => `${name}="${value}"`)
        .join(' ')
    : '';

module.exports = {
  navToHTML,
};
