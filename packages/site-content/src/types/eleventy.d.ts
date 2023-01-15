/**
 * @license
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

declare module '@11ty/eleventy' {
  export interface EleventyConfig {
    addPlugin(plugin: EleventyPlugin): void;
    addPassthroughCopy(src: string | Record<string, string>): EleventyConfig;
  }

  export interface EleventyConfigResult {
    dir: {
      input: string;
      output: string;
    };
  }

  export type EleventyPlugin = (eleventyConfig: EleventyConfig) => void;

  export interface EleventyPageData {
    content: string;
    page: {
      url: string;
    };
    collections: {
      all: EleventyCollection;
    };
    [key: string]: unknown;
  }

  export type EleventyCollection = {
    __eleventyCollection: never;
  };

  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  export interface EleventyContext {}
}
