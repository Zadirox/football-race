'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Notice } from '@/components/ui/Panel';
import { acceptInviteAction, type InviteActionResult } from '@/lib/actions/invites';

export function AcceptInviteForm({ token, nickname }: { token: string; nickname: string }) {
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
