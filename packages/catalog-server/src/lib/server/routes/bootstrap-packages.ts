/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {readFile} from 'fs/promises';
import {fileURLToPath} from 'url';
import type {
  CustomElement,
  PackageInfo,
  PackageVersion,
  ValidationProblem,
} from '@webcomponents/catalog-api/lib/schema.js';
import type Koa from 'koa';
import type {Catalog} from '../../catalog.js';

export const makeBootstrapPackagesRoute =
  (catalog: Catalog) => async (context: Koa.Context) => {
    const bootstrapListFilePath = fileURLToPath(
      new URL('../../../data/bootstrap-packages.json', import.meta.url)
    );
    const bootstrapListFile = await readFile(bootstrapListFilePath, 'utf-8');
    const bootstrapList = JSON.parse(bootstrapListFile);
    const packageNames = bootstrapList['packages'] as Array<string>;

    // TODO (justinfagnani): rather than import the packages directly, add them
    // to the DB in a non-imported state, then kick off the standard update
    // workflow, which will import them all.
    const results = await Promise.all(
      packageNames.map(
        async (
          packageName
        ): Promise<
          | {error: Error; packageName: string}
          | {
              packageName: string;
              elements: Array<CustomElement>;
              packageInfo?: PackageInfo | undefined;
              packageVersion?: PackageVersion | undefined;
              problems?: ValidationProblem[] | undefined;
            }
        > => {
          try {
            const importResult = await catalog.importPackage(packageName);
            const elements = await catalog.getCustomElements(
              packageName,
              'latest',
              undefined
            );
            return {
              packageName,
              elements,
              ...importResult,
            };
          } catch (error) {
            return {
              packageName,
              error: error as Error,
            };
          }
        }
      )
    );
    context.status = 200;
    context.type = 'html';
    context.body = `
    <h1>Bootstrap Import Results</h1>
    ${results
      .map((result) => {
        const {packageName} = result;
        if ('error' in result) {
          return `
            <h3>${packageName}</h3>
            <code><pre>${result.error}\n${result.error.stack ?? ''}</pre></code>
          `;
        } else {
          const {elements} = result;
          return `
            <h3>${packageName}</h3>
            <p>Imported ${elements.length} element${
            elements.length === 1 ? '' : 's'
          }</p>
        `;
        }
      })
      .join('\n')}
  `;
  };
