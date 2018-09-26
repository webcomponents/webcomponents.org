import babelGenerate from '@babel/generator';
import * as babelParser from '@babel/parser';
import RewritingStream from 'parse5-html-rewriting-stream';
import url from 'url';

import {PackageDefinition} from './package-lock-generator';

/**
 * Checks if module import specifier is a bare module specifier. Reference:
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

/**
 * Split package name into NPM package name and path.
 */
export function parsePackageName(specifier: string) {
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

/**
 * Given a package lock object, performs a depth first search for the requested
 * package and return the resolved version.
 */
function getPackageVersion(
    packageLock: PackageDefinition, name: string): string|undefined {
  if (!packageLock.dependencies) {
    return undefined;
  }

  if (packageLock.dependencies[name]) {
    return packageLock.dependencies[name].version;
  }

  let result;
  for (const dep of Object.keys(packageLock.dependencies)) {
    result = getPackageVersion(packageLock.dependencies[dep], name);
    if (result) {
      return result;
    }
  }

  return undefined;
}

/**
 * Synchronously rewrites JS to replace import declarations using bare module
 * specifiers with equivalent absolute paths. For example, `import
 * '@polymer/polymer/path'` will be rewritten as `import
 * '/@polymer/polymer@3.0.0/path'`.
 */
export function rewriteBareModuleSpecifiers(
    code: string, packageLock: PackageDefinition, rootPackage: string): string {
  const jsAST = babelParser.parse(
      code, {sourceType: 'module', plugins: ['dynamicImport']});
  for (const node of jsAST.program.body) {
    if ((node.type === 'ImportDeclaration' ||
         node.type === 'ExportNamedDeclaration' ||
         node.type === 'ExportAllDeclaration') &&
        node.source) {
      if (isBareModuleSpecifier(node.source.value)) {
        const parsedPackage = parsePackageName(node.source.value);
        const version = getPackageVersion(packageLock, parsedPackage.package);
        const versionString = version ? '@' + version : '';
        const queryString = rootPackage ? '?' + rootPackage : '';
        node.source.value = `/${parsedPackage.package}${versionString}${
            parsedPackage.path}${queryString}`;
      } else {
        // Append rootPackage to relative URLs.
        const parsedUrl = url.parse(node.source.value);
        if (!parsedUrl.protocol) {
          parsedUrl.search = rootPackage || '';
          node.source.value = url.format(parsedUrl);
        }
      }
    }
  }

  const outputJs = babelGenerate(jsAST, {retainLines: true}, code);
  return outputJs.code;
}

/**
 * Transform stream for HTML content that finds module scripts (<script
 * type="module">) and rewrites bare module specifiers. Stream must be string
 * encoded (eg. 'utf8').
 */
export class HTMLRewriter extends RewritingStream {
  constructor(
      packageLock: PackageDefinition,
      pathFromPackageRoot = '/',
      rootPackage = '') {
    super();

    let insideModuleScript = false;

    this.on('startTag', (startTag) => {
      if (startTag.tagName === 'script') {
        const typeAttribute = startTag.attrs.find(({name}) => name === 'type');
        if (typeAttribute && typeAttribute.value === 'module') {
          insideModuleScript = true;
        }

        // Inspect all <script> tags with src= attributes to rewrite URLs as
        // needed.
        const srcAttribute = startTag.attrs.find(({name}) => name === 'src');
        if (srcAttribute) {
          const parsedUrl = url.parse(srcAttribute.value);
          if (!parsedUrl.protocol && parsedUrl.pathname) {
            // Rewrite any references to /node_modules/ as absolute paths.
            if (url.resolve(pathFromPackageRoot, parsedUrl.pathname)
                    .startsWith('/node_modules/')) {
              parsedUrl.pathname =
                  parsedUrl.pathname.replace(/(\.?\.\/)+node_modules/, '');
            }

            // Append rootPackage query parameter.
            parsedUrl.search = rootPackage || '';
            srcAttribute.value = url.format(parsedUrl);
          }
        }
      }
      this.emitStartTag(startTag);
    });

    this.on('endTag', (endTag) => {
      if (insideModuleScript && endTag.tagName === 'script') {
        insideModuleScript = false;
      }
      this.emitEndTag(endTag);
    });

    this.on('text', (_, raw) => {
      if (insideModuleScript) {
        this.emitRaw(
            rewriteBareModuleSpecifiers(raw, packageLock, rootPackage));
      } else {
        this.emitRaw(raw);
      }
    });
  }
}
