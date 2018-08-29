import Koa from 'koa';

import koaCompress from 'koa-compress';

export class RawService {
  app = new Koa();
  private port = process.env.PORT || 8080;

  async initalize() {
    this.app.use(koaCompress());

    return this.app.listen(this.port, () => {
      console.log(`Listening on port ${this.port}`);
    });
  }
}

if (!module.parent) {
  const raw = new RawService();
  raw.initalize();
}
