'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Notice, SectionTitle } from '@/components/ui/Panel';
import {
  createInviteAction,
  revokeInviteAction,
  type AdminInviteView,
} from '@/lib/actions/invites';

function fmt(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Moscow',
  });
}

export function InvitesAdmin({ enabled, invites }: { enabled: boolean; invites: AdminInviteView[] }) {
  const router = useRouter();
  const [nickname, setNickname] = useState('');
  const [pending, startTransition] = useTransition();
  const [createdLink, setCreatedLink] = useState<{ nickname: string; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const onCreate = () => {
    if (!enabled || pending) return;
    setError(null);
    setCreatedLink(null);
    setCopied(false);
    startTransition(async () => {
      const res = await createInviteAction(nickname);
      if (!res.ok || !res.token) {
        setError(res.message ?? 'Не удалось создать приглашение');
        return;
      }
      const url = `${window.location.origin}/invite/${res.token}`;
      setCreatedLink({ nickname: res.nickname ?? nickname.trim(), url });
      setNickname('');
      router.refresh();
    });
  };

  const onRevoke = (id: string) => {
    if (!enabled || pending) return;
    setError(null);
    startTransition(async () => {
      const res = await revokeInviteAction(id);
      if (!res.ok) {
        setError(res.message ?? 'Не удалось отозвать');
        return;
      }
      router.refresh();
    });
  };

  const onCopy = async () => {
    if (!createdLink) return;
    try {
      await navigator.clipboard.writeText(createdLink.url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <>
      <SectionTitle>Приглашения</SectionTitle>
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 className="card__title">Одноразовая ссылка по нику</h3>
        <p className="card__meta" style={{ marginBottom: 12 }}>
          Задайте ник — будет создана одноразовая ссылка. Друг перейдёт по ней, задаст пароль и попадёт в активный сезон
          как игрок. Почта не нужна, повторно по ссылке войти нельзя.
        </p>

        {!enabled && (
          <div style={{ marginBottom: 12 }}>
            <Notice>Включится после подключения БД.</Notice>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
          <div className="field" style={{ flex: '1 1 220px', marginBottom: 0 }}>
            <label htmlFor="invite-nick">Ник игрока</label>
            <input
              id="invite-nick"
              className="input"
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Например: Артём"
              disabled={!enabled || pending}
              maxLength={24}
            />
          </div>
          <button type="button" className="btn btn--primary" onClick={onCreate} disabled={!enabled || pending || nickname.trim().length < 2}>
            {pending ? 'Создаём…' : 'Создать ссылку'}
          </button>
        </div>

        {error && (
          <div style={{ marginBottom: 12 }}>
            <Notice tone="danger">{error}</Notice>
          </div>
        )}

        {createdLink && (
          <div style={{ marginBottom: 16 }}>
            <Notice tone="info">
              Ссылка для <strong>{createdLink.nickname}</strong> создана. Скопируйте и отправьте другу — она показывается
              один раз.
            </Notice>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <input className="input" type="text" readOnly value={createdLink.url} style={{ flex: '1 1 320px' }} />
              <button type="button" className="btn" onClick={onCopy}>
                {copied ? 'Скопировано' : 'Копировать'}
              </button>
            </div>
          </div>
        )}

        <div className="list">
          {invites.length === 0 ? (
            <p className="card__text">Приглашений пока нет.</p>
          ) : (
            invites.map((inv) => {
              const status = inv.usedAt ? 'использовано' : 'активно';
              return (
                <div key={inv.id} className="list-row">
                  <span className={`chip ${inv.usedAt ? 'chip--muted' : 'chip--positive'}`}>{status}</span>
                  <span className="list-row__main">
                    <span className="list-row__title">{inv.nickname}</span>
                    <span className="list-row__meta">
                      создано {fmt(inv.createdAt)} МСК
                      {inv.usedAt ? ` · использовано ${fmt(inv.usedAt)}` : ''}
                    </span>
                  </span>
                  {!inv.usedAt && (
                    <button
                      type="button"
                      className="btn btn--sm"
                      disabled={!enabled || pending}
                      onClick={() => onRevoke(inv.id)}
                    >
                      Отозвать
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
