/**
 * @license
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

declare module '@11ty/eleventy-navigation' {
  import type {EleventyConfig} from '@11ty/eleventy';

  export default function eleventyNavigationPlugin(
    eleventyConfig: EleventyConfig
  ): void;

  export interface EleventyNavigationEntry {
    key: string;
    url: string;
  }
}

declare module '@11ty/eleventy' {
  import type {EleventyNavigationEntry} from '@11ty/eleventy-navigation';

  export interface EleventyContext {
    eleventyNavigation: (
      collection: EleventyCollection
    ) => EleventyNavigationEntry[];
  }
}
