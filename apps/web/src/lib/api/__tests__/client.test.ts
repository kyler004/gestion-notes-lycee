import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { apiRequest, registerApiAuthBridge } from '../client';
import { ApiError, NetworkError } from '../errors';

describe('API fetch client', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('injects Authorization header and validates response with Zod schema', async () => {
    registerApiAuthBridge({
      getAccessToken: () => 'access-token-1',
      refreshAccessToken: async () => null,
    });

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    globalThis.fetch = fetchMock;

    const result = await apiRequest('/api/test', {
      schema: z.object({ ok: z.boolean() }),
    });

    expect(result).toEqual({ ok: true });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer access-token-1');
  });

  it('performs a single-flight refresh on concurrent 401 responses and retries once', async () => {
    let token = 'expired-token';
    const refreshMock = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 15));
      token = 'fresh-token';
      return token;
    });

    registerApiAuthBridge({
      getAccessToken: () => token,
      refreshAccessToken: refreshMock,
    });

    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const headers = init?.headers as Headers;
      if (headers.get('Authorization') === 'Bearer fresh-token') {
        return new Response(JSON.stringify({ data: 'ok' }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Expired' } }),
        { status: 401 },
      );
    });
    globalThis.fetch = fetchMock;

    const schema = z.object({ data: z.string() });
    const [r1, r2, r3] = await Promise.all([
      apiRequest('/api/a', { schema }),
      apiRequest('/api/b', { schema }),
      apiRequest('/api/c', { schema }),
    ]);

    expect(r1.data).toBe('ok');
    expect(r2.data).toBe('ok');
    expect(r3.data).toBe('ok');
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it('maps 429 backend errors and retry-after header to ApiError', async () => {
    registerApiAuthBridge({
      getAccessToken: () => null,
      refreshAccessToken: async () => null,
    });

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Trop de requêtes' } }),
        { status: 429, headers: { 'retry-after': '45' } },
      ),
    );

    await expect(apiRequest('/api/auth/login', { auth: false })).rejects.toMatchObject({
      name: 'ApiError',
      status: 429,
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfterSeconds: 45,
    } satisfies Partial<ApiError>);
  });

  it('throws NetworkError when fetch rejects', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(apiRequest('/api/health', { auth: false })).rejects.toBeInstanceOf(NetworkError);
  });
});
