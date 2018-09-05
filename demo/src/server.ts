import {https} from 'follow-redirects';
import getStream from 'get-stream';
import {IncomingMessage} from 'http';
import Koa from 'koa';
import koaCompress from 'koa-compress';
import url from 'url';

import {HTMLRewriter, jsRewrite, PackageJson, parsePackageName} from './html-rewriter';
import {proxy} from './proxy';

export class RawService {
  app = new Koa();
  private port = process.env.PORT || 8080;

  async initalize() {
    this.app.use(koaCompress());

    this.app.use(this.handleRequest.bind(this));

    return this.app.listen(this.port, () => {
      console.log(`Listening on port ${this.port}`);
    });
  }

  async handleRequest(ctx: Koa.Context, _next: () => {}) {
    if (ctx.url === '/sw.js' || ctx.url === '/favicon.ico') {
      return;
    }

    const proxiedUrl = proxy(ctx.url);
    // Get package.json.
    const packageName = parsePackageName(ctx.url.substring(1)).package;
    const packageJsonResponse = await this._fetch(
        url.resolve('https://unpkg.com', `${packageName}/package.json`));
    let packageJson: PackageJson = {};
    try {
      packageJson = JSON.parse(await getStream(packageJsonResponse));
    } catch {
      console.log(`Unable to parse package.json. Original request ${ctx.url}`);
      return;
    }

    const response = await this._fetch(proxiedUrl);
    const contentType = response.headers['content-type'] || '';
    ctx.set('Content-Type', contentType);

    if (contentType.startsWith('application/javascript')) {
      ctx.response.body = jsRewrite(await getStream(response), packageJson);
    } else if (contentType.startsWith('text/html')) {
      ctx.response.body =
          response.setEncoding('utf8').pipe(new HTMLRewriter(packageJson));
    }
  }

  _fetch(url: string): Promise<IncomingMessage> {
    return new Promise((resolve) => {
      https.get(url, (response: IncomingMessage) => {
        resolve(response);
      });
    });
  }
}

if (!module.parent) {
  const raw = new RawService();
  raw.initalize();
}
