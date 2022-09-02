/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */

import semver from 'semver';
import {
  Node,
  parseTree,
  ParseError,
  printParseErrorCode,
  findNodeAtLocation,
} from 'jsonc-parser';

const {satisfies} = semver;

export interface PackageFiles {
  getFile(packageName: string, version: string, path: string): Promise<string>;
}

export interface ValidateManifestArgs {
  // package: Package;
  packageName: string;
  version: string;
  files: PackageFiles;
}

export interface ValidationProblem {
  filePath: string;
  start: number;
  length: number;
  message: string;
  severity: 'error' | 'warning';
  code: ErrorCode;
}

export const errorCodeMessages = {
  1001: 'JSON parse error',
  2001: 'customElements field missing',
  2002: 'Custom elements manifest not found',
  2003: 'Uunsupported custom elements manifest schema version',
} as const;
export type ErrorCode = keyof typeof errorCodeMessages;
export const errorCodes = {
  JSON_parse_error: 1001,
  customElements_field_missing: 2001,
  custom_elements_manifest_not_found: 2002,
  invalid_schema_version: 2003,
} as const;

/**
 * Validates an npm package/version against a number of checks for custom
 * element manifest correctness.
 */
export async function* validatePackage(
  args: ValidateManifestArgs
): AsyncGenerator<ValidationProblem> {
  // const {packageName, version, files} = args;
  const {
    customElementsManifestFileName,
    customElementsManifestNode,
    problems: packgeJsonProblems,
  } = await validatePackageJson(args);
  yield* packgeJsonProblems();
  if (
    customElementsManifestFileName === undefined ||
    customElementsManifestNode === undefined
  ) {
    return;
  }
  const {problems: manifestProblems} = await validateManifest(
    args,
    customElementsManifestFileName,
    customElementsManifestNode
  );
  yield* manifestProblems();
}

async function validatePackageJson(args: ValidateManifestArgs) {
  const {packageName, version, files} = args;
  const packageJsonSource = await files.getFile(
    packageName,
    version,
    'package.json'
  );
  const parseErrors: Array<ParseError> = [];
  const packageJsonTree = parseTree(packageJsonSource, parseErrors, {
    disallowComments: true,
  })!;
  let customElementsManifestFileName: string | undefined = undefined;
  const customElementsManifestNode = findNodeAtLocation(packageJsonTree, [
    'customElements',
  ]);
  if (customElementsManifestNode?.type === 'string') {
    customElementsManifestFileName = customElementsManifestNode.value;
  }
  return {
    customElementsManifestNode,
    customElementsManifestFileName,
    problems: async function* () {
      if (customElementsManifestFileName === undefined) {
        yield {
          filePath: 'package.json',
          code: errorCodes.customElements_field_missing,
          message: errorCodeMessages[errorCodes.customElements_field_missing],
          start: 0,
          length: 0,
          severity: 'error',
        } as const;
      }
      for (const e of parseErrors) {
        yield {
          filePath: 'package.json',
          code: errorCodes.JSON_parse_error,
          message: `JSON parse error ${printParseErrorCode(e.error)}`,
          start: e.offset,
          length: e.length,
          severity: 'error',
        } as const;
      }
    },
  };
}

const validateManifest = async (
  args: ValidateManifestArgs,
  customElementsManifestFileName: string,
  customElementsManifestNode: Node
) => {
  const {packageName, version, files} = args;
  let manifestSource: string | undefined;
  try {
    manifestSource = await files.getFile(
      packageName,
      version,
      customElementsManifestFileName
    );
  } catch (e) {}

  const parseErrors: Array<ParseError> = [];
  let manifestTree: Node | undefined;
  if (manifestSource !== undefined) {
    manifestTree = parseTree(manifestSource, parseErrors, {
      disallowComments: true,
    })!;
  }
  return {
    manifestTree,
    problems: async function* () {
      if (manifestSource === undefined) {
        yield {
          filePath: 'package.json',
          code: errorCodes.custom_elements_manifest_not_found,
          message: `Custom elements manifest not found: ${customElementsManifestFileName}`,
          start: customElementsManifestNode.offset,
          length: customElementsManifestNode.length,
          severity: 'error',
        } as const;
      }
      for (const e of parseErrors) {
        yield {
          filePath: customElementsManifestFileName,
          code: errorCodes.JSON_parse_error,
          message: `JSON parse error ${printParseErrorCode(e.error)}`,
          start: e.offset,
          length: e.length,
          severity: 'error',
        } as const;
      }
      if (manifestTree !== undefined && parseErrors.length === 0) {
        yield* validateSchemaVersion(
          manifestTree,
          customElementsManifestFileName
        );
      }
    },
  };
};

async function* validateSchemaVersion(
  manifestTree: Node,
  customElementsManifestFileName: string
) {
  const schemaVersionNode = findNodeAtLocation(manifestTree, ['schemaVersion']);
  if (schemaVersionNode?.type !== 'string') {
    throw new Error('Not implemented: validate manifest against JSON schema');
  }
  const schemaVersion = schemaVersionNode.value;

  if (!satisfies(schemaVersion, '~^1.0.0')) {
    yield {
      filePath: customElementsManifestFileName,
      code: errorCodes.invalid_schema_version,
      message: `${
        errorCodeMessages[errorCodes.invalid_schema_version]
      }: ${schemaVersion}`,
      start: schemaVersionNode.offset,
      length: schemaVersionNode.length,
      severity: 'warning',
    } as const;
  }
}

// Warning: no custom elements found
