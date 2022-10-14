/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Package} from 'custom-elements-manifest/schema.js';
import {
  getModule,
  parseReferenceString,
  resolveReference,
  normalizeModulePath,
} from '@webcomponents/custom-elements-manifest-tools';
import {escapeHTML} from '../../escape-html.js';

export const renderElement = ({
  packageName,
  elementName,
  declarationReference,
  manifest,
}: {
  packageName: string;
  elementName: string;
  declarationReference: string;
  customElementExport: string;
  manifest: Package;
}): string => {
  const declarationRef = parseReferenceString(declarationReference);
  if (declarationRef.module === undefined) {
    return `
      <h1>Error</h1>
      <p>${declarationReference} has no module</p>
    `;
  }
  const module = getModule(manifest, declarationRef.module);

  if (module === undefined) {
    return `
      <h1>Error</h1>
      <p>Module ${declarationRef.module} not found</p>
    `;
  }

  const declaration = resolveReference(
    manifest,
    module,
    declarationRef,
    packageName,
    ''
  );
  console.log('elementDeclaration', declaration);

  if (declaration === undefined || declaration.kind !== 'class') {
    return `<h1>Error</h1>`;
  }

  return `
     <h1>${packageName}/${elementName}</h1>
     ${declaration.description}
     <h2>Usage</h2>
     <pre><code>
     <!-- TODO: this is wrong. We need the jsExport in the db -->
     import {${declaration.name}} from '${
    declarationRef.package
  }/${normalizeModulePath(declarationRef.module)}';
     </code></pre>
     <h2>Fields</h2>
     <ul>
     ${declaration.members
       ?.filter((m) => m.kind === 'field')
       .map(
         (m) => `
       <li>${m.name}: ${escapeHTML(m.description)}</li>
     `
       )
       .join('\n')}
     </ul>
     <h2>Methods</h2>
     <ul>
     ${declaration.members
       ?.filter((m) => m.kind === 'method')
       .map(
         (m) => `
       <li>${m.name}: ${escapeHTML(m.description)}</li>
     `
       )
       .join('\n')}
     </ul>
   `;
};
