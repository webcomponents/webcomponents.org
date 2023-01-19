/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {css, html, nothing} from 'lit';
import {unsafeHTML} from 'lit/directives/unsafe-html.js';
import type * as cem from 'custom-elements-manifest/schema.js';
import {marked} from 'marked';

export const styles = css`
  :host {
    display: block;
    padding: 0 0 15px 15px;
    margin-bottom: 15px;
    background-color: rgba(0, 0, 0, 0.03);
    border: 1px solid #aaa;
    border-radius: 6px;
  }
  code {
    display: inline-block;
    padding: 4px;
    background-color: rgba(0, 0, 0, 0.03);
    border-radius: 4px;
  }
  table {
    border-collapse: separate;
  }
  th {
    text-align: start;
    font-size: 0.8em;
    font-weight: 600;
    border-bottom: 1px solid #aaa;
    background-color: rgba(0, 0, 0, 0.04);
    padding: 4px;
  }
  td {
    vertical-align: top;
    padding: 4px;
  }
  tr:nth-child(even) {
    background-color: rgba(0, 0, 0, 0.03);
  }
  h1.title,
  h2.title,
  h3.title,
  h4.title {
    background-color: #fff;
    border-bottom: 1px solid #aaa;
    margin: 0 0 15px -15px;
    padding: 15px 0 5px 15px;
    border-radius: 10px 10px 0 0;
  }
`;

export type CemReferenceResolver = (reference: cem.Reference) => string;

export const defaultReferenceResolver = (ref: cem.Reference) => {
  const {package: pkg, module, name} = ref;
  return `#${pkg}${module === undefined ? '' : `/${module}`}:${name}`;
};

export const whenDefined = <
  V,
  T extends undefined | ((v: NonNullable<V>) => unknown)
>(
  v: V,
  transform?: T
) =>
  v == null ||
  (Array.isArray(v) && v.length === 0) ||
  (typeof v === 'string' && v.length === 0) ||
  v === false
    ? nothing
    : transform !== undefined
    ? transform(v)
    : v;

export const markdown = (content: string | undefined) =>
  content !== undefined ? unsafeHTML(marked(content)) : nothing;

export const renderDeclarationInfo = (
  declaration: cem.Declaration,
  exportName?: string
) =>
  html`<h4 class="title">
      ${exportName !== undefined ? exportName : declaration.name}
      (${declaration.kind}${exportName !== undefined &&
      exportName !== declaration.name
        ? ` ${declaration.name}`
        : ''})
    </h4>
    ${markdown(declaration.summary)} ${markdown(declaration.description)}`;
