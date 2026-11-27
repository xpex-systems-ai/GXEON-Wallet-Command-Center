import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { parseBody, RequestBodyTooLargeError } from './_helper.js';

function streamRequest(chunks: string[]) {
  const req = new EventEmitter() as EventEmitter & { pause: () => void };
  req.pause = () => undefined;
  queueMicrotask(() => {
    for (const chunk of chunks) req.emit('data', Buffer.from(chunk));
    req.emit('end');
  });
  return req;
}

describe('parseBody request-size protection', () => {
  it('parses a valid streamed JSON body under the limit', async () => {
    await expect(parseBody(streamRequest(['{"ok":', 'true}']), 32)).resolves.toEqual({ ok: true });
  });

  it('rejects streamed bodies as soon as the byte limit is crossed', async () => {
    await expect(parseBody(streamRequest(['{"value":"1234567890"}']), 8))
      .rejects.toBeInstanceOf(RequestBodyTooLargeError);
  });

  it('rejects already-parsed bodies over the byte limit', async () => {
    await expect(parseBody({ body: { value: '1234567890' } }, 8))
      .rejects.toBeInstanceOf(RequestBodyTooLargeError);
  });

  it('counts UTF-8 bytes rather than JavaScript characters', async () => {
    await expect(parseBody({ body: '{"value":"á"}' }, 12))
      .rejects.toBeInstanceOf(RequestBodyTooLargeError);
  });
});
