import { createHash, randomBytes } from 'crypto';

/**
 * Инвайт-логика: детерминированный служебный email для входа по нику
 * (Supabase Auth требует email, пользователь его не видит) и одноразовые
 * токены приглашений.
 */

export function normalizeNickname(nickname: string): string {
  return nickname.normalize('NFC').trim();
}

export function validateNickname(nickname: string): string | null {
  const n = normalizeNickname(nickname);
  if (n.length < 2 || n.length > 24) return 'Ник должен быть от 2 до 24 символов';
  return null;
}

/** Служебный email для ник-логина. Детерминирован: тот же ник → тот же email. */
export function syntheticEmailForNickname(nickname: string): string {
  const norm = normalizeNickname(nickname).toLowerCase();
  const hash = createHash('sha256').update(norm, 'utf8').digest('hex').slice(0, 32);
  return `n-${hash}@players.football-race.local`;
}

export function generateInviteToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
