import * as url from 'url';

/**
 * Mapping from input URLs to the demo service to unpkg equivalent URLs. This
 * allows us to support custom syntax (none currently).
 */
export function resolveToUnpkg(href: string): string {
  return url.resolve('https://unpkg.com', href);
}
