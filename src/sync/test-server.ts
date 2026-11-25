// Test helper (not a test file): an API client wired to the real server code in memory.
import { handle } from '../../server/src/api';
import { MemoryRepo } from '../../server/src/memoryRepo';
import { createApiClient } from './api';

export interface TestServer {
  /** A client as one phone sees the server. Set `online = false` to cut its connection. */
  client(): { api: ReturnType<typeof createApiClient>; net: { online: boolean; beforeSend?: (method: string, path: string) => void } };
}

export function testServer(): TestServer {
  const deps = { repo: new MemoryRepo(), now: () => new Date() };
  return {
    client() {
      const net: { online: boolean; beforeSend?: (method: string, path: string) => void } = { online: true };
      const fetchFn = async (url: string, init: RequestInit) => {
        if (!net.online) throw new TypeError('Network request failed');
        const u = new URL(url);
        net.beforeSend?.(init.method ?? 'GET', u.pathname);
        const res = await handle(
          {
            method: init.method ?? 'GET',
            path: u.pathname,
            query: Object.fromEntries(u.searchParams),
            headers: Object.fromEntries(
              Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]),
            ),
            body: typeof init.body === 'string' ? init.body : undefined,
          },
          deps,
        );
        return new Response(res.body === null ? null : JSON.stringify(res.body), { status: res.status });
      };
      return { api: createApiClient('https://api.test', fetchFn), net };
    },
  };
}
