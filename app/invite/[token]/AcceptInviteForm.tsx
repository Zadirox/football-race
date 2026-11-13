'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Notice } from '@/components/ui/Panel';
import { SearchSelect, type SearchSelectOption } from '@/components/ui/SearchSelect';
import { acceptInviteAction, type InviteActionResult } from '@/lib/actions/invites';

type Props = {
  token: string;
  nickname: string;
  teams: SearchSelectOption[];
  clubs: SearchSelectOption[];
  players: SearchSelectOption[];
};

export function AcceptInviteForm({ token, nickname, teams, clubs, players }: Props) {
  const [state, formAction, pending] = useActionState<InviteActionResult | null, FormData>(acceptInviteAction, null);

  if (state?.ok) {
    return (
      <div>
        <Notice tone="info">
          {state.message ?? 'Аккаунт создан.'} Ник для входа: <strong>{state.nickname ?? nickname}</strong>
        </Notice>
        <div style={{ marginTop: 16 }}>
          <Link href="/login" className="btn btn--primary btn--block">
            Перейти ко входу
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} noValidate>
      <input type="hidden" name="token" value={token} />

      <div className="field">
        <label htmlFor="nickname">Ник</label>
        <input id="nickname" className="input" type="text" value={nickname} disabled readOnly />
      </div>

      <div className="field">
        <label htmlFor="password">Придумай пароль</label>
        <input
          id="password"
          name="password"
          className="input"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="Минимум 8 символов"
        />
      </div>

      <SearchSelect
        name="favoriteNationalTeamId"
        label="Любимая сборная"
        options={teams}
        placeholder="Начните вводить название сборной"
        required
      />
      <SearchSelect
        name="favoriteClubId"
        label="Любимый клуб"
        options={clubs}
        placeholder="Начните вводить название клуба"
        required
      />
      <SearchSelect
        name="favoritePlayerId"
        label="Любимый игрок"
        options={players}
        placeholder="Начните вводить имя игрока"
        required
      />

      <button type="submit" className="btn btn--primary btn--block" disabled={pending}>
        {pending ? 'Активируем…' : 'Активировать и войти в сезон'}
      </button>

      {state && !state.ok && (
        <div style={{ marginTop: 14 }}>
          <Notice tone="danger">{state.message}</Notice>
        </div>
      )}
    </form>
  );
}
