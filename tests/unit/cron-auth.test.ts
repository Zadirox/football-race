import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cronAuthorized } from '@/lib/cron/auth';

const SECRET = 'cron-secret-for-tests';

function request(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { headers });
}

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe('защита cron-роутов', () => {
  it('пускает с Bearer-токеном', () => {
    expect(cronAuthorized(request('https://game.test/api/cron/sync-fixtures', { authorization: `Bearer ${SECRET}` }))).toBe(
      true,
    );
  });

  it('пускает с секретом в query', () => {
    expect(cronAuthorized(request(`https://game.test/api/cron/sync-fixtures?secret=${SECRET}`))).toBe(true);
  });

  it('не пускает с чужим секретом', () => {
    expect(cronAuthorized(request('https://game.test/api/cron/sync-fixtures?secret=nope'))).toBe(false);
    expect(
      cronAuthorized(request('https://game.test/api/cron/sync-fixtures', { authorization: 'Bearer nope' })),
    ).toBe(false);
  });

  it('не пускает без заголовка', () => {
    expect(cronAuthorized(request('https://game.test/api/cron/sync-fixtures'))).toBe(false);
  });

  it('без CRON_SECRET роут закрыт полностью', () => {
    delete process.env.CRON_SECRET;
    expect(cronAuthorized(request('https://game.test/api/cron/sync-fixtures?secret='))).toBe(false);
  });
});
