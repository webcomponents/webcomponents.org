/**
 * @license
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {html} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import {WCOPage} from '../../shared/wco-page.js';
import {Task} from '@lit-labs/task';

@customElement('wco-catalog-import-page')
export class WCOCatalogImportPage extends WCOPage {
  private _importTask = new Task(this, {
    task: async ([packageName]: [packageName: string | undefined]) => {
      console.log('_importTask', packageName);

      if (packageName !== undefined && packageName.trim().length > 0) {
        const response = await fetch(`/catalog/import`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            packageName,
          }),
        });
        const result = await response.json();
        return result;
      }
    },
    args: () => [this._packageName] as [string],
  });

  @state()
  private _packageName?: string;

  renderContent() {
    return html`
      <h1>Import a Package</h1>
      <label>Package: <input @change=${this._onPackageNameChange} /></label>
      ${this._importTask.render({
        complete: (value) => html` <h2>Imported</h2>
          <pre>${JSON.stringify(value, undefined, 2)}</pre>`,
        pending: () => html`<p>Importing package...</p>`,
      })}
    `;
  }

  private _onPackageNameChange(e: Event) {
    this._packageName = (e.target as HTMLInputElement).value;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'wco-catalog-import-page': WCOCatalogImportPage;
  }
}
