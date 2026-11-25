import { describe, expect, it } from 'vitest';
import { createHandler, toApiRequest } from '../src/lambda';
import { MemoryRepo } from '../src/memoryRepo';

describe('function URL adapter', () => {
  it('maps the event to a request', () => {
    const req = toApiRequest({
      rawPath: '/team',
      rawQueryString: 'since=4&x=a%20b',
      headers: { Authorization: 'Bearer abc' },
      body: Buffer.from('{"a":1}').toString('base64'),
      isBase64Encoded: true,
      requestContext: { http: { method: 'get' } },
    });
    expect(req).toEqual({
      method: 'GET',
      path: '/team',
      query: { since: '4', x: 'a b' },
      headers: { authorization: 'Bearer abc' },
      body: '{"a":1}',
    });
  });

  it('returns JSON that is never cached', async () => {
    const handler = createHandler({ repo: new MemoryRepo(), now: () => new Date() });
    const res = await handler({
      rawPath: '/teams',
      body: JSON.stringify({ name: 'Team', displayName: 'Kim' }),
      requestContext: { http: { method: 'POST' } },
    });
    expect(res.statusCode).toBe(201);
    expect(res.headers).toEqual({ 'content-type': 'application/json', 'cache-control': 'no-store' });
    expect(JSON.parse(res.body)).toHaveProperty('token');
  });
});
