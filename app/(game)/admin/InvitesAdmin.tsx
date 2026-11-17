'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Notice, SectionTitle } from '@/components/ui/Panel';
import { formatRuShortDateTimeMsk } from '@/lib/format';
import {
  createInviteAction,
  revokeInviteAction,
  type AdminInviteView,
} from '@/lib/actions/invites';

function fmt(iso: string | null): string {
  if (!iso) return '—';
  return formatRuShortDateTimeMsk(iso);
}

type InviteStatus = 'active' | 'used' | 'expired';

function statusOf(inv: AdminInviteView, now: number): InviteStatus {
  if (inv.usedAt) return 'used';
  if (inv.expiresAt && Date.parse(inv.expiresAt) <= now) return 'expired';
  return 'active';
}

export function InvitesAdmin({ enabled, invites }: { enabled: boolean; invites: AdminInviteView[] }) {
  const router = useRouter();
  const [nickname, setNickname] = useState('');
  const [pending, startTransition] = useTransition();
  const [createdLink, setCreatedLink] = useState<{ nickname: string; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState<'active' | 'used' | 'all'>('active');

  const now = Date.now();
  const decorated = useMemo(() => invites.map((inv) => ({ inv, status: statusOf(inv, now) })), [invites, now]);
  const counts = useMemo(() => ({
    active: decorated.filter((x) => x.status === 'active').length,
    used: decorated.filter((x) => x.status === 'used').length,
    expired: decorated.filter((x) => x.status === 'expired').length,
  }), [decorated]);

  const visible = useMemo(() => {
    if (filter === 'all') return decorated;
    if (filter === 'used') return decorated.filter((x) => x.status === 'used' || x.status === 'expired');
    return decorated.filter((x) => x.status === 'active');
  }, [decorated, filter]);

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
      <div className="card admin-invites" style={{ marginBottom: 24 }}>
        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <h3 className="card__title">Одноразовая ссылка по нику</h3>
            <p className="card__meta" style={{ marginBottom: 0 }}>
              Создайте ссылку для игрока — он задаст пароль и попадёт в активный сезон. Использованные и истёкшие приглашения скрыты из активного списка.
            </p>
          </div>

          {!enabled && <Notice>Включится после подключения БД.</Notice>}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: '1 1 240px', marginBottom: 0 }}>
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

          {error && <Notice tone="danger">{error}</Notice>}

          {createdLink && (
            <div>
              <Notice tone="info">
                Ссылка для <strong>{createdLink.nickname}</strong> создана. Скопируйте и отправьте — показывается один раз.
              </Notice>
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <input className="input" type="text" readOnly value={createdLink.url} style={{ flex: '1 1 320px' }} />
                <button type="button" className="btn" onClick={onCopy}>
                  {copied ? 'Скопировано' : 'Копировать'}
                </button>
              </div>
            </div>
          )}

          <div className="filters" role="group" aria-label="Фильтр приглашений">
            <button type="button" className="filter" data-active={filter === 'active'} onClick={() => setFilter('active')}>
              Активные <span className="filter__count">{counts.active}</span>
            </button>
            <button type="button" className="filter" data-active={filter === 'used'} onClick={() => setFilter('used')}>
              Использованные/истёкшие <span className="filter__count">{counts.used + counts.expired}</span>
            </button>
            <button type="button" className="filter" data-active={filter === 'all'} onClick={() => setFilter('all')}>
              Все <span className="filter__count">{invites.length}</span>
            </button>
          </div>

          <div className="admin-invites__list">
            {visible.length === 0 ? (
              <p className="card__text" style={{ margin: 0 }}>
                {invites.length === 0 ? 'Приглашений пока нет.' : filter === 'active' ? 'Нет активных приглашений — старые скрыты, их можно посмотреть во вкладке выше.' : 'В этом списке пусто.'}
              </p>
            ) : (
              visible.map(({ inv, status }) => {
                const chipClass = status === 'active' ? 'chip--positive' : status === 'expired' ? 'chip--trap' : 'chip--muted';
                const label = status === 'active' ? 'активно' : status === 'expired' ? 'истекло' : 'использовано';
                return (
                  <div key={inv.id} className="admin-invite-row">
                    <div className="admin-invite-row__main">
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span className={`chip ${chipClass}`}>{label}</span>
                        <span className="list-row__title">{inv.nickname}</span>
                      </div>
                      <span className="list-row__meta">
                        создано {fmt(inv.createdAt)} МСК
                        {inv.expiresAt ? ` · истекает ${fmt(inv.expiresAt)}` : ''}
                        {inv.usedAt ? ` · использовано ${fmt(inv.usedAt)}` : ''}
                      </span>
                    </div>
                    {status === 'active' && (
                      <button
                        type="button"
                        className="btn btn--sm btn--ghost"
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
      </div>
    </>
  );
}
