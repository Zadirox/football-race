'use client';

import { useActionState } from 'react';
import { Notice } from '@/components/ui/Panel';
import { signInAction, type AuthResult } from '@/lib/auth/actions';

/**
 * Форма входа. Состояние приходит из server action (`useActionState`),
 * поэтому пароль не проходит через клиентскую логику и не оседает в стейте.
 */
export function LoginForm({ configured }: { configured: boolean }) {
  const [state, formAction, pending] = useActionState<AuthResult | null, FormData>(signInAction, null);

  return (
    <>
      <form action={formAction} noValidate>
        <div className="field">
          <label htmlFor="email">Почта</label>
          <input
            id="email"
            name="email"
            className="input"
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
          />
        </div>

        <div className="field">
          <label htmlFor="password">Пароль</label>
          <input
            id="password"
            name="password"
            className="input"
            type="password"
            autoComplete="current-password"
            required
            minLength={8}
            placeholder="••••••••"
          />
        </div>

        <button type="submit" className="btn btn--primary btn--block" disabled={pending}>
          {pending ? 'Проверяем…' : configured ? 'Войти' : 'Войти (демо)'}
        </button>
      </form>

      {state && !state.ok && (
        <div style={{ marginTop: 16 }}>
          <Notice tone="info">{state.message}</Notice>
        </div>
      )}

      {!configured && (
        <div style={{ marginTop: 12 }}>
          <Notice tone="info">
            Supabase Auth ещё не подключён: в демо-режиме игра идёт от админа сезона, вход не нужен.
          </Notice>
        </div>
      )}
    </>
  );
}
