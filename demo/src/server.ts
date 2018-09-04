import {IncomingMessage} from 'http';
import * as https from 'https';
import Koa from 'koa';
import koaCompress from 'koa-compress';

import {HTMLRewriter} from './html-rewriter';
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

    // TODO: Request package.json and pass that into the HTML rewriter.
    const proxiedUrl = proxy(ctx.url);
    const response = await this._fetch(proxiedUrl);
    ctx.set('Content-Type', response.headers['content-type'] || '');
    ctx.response.body = response.setEncoding('utf8').pipe(new HTMLRewriter());
  }

  _fetch(url: string): Promise<IncomingMessage> {
    return new Promise((resolve) => {
      https.get(url, (response) => {
        resolve(response);
      });
    });
  }
}

if (!module.parent) {
  const raw = new RawService();
  raw.initalize();
}
