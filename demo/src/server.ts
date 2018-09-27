import getStream from 'get-stream';
import Koa from 'koa';
import koaCompress from 'koa-compress';

import {HTMLRewriter, parsePackageName, rewriteBareModuleSpecifiers} from './html-rewriter';
import {PackageLockGenerator} from './package-lock-generator';
import {resolveToUnpkg} from './proxy';
import {fetch} from './util';

/**
 * Demo microservice which can serve HTML demos containing bare module import
 * specifiers from NPM packages.
 *
 * This microservice has the same API surface as
 * unpkg.com and is designed to be a substitute wrapper for unpkg.com. Notably,
 * it does not user the `?module` parameter and instead always rewrites bare
 * module specifiers to paths. `import` statements inside `<script
 * type="module">` are rewritten to convert any bare module specifiers to paths.
 * If there are semver ranges specified in the package's package.json, these
 * will be inserted into the paths to ensure a compatible version of the package
 * is fetched.
 *
 * This microservice also uses a package-lock generator to resolve all package
 * versions. For example, if requesting a HTML file within package 'foo' that
 * depends on dependencies and devDependencies, each module will be resolved by
 * effectively installing 'foo' and resolving each dependency against what would
 * be installed.
 */
export class DemoService {
  private app = new Koa();
  private port: number;
  private packageLockGenerator = new PackageLockGenerator();

  constructor(port: number) {
    this.port = port;
  }

  async initalize() {
    this.app.use(koaCompress());

    this.app.use(this.handleRequest.bind(this));

    this.app.listen(this.port, () => {
      console.log(`Demo service listening on port ${this.port}`);
    });
  }

  async handleRequest(ctx: Koa.Context, _next: () => {}) {
    if (ctx.url === '/favicon.ico') {
      return;
    }

    const parsedPackage = parsePackageName(ctx.url.substring(1));
    // Root package is specified as ?@scope/package@1.0.0. If unspecified, the
    // current requested package is used as the root resolver for subsequent
    // requests.
    const rootPackage = ctx.querystring || parsedPackage.package;
    const packageLock = await this.packageLockGenerator.get(rootPackage);
    if (!packageLock) {
      ctx.response.status = 400;
      ctx.response.body = `Invalid package version '${
          rootPackage}'. Must be specifed as @scope/package@1.0.0.`;
      return;
    }

    const proxiedUrl = resolveToUnpkg(ctx.url);
    const response = await fetch(proxiedUrl);
    const contentType = response.headers['content-type'] || '';
    ctx.set('Content-Type', contentType);
    // Since requests should always specify version, the response is effectively
    // immutable as NPM versions cannot be unpublished.
    ctx.set('Cache-Control', 'public,max-age=31536000');

    if (contentType.startsWith('application/javascript')) {
      ctx.response.body = rewriteBareModuleSpecifiers(
          await getStream(response), packageLock, rootPackage);
    } else if (contentType.startsWith('text/html')) {
      ctx.response.body = response.setEncoding('utf8').pipe(
          new HTMLRewriter(packageLock, parsedPackage.path, rootPackage));
    }
  }
}
