/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import semver from 'semver';
import {
  Node,
  parseTree,
  ParseError,
  printParseErrorCode,
  findNodeAtLocation,
} from 'jsonc-parser';
import type {Package} from 'custom-elements-manifest/schema.js';
import {PackageFiles} from './npm.js';

const {satisfies} = semver;

export interface ValidateManifestArgs {
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
  '1001': 'JSON parse error',
  '2001': 'customElements field missing',
  '2002': 'Custom elements manifest not found',
  '2003': 'Unsupported custom elements manifest schema version',
} as const;
export type ErrorCode = keyof typeof errorCodeMessages;
export const errorCodes = {
  JSON_parse_error: '1001',
  customElements_field_missing: '2001',
  custom_elements_manifest_not_found: '2002',
  invalid_schema_version: '2003',
} as const;

/**
 * Validates an npm package/version against a number of checks for custom
 * element manifest correctness.
 */
export const validatePackage = async (args: ValidateManifestArgs) => {
  const problems: Array<ValidationProblem> = [];

  const {
    customElementsManifestFileName,
    customElementsManifestNode,
    problems: packgeJsonProblems,
  } = await validatePackageJson(args);
  problems.push(...packgeJsonProblems);

  let manifestSource: string | undefined = undefined;
  let manifestData: Package | undefined = undefined;

  if (
    customElementsManifestFileName !== undefined &&
    customElementsManifestNode !== undefined
  ) {
    const result = await validateManifest(
      args,
      customElementsManifestFileName,
      customElementsManifestNode
    );
    problems.push(...result.problems);
    manifestSource = result.manifestSource;
    manifestData = result.manifestData;
  }

  return {
    manifestData,
    manifestSource,
    problems,
  };
};

const validatePackageJson = async (args: ValidateManifestArgs) => {
  const {packageName, version, files} = args;
  const problems: Array<ValidationProblem> = [];

  // Fetch package.json *file* from package.
  // This is the source as uploaded to npm, so it's suitable for reporting
  // errors on.
  const packageJsonSource = await files.getFile(
    packageName,
    version,
    'package.json'
  );

  // Parse package.json
  const parseErrors: Array<ParseError> = [];
  const packageJsonTree = parseTree(packageJsonSource, parseErrors, {
    disallowComments: true,
  })!;
  for (const e of parseErrors) {
    problems.push({
      filePath: 'package.json',
      code: errorCodes.JSON_parse_error,
      message: `JSON parse error ${printParseErrorCode(e.error)}`,
      start: e.offset,
      length: e.length,
      severity: 'error',
    } as const);
  }

  // Get manifest file name
  let customElementsManifestFileName: string | undefined = undefined;
  const customElementsManifestNode = findNodeAtLocation(packageJsonTree, [
    'customElements',
  ]);
  if (customElementsManifestNode?.type === 'string') {
    customElementsManifestFileName = customElementsManifestNode.value;
  }
  if (customElementsManifestFileName === undefined) {
    problems.push({
      filePath: 'package.json',
      code: errorCodes.customElements_field_missing,
      message: errorCodeMessages[errorCodes.customElements_field_missing],
      start: 0,
      length: 0,
      severity: 'error',
    } as const);
  }

  return {
    customElementsManifestNode,
    customElementsManifestFileName,
    problems,
  };
};

const validateManifest = async (
  args: ValidateManifestArgs,
  customElementsManifestFileName: string,
  customElementsManifestNode: Node
) => {
  const {packageName, version, files} = args;
  const problems: Array<ValidationProblem> = [];

  // Fetch manifest
  let manifestSource: string | undefined;
  try {
    manifestSource = await files.getFile(
      packageName,
      version,
      customElementsManifestFileName
    );
  } catch (e) {
    problems.push({
      filePath: 'package.json',
      code: errorCodes.custom_elements_manifest_not_found,
      message: `Custom elements manifest not found: ${customElementsManifestFileName}`,
      start: customElementsManifestNode.offset,
      length: customElementsManifestNode.length,
      severity: 'error',
    } as const);
  }

  // Parse manifest to AST
  const parseErrors: Array<ParseError> = [];
  let manifestTree: Node | undefined;
  if (manifestSource !== undefined) {
    manifestTree = parseTree(manifestSource, parseErrors, {
      disallowComments: true,
    })!;
  }
  for (const e of parseErrors) {
    problems.push({
      filePath: customElementsManifestFileName,
      code: errorCodes.JSON_parse_error,
      message: `JSON parse error ${printParseErrorCode(e.error)}`,
      start: e.offset,
      length: e.length,
      severity: 'error',
    } as const);
  }

  // Parse manifest to data
  // Assume that double parsing is roughly near the same performance as turning
  // the AST into a data object, and a lot less code.
  const manifestData =
    manifestSource !== undefined && parseErrors.length === 0
      ? JSON.parse(manifestSource)
      : undefined;

  // Validate schema version
  if (manifestTree !== undefined && parseErrors.length === 0) {
    problems.push(
      ...validateSchemaVersion(manifestTree, customElementsManifestFileName)
    );
  }

  return {
    manifestData,
    manifestSource,
    manifestTree,
    problems,
  };
};

function* validateSchemaVersion(
  manifestTree: Node,
  customElementsManifestFileName: string
) {
  const schemaVersionNode = findNodeAtLocation(manifestTree, ['schemaVersion']);
  if (schemaVersionNode?.type !== 'string') {
    throw new Error('Not implemented: validate manifest against JSON schema');
  }
  const schemaVersion = schemaVersionNode.value;

  if (!satisfies(schemaVersion, '^1.0.0')) {
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
