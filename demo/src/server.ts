import {https} from 'follow-redirects';
import getStream from 'get-stream';
import {IncomingMessage} from 'http';
import Koa from 'koa';
import koaCompress from 'koa-compress';

import {HTMLRewriter, parsePackageName, rewriteBareModuleSpecifiers} from './html-rewriter';
import {PackageLockGenerator} from './package-lock-generator';
import {resolveToUnpkg} from './proxy';

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
 * Another notable difference in behavior from unpkg.com is that requests with
 * specified semvers are not redirected with a 302 status code. Instead, these
 * are internally resolved, which helps ensure consistency of request URLs. This
 * is important as the import spec
 * (https://html.spec.whatwg.org/multipage/webappapis.html#fetching-scripts)
 * defines that module maps are keyed with request URLs, not response URLs.
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

    await this.packageLockGenerator.init();

    return this.app.listen(this.port, () => {
      console.log(`Demo service listening on port ${this.port}`);
    });
  }

  async handleRequest(ctx: Koa.Context, _next: () => {}) {
    if (ctx.url === '/sw.js' || ctx.url === '/favicon.ico') {
      return;
    }

    const proxiedUrl = resolveToUnpkg(ctx.url);
    const parsedPackage = parsePackageName(ctx.url.substring(1));
    const rootPackage = ctx.querystring || parsedPackage.package;

    const packageLock = await this.packageLockGenerator.get(rootPackage);

    // const packageJsonResponse = await this.fetch(url.resolve(
    //     'https://unpkg.com', `${parsedPackage.package}/package.json`));
    // let packageJson: PackageJson = {};
    // try {
    //   packageJson = JSON.parse(await getStream(packageJsonResponse));
    // } catch {
    //   console.log(`Unable to parse package.json. Original request
    //   ${ctx.url}`); return;
    // }

    const response = await this.fetch(proxiedUrl);
    const contentType = response.headers['content-type'] || '';
    ctx.set('Content-Type', contentType);

    if (contentType.startsWith('application/javascript')) {
      ctx.response.body = rewriteBareModuleSpecifiers(
          await getStream(response), packageLock, rootPackage);
    } else if (contentType.startsWith('text/html')) {
      ctx.response.body = response.setEncoding('utf8').pipe(
          new HTMLRewriter(packageLock, parsedPackage.path, rootPackage));
    }
  }

  private fetch(url: string): Promise<IncomingMessage> {
    return new Promise((resolve) => {
      https.get(url, (response: IncomingMessage) => {
        resolve(response);
      });
    });
  }
}
