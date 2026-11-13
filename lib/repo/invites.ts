import { createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { db } from '@/lib/db';
import { hasDatabase, serverEnv } from '@/lib/env';
import { AppError } from '@/lib/errors';
import {
  generateInviteToken,
  hashInviteToken,
  normalizeNickname,
  syntheticEmailForNickname,
  validateNickname,
} from '@/lib/auth/invite';
import { favoritesExist, type FavoritesPayload } from '@/lib/repo/reference-data';

export type AdminInviteView = {
  id: string;
  nickname: string;
  role: string;
  createdAt: string;
  expiresAt: string | null;
  usedAt: string | null;
  usedBy: string | null;
  seasonId: string;
};

export type PublicInviteView = {
  nickname: string;
  seasonTitle: string;
  expiresAt: string | null;
  used: boolean;
  expired: boolean;
};

function requireServiceClient() {
  const env = serverEnv();
  if (!env.supabaseUrl || !env.supabaseServiceKey) {
    throw new AppError('CONFIG_MISSING', 'Нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(env.supabaseUrl, env.supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function getActiveSeasonId(): Promise<string> {
  const sql = db();
  const [season] = await sql<{ id: string }[]>`
    select id from seasons where status = 'active' order by starts_on desc limit 1
  `;
  if (!season) throw new AppError('CONFIG_MISSING', 'Нет активного сезона');
  return season.id;
}

export async function createInvite(nicknameRaw: string): Promise<{ token: string; nickname: string }> {
  if (!hasDatabase()) throw new AppError('CONFIG_MISSING', 'База не подключена');
  const nicknameError = validateNickname(nicknameRaw);
  if (nicknameError) throw new AppError('INVALID_INPUT', nicknameError);
  const nickname = normalizeNickname(nicknameRaw);

  const sql = db();
  const seasonId = await getActiveSeasonId();

  // Ник не должен быть занят существующим профилем
  const [existingProfile] = await sql<{ id: string }[]>`
    select id from profiles where lower(nickname) = lower(${nickname}) limit 1
  `;
  if (existingProfile) {
    throw new AppError('CONFLICT', `Ник «${nickname}» уже занят`);
  }

  const token = generateInviteToken();
  const tokenHash = hashInviteToken(token);

  // Отзываем/заменяем старые неиспользованные инвайты для этого ника в сезоне
  await sql`
    delete from invites
    where season_id = ${seasonId}
      and lower(nickname) = lower(${nickname})
      and used_at is null
  `;

  await sql`
    insert into invites (token_hash, nickname, season_id, role)
    values (${tokenHash}, ${nickname}, ${seasonId}, 'player'::user_role)
  `;

  return { token, nickname };
}

export async function listInvites(): Promise<AdminInviteView[]> {
  if (!hasDatabase()) return [];
  const sql = db();
  const rows = await sql<{
    id: string;
    nickname: string;
    role: string;
    created_at: Date | string;
    expires_at: Date | string | null;
    used_at: Date | string | null;
    used_by: string | null;
    season_id: string;
  }[]>`
    select id, nickname, role, created_at, expires_at, used_at, used_by, season_id
    from invites
    order by created_at desc
    limit 100
  `;
  return rows.map((r) => ({
    id: r.id,
    nickname: r.nickname,
    role: r.role,
    createdAt: new Date(r.created_at).toISOString(),
    expiresAt: r.expires_at ? new Date(r.expires_at).toISOString() : null,
    usedAt: r.used_at ? new Date(r.used_at).toISOString() : null,
    usedBy: r.used_by,
    seasonId: r.season_id,
  }));
}

export async function revokeInvite(inviteId: string): Promise<void> {
  if (!hasDatabase()) throw new AppError('CONFIG_MISSING', 'База не подключена');
  const sql = db();
  const [row] = await sql<{ id: string }[]>`
    delete from invites where id = ${inviteId} and used_at is null returning id
  `;
  if (!row) throw new AppError('NOT_FOUND', 'Приглашение не найдено или уже использовано');
}

export async function getInviteByToken(token: string): Promise<PublicInviteView | null> {
  if (!hasDatabase()) return null;
  const tokenHash = hashInviteToken(token);
  const sql = db();
  const [row] = await sql<{
    nickname: string;
    expires_at: Date | string | null;
    used_at: Date | string | null;
    season_title: string;
  }[]>`
    select i.nickname, i.expires_at, i.used_at, s.title as season_title
    from invites i
    join seasons s on s.id = i.season_id
    where i.token_hash = ${tokenHash}
    limit 1
  `;
  if (!row) return null;
  const expired = row.expires_at ? new Date(row.expires_at).getTime() < Date.now() : false;
  return {
    nickname: row.nickname,
    seasonTitle: row.season_title,
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    used: row.used_at !== null,
    expired,
  };
}

export async function acceptInvite(
  token: string,
  password: string,
  favorites: FavoritesPayload,
): Promise<{ ok: true; nickname: string } | { ok: false; message: string }> {
  if (!hasDatabase()) return { ok: false, message: 'База не подключена' };
  if (password.length < 8) return { ok: false, message: 'Пароль должен быть не короче 8 символов' };
  if (!favorites.favoriteClubId || !favorites.favoriteNationalTeamId || !favorites.favoritePlayerId) {
    return { ok: false, message: 'Выберите любимый клуб, сборную и игрока' };
  }
  const favsOk = await favoritesExist(favorites);
  if (!favsOk) return { ok: false, message: 'Выбранные клуб, сборная или игрок не найдены' };

  const tokenHash = hashInviteToken(token);
  const sql = db();

  // Читаем и валидируем инвайт
  const [invite] = await sql<{
    id: string;
    nickname: string;
    season_id: string;
    role: string;
    expires_at: Date | string | null;
    used_at: Date | string | null;
  }[]>`
    select id, nickname, season_id, role, expires_at, used_at
    from invites
    where token_hash = ${tokenHash}
    limit 1
  `;

  if (!invite) return { ok: false, message: 'Ссылка недействительна' };
  if (invite.used_at) return { ok: false, message: 'Ссылка уже использована' };
  if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
    return { ok: false, message: 'Срок действия ссылки истёк' };
  }

  const nickname = normalizeNickname(invite.nickname);
  const nickErr = validateNickname(nickname);
  if (nickErr) return { ok: false, message: nickErr };

  // Ник не занят
  const [existing] = await sql<{ id: string }[]>`
    select id from profiles where lower(nickname) = lower(${nickname}) limit 1
  `;
  if (existing) return { ok: false, message: `Ник «${nickname}» уже занят` };

  const admin = requireServiceClient();
  const email = syntheticEmailForNickname(nickname);

  // Создаём auth-пользователя (служебный email)
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nickname },
  });

  if (createError || !created.user) {
    const msg = createError?.message ?? 'Не удалось создать пользователя';
    if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('registered')) {
      return { ok: false, message: 'Аккаунт с таким ником уже существует' };
    }
    return { ok: false, message: 'Не удалось создать аккаунт. Попробуйте ещё раз' };
  }

  const userId = created.user.id;

  try {
    await sql.begin(async (tx) => {
      await tx`
        insert into profiles (
          id, nickname, role, favorite_club_id, favorite_national_team_id, favorite_player_id
        )
        values (
          ${userId}::uuid,
          ${nickname},
          ${invite.role}::user_role,
          ${favorites.favoriteClubId}::uuid,
          ${favorites.favoriteNationalTeamId}::uuid,
          ${favorites.favoritePlayerId}::uuid
        )
        on conflict (id) do update set
          nickname = excluded.nickname,
          role = excluded.role,
          favorite_club_id = excluded.favorite_club_id,
          favorite_national_team_id = excluded.favorite_national_team_id,
          favorite_player_id = excluded.favorite_player_id
      `;

      await tx`
        insert into season_players (season_id, profile_id, is_active)
        values (${invite.season_id}::uuid, ${userId}::uuid, true)
        on conflict (season_id, profile_id) do update set is_active = true
      `;

      // Атомарно помечаем инвайт использованным (защита от гонки) после создания профиля,
      // т.к. invites.used_by ссылается на profiles(id).
      const [claimed] = await tx<{ id: string }[]>`
        update invites
        set used_at = now(), used_by = ${userId}::uuid
        where id = ${invite.id}::uuid and used_at is null
        returning id
      `;
      if (!claimed) throw new Error('INVITE_USED');
    });
  } catch (e) {
    // Откат auth-пользователя при ошибке записи профиля/инвайта
    try {
      await admin.auth.admin.deleteUser(userId);
    } catch {
      // best-effort cleanup
    }
    if (e instanceof Error && e.message === 'INVITE_USED') {
      return { ok: false, message: 'Ссылка уже использована' };
    }
    const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code?: unknown }).code) : '';
    console.error('Ошибка активации инвайта:', { code, error: e });
    if (code === '23503') {
      return { ok: false, message: 'Не удалось сохранить выбранные клуб/сборную/игрока. Обновите страницу и попробуйте ещё раз.' };
    }
    if (code === '23505') {
      return { ok: false, message: 'Этот ник или приглашение уже используется. Попробуйте войти или запросите новую ссылку.' };
    }
    return { ok: false, message: 'Не удалось завершить регистрацию. Попробуйте ещё раз' };
  }

  return { ok: true, nickname };
}
