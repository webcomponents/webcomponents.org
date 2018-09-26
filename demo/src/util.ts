import {https} from 'follow-redirects';
import {IncomingMessage} from 'http';

export function fetch(url: string): Promise<IncomingMessage> {
  return new Promise((resolve) => {
    https.get(url, (response: IncomingMessage) => {
      resolve(response);
    });
  });
}
