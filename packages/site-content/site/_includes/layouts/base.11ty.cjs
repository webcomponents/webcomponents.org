/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

module.exports = {
  async render(data) {
    const {renderPage} = await import('../../../templates/lib/base.js');
    // TODO (justinfagnani): move the top-bar to a real template or
    // back into the base template when we enable 11ty / Lit SSR integration
    return [
      ...renderPage({
        ...data,
        content: `
    <wco-top-bar></wco-top-bar>
    ${data.content}
    `,
      }),
    ].join('');
  },
};
