import * as url from 'url';

export function proxy(href: string): string {
  if (href.endsWith('.html')) {
    return url.resolve('https://unpkg.com', href);
  }
  return url.resolve('https://unpkg.com', href);
}
