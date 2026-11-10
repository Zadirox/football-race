import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchFixtures } from '@/lib/data/footballData';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('клиент football-data.org', () => {
  it('шлёт токен и окно дат, возвращает матчи', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ matches: [{ id: 1 }] }));

    const result = await fetchFixtures({
      token: 'secret-token',
      from: '2026-11-11',
      to: '2026-11-16',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.matches).toHaveLength(1);
    expect(result.httpStatus).toBe(200);
    expect(result.requestsUsed).toBe(1);

    const call = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    const [url, init] = call;
    expect(url.searchParams.get('dateFrom')).toBe('2026-11-11');
    expect(url.searchParams.get('dateTo')).toBe('2026-11-16');
    expect((init.headers as Record<string, string>)['X-Auth-Token']).toBe('secret-token');
  });

  it('пустой ответ провайдера — не ошибка', async () => {
    const result = await fetchFixtures({
      token: 't',
      from: '2026-11-11',
      to: '2026-11-16',
      fetchImpl: (async () => jsonResponse({})) as unknown as typeof fetch,
    });

    expect(result.matches).toEqual([]);
  });

  it('429 — отдельный код квоты', async () => {
    const promise = fetchFixtures({
      token: 't',
      from: '2026-11-11',
      to: '2026-11-16',
      fetchImpl: (async () => jsonResponse({}, 429)) as unknown as typeof fetch,
    });

    await expect(promise).rejects.toMatchObject({ code: 'SYNC_QUOTA_EXCEEDED' });
  });

  it('500 — провайдер недоступен', async () => {
    const promise = fetchFixtures({
      token: 't',
      from: '2026-11-11',
      to: '2026-11-16',
      fetchImpl: (async () => jsonResponse({}, 500)) as unknown as typeof fetch,
    });

    await expect(promise).rejects.toMatchObject({ code: 'SYNC_PROVIDER_DOWN' });
  });

  it('сетевая ошибка не выходит наружу сырым исключением', async () => {
    const promise = fetchFixtures({
      token: 't',
      from: '2026-11-11',
      to: '2026-11-16',
      fetchImpl: (async () => {
        throw new Error('ECONNRESET');
      }) as unknown as typeof fetch,
    });

    await expect(promise).rejects.toMatchObject({ code: 'SYNC_PROVIDER_DOWN' });
  });

  it('не-JSON ответ считается ошибкой провайдера', async () => {
    const promise = fetchFixtures({
      token: 't',
      from: '2026-11-11',
      to: '2026-11-16',
      fetchImpl: (async () => new Response('<html>', { status: 200 })) as unknown as typeof fetch,
    });

    await expect(promise).rejects.toMatchObject({ code: 'SYNC_PROVIDER_DOWN' });
  });
});
