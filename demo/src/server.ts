import {https} from 'follow-redirects';
import getStream from 'get-stream';
import {IncomingMessage} from 'http';
import Koa from 'koa';
import koaCompress from 'koa-compress';

import {HTMLRewriter, jsRewrite} from './html-rewriter';
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
    if (ctx.url === '/sw.js') {
      return;
    }

    const proxiedUrl = proxy(ctx.url);
    const response = await this._fetch(proxiedUrl);
    const contentType = response.headers['content-type'] || '';
    ctx.set('Content-Type', contentType);

    if (contentType.startsWith('application/javascript')) {
      ctx.response.body = jsRewrite(await getStream(response));
    } else if (contentType.startsWith('text/html')) {
      ctx.response.body = response.setEncoding('utf8').pipe(new HTMLRewriter());
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
