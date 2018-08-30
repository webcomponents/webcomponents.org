import babelGenerate from '@babel/generator';
import * as babelParser from '@babel/parser';
import RewritingStream from 'parse5-html-rewriting-stream';
import semver from 'semver';
import {Readable} from 'stream';
import url from 'url';

type PackageJson = {
  dependencies?: {[key: string]: string},
  devDependencies?: {[key: string]: string}
};

/**
 * From a packageJson string, finds the valid semver associated with a package
 * name if it exists.
 */
export function semverForPackage(
    packageJson: PackageJson, name: string): string|null {
  if (packageJson.dependencies &&
      Object.keys(packageJson.dependencies).includes(name)) {
    const value = packageJson.dependencies[name];
    if (value && semver.valid(value)) {
      return value;
    }
  }

  if (packageJson.devDependencies &&
      Object.keys(packageJson.devDependencies).includes(name)) {
    const value = packageJson.devDependencies[name];
    if (value && semver.valid(value)) {
      return value;
    }
  }

  return null;
}

/**
 * Checks if import declaration is a bare module specifier. Reference:
 * https://html.spec.whatwg.org/multipage/webappapis.html#resolve-a-module-specifier
 */
function isBareModuleSpecifier(specifier: string) {
  const parsedUrl = url.parse(specifier);
  if ((parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') &&
      parsedUrl.hostname) {
    return false;
  }

  if (specifier.startsWith('/') || specifier.startsWith('./') ||
      specifier.startsWith('../')) {
    return false;
  }

  return true;
}

function parsePackageName(specifier: string) {
  const split = specifier.split('/');

  if (!split.length) {
    return {
      package: specifier,
      path: '',
    };
  }

  let packageName = split[0];
  if (split.length > 1 && packageName.startsWith('@')) {
    packageName += '/' + split[1];
  }

  return {
    package: packageName,
    path: specifier.slice(packageName.length),
  };
}

function getSemver(packageJson: PackageJson, name: string) {
  let semverRange = '';
  if (packageJson.dependencies && packageJson.dependencies[name]) {
    semverRange = packageJson.dependencies[name];
  }
  if (packageJson.devDependencies && packageJson.devDependencies[name]) {
    semverRange = packageJson.devDependencies[name];
  }

  return semverRange && semver.validRange(semverRange) ? '@' + semverRange : '';
}

/**
 * Synchronously rewrites JS to replace import declarations using bare module
 * specifiers with equivalent unpkg URLs.
 */
export function jsRewrite(code: string, packageJson: PackageJson = {}): string {
  const jsAST = babelParser.parse(code, {sourceType: 'module'});
  for (const node of jsAST.program.body) {
    if (node.type === 'ImportDeclaration') {
      if (isBareModuleSpecifier(node.source.value)) {
        const result = parsePackageName(node.source.value);
        node.source.value = `https://unpkg.com/${result.package}${
            getSemver(packageJson, result.package)}${result.path}?module`;
      }
    }
  }

  const outputJs = babelGenerate(jsAST, {retainLines: true}, code);
  return outputJs.code;
}

/**
 * Rewrites a given HTML stream. Stream must be string encoded (eg. 'utf8').
 */
export function htmlRewrite(
    htmlStream: Readable, packageJson: PackageJson = {}): Readable {
  const rewriter = new RewritingStream();
  let insideModuleScript = false;

  rewriter.on('startTag', (startTag) => {
    if (startTag.tagName === 'script') {
      const attribute = startTag.attrs.find(({name}) => name === 'type');
      if (attribute && attribute.value === 'module') {
        insideModuleScript = true;
      }
    }
    rewriter.emitStartTag(startTag);
  });

  rewriter.on('endTag', (endTag) => {
    if (insideModuleScript && endTag.tagName === 'script') {
      insideModuleScript = false;
    }
    rewriter.emitEndTag(endTag);
  });

  rewriter.on('text', (_, raw) => {
    if (insideModuleScript) {
      rewriter.emitRaw(jsRewrite(raw, packageJson));
    } else {
      rewriter.emitRaw(raw);
    }
  });

  return htmlStream.pipe(rewriter);
}
