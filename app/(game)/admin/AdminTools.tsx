'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Notice, SectionTitle } from '@/components/ui/Panel';
import { formatRuShortDateTimeMsk } from '@/lib/format';
import { teamDisplay } from '@/lib/data/team-names';
import {
  awardLineupBonusAction,
  changeRoleAction,
  forceClosePendingAction,
  grantDiceAction,
  grantPackAction,
  updateMatchAction,
  type AdminRunResult,
  reviewLineupBonusAction,
} from '@/lib/actions/admin';
import type { MatchView, PlayerView, Role } from '@/lib/types';
import type { AdminManualLineupSlotView, AdminPendingView } from '@/lib/repo/admin-tools';

type Block = 'match' | 'dice' | 'pending' | 'role' | 'pack' | 'bonus';

const STATUSES: Array<MatchView['status']> = ['NS', 'LIVE', 'HT', 'FT', 'PST', 'CANC', 'ABD'];

const TIERS: Array<{ value: 'wood' | 'bronze' | 'silver' | 'gold'; label: string }> = [
  { value: 'wood', label: 'd2 (дерево)' },
  { value: 'bronze', label: 'd3 (бронза)' },
  { value: 'silver', label: 'd4 (серебро)' },
  { value: 'gold', label: 'd6 (золото)' },
];

const ROLES: Array<{ value: Role; label: string }> = [
  { value: 'player', label: 'игрок' },
  { value: 'spectator', label: 'зритель' },
  { value: 'admin', label: 'админ' },
];

const PENDING_KIND: Record<string, string> = {
  var: 'VAR',
  tactics: 'тактика',
  locker: 'раздевалка',
  passage: 'передача',
};

const ROLE_LABEL: Record<AdminManualLineupSlotView['roleGroup'], string> = {
  GK: 'вратарь',
  DEF: 'защитник',
  MID: 'полузащитник',
  FWD: 'нападающий',
};

const RARITY_LABEL: Record<AdminManualLineupSlotView['rarity'], string> = {
  common: 'Common',
  rare: 'Rare',
  epic: 'Epic',
  legend: 'Legend',
};

function scoreText(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

function expiresLabel(iso: string): string {
  return formatRuShortDateTimeMsk(iso);
}

function kickoffLabel(iso: string): string {
  return formatRuShortDateTimeMsk(iso);
}

type ToolsProps = {
  enabled: boolean;
  players: PlayerView[];
  matches: MatchView[];
  pending: AdminPendingView[];
  manualBonusSlots: AdminManualLineupSlotView[];
  cardsEnabled?: boolean;
};

/**
 * Ручные правки сезона: матч, кубики, паки, бонус состава, ожидания и роли.
 * Все кнопки — server actions, поэтому ключи провайдера и БД не попадают
 * в браузер. В демо-режиме блоки отключены и объясняют почему.
 */
export function AdminTools({ enabled, players, matches, pending, manualBonusSlots, cardsEnabled }: ToolsProps) {
  const router = useRouter();
  const [pendingTx, startTransition] = useTransition();
  const [busy, setBusy] = useState<Block | null>(null);
  const [busySlotId, setBusySlotId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<'award' | 'review' | null>(null);
  const [showReviewedBonuses, setShowReviewedBonuses] = useState(false);
  const [localSlots, setLocalSlots] = useState(manualBonusSlots);
  const [feedback, setFeedback] = useState<{ block: Block; result: AdminRunResult } | null>(null);

  useEffect(() => { setLocalSlots(manualBonusSlots); }, [manualBonusSlots]);

  const matchList = matches.slice(0, 20);
  const firstMatch = matchList[0] ?? null;

  const [matchId, setMatchId] = useState(firstMatch?.id ?? '');
  const [status, setStatus] = useState<MatchView['status']>(firstMatch?.status ?? 'NS');
  const [homeScore, setHomeScore] = useState(scoreText(firstMatch?.homeScore));
  const [awayScore, setAwayScore] = useState(scoreText(firstMatch?.awayScore));
  const [minute, setMinute] = useState(scoreText(firstMatch?.minute));

  const [diceProfile, setDiceProfile] = useState(players[0]?.profileId ?? '');
  const [diceTier, setDiceTier] = useState<'wood' | 'bronze' | 'silver' | 'gold'>('gold');
  const [diceCount, setDiceCount] = useState('1');
  const [diceReason, setDiceReason] = useState('');

  const [packProfile, setPackProfile] = useState(players[0]?.profileId ?? '');
  const [packCount, setPackCount] = useState('1');
  const [packKind, setPackKind] = useState<'national' | 'club'>('national');

  const [roleProfile, setRoleProfile] = useState(players[0]?.profileId ?? '');
  const [role, setRole] = useState<Role>('player');

  const run = (block: Block, action: () => Promise<AdminRunResult>, opts?: { refresh?: boolean }) => {
    if (!enabled || pendingTx) return;
    setBusy(block);
    setBusySlotId(null);
    setFeedback(null);
    startTransition(async () => {
      const result = await action();
      setFeedback({ block, result });
      setBusy(null);
      setBusySlotId(null);
      if (result.ok && opts?.refresh !== false) router.refresh();
    });
  };

  const runSlotBonus = (slotId: string, triggered: boolean) => {
    if (!enabled || pendingTx) return;
    setBusy('bonus');
    setBusySlotId(slotId);
    setBusyAction('award');
    setFeedback(null);
    startTransition(async () => {
      const result = await awardLineupBonusAction({ lineupSlotId: slotId, triggered });
      setFeedback({ block: 'bonus', result });
      setBusy(null);
      setBusySlotId(null);
      setBusyAction(null);
      if (result.ok) router.refresh();
    });
  };

  const runSlotReview = (slotId: string, reviewed: boolean) => {
    if (!enabled || pendingTx) return;
    setBusy('bonus');
    setBusySlotId(slotId);
    setBusyAction('review');
    setFeedback(null);
    // optimistic hide/unhide
    setLocalSlots((prev) => prev.map((s) => s.slotId === slotId ? { ...s, reviewedAt: reviewed ? new Date().toISOString() : null } : s));
    startTransition(async () => {
      const result = await reviewLineupBonusAction({ lineupSlotId: slotId, reviewed });
      setFeedback({ block: 'bonus', result });
      setBusy(null);
      setBusySlotId(null);
      setBusyAction(null);
      if (!result.ok) {
        // revert on failure
        setLocalSlots((prev) => prev.map((s) => s.slotId === slotId ? { ...s, reviewedAt: reviewed ? null : new Date().toISOString() } : s));
      } else {
        router.refresh();
      }
    });
  };

  const pickMatch = (id: string) => {
    setMatchId(id);
    const found = matchList.find((match) => match.id === id);
    if (!found) return;
    setStatus(found.status);
    setHomeScore(scoreText(found.homeScore));
    setAwayScore(scoreText(found.awayScore));
    setMinute(scoreText(found.minute));
  };

  const pickRoleProfile = (id: string) => {
    setRoleProfile(id);
    const found = players.find((player) => player.profileId === id);
    if (found) setRole(found.role);
  };

  const notice = (block: Block) =>
    feedback?.block === block ? (
      <div style={{ marginBottom: 12 }}>
        <Notice tone={feedback.result.ok ? 'info' : 'danger'}>{feedback.result.message}</Notice>
      </div>
    ) : null;

  const disabledHint = enabled ? undefined : 'Включится после подключения БД';

  return (
    <>
      <SectionTitle>Правки</SectionTitle>
      {!enabled && (
        <div style={{ marginBottom: 16 }}>
          <Notice>
            Правки ниже включатся вместе с базой. Схемы и действия уже написаны — после миграций и <code>.env</code> кнопки
            заработают без изменения кода.
          </Notice>
        </div>
      )}

      <div className="admin-tools">
        <section className="card" aria-label="Матч">
          <h3 className="card__title">Матч</h3>
          <p className="card__meta">Счёт, статус и минута: правка поверх провайдера.</p>
          {notice('match')}

          <div className="field">
            <label htmlFor="admin-match">Выбрать матч</label>
            <select
              id="admin-match"
              className="select"
              value={matchId}
              disabled={!enabled || pendingTx || matchList.length === 0}
              onChange={(event) => pickMatch(event.target.value)}
            >
              {matchList.length === 0 && <option value="">матчей нет</option>}
              {matchList.map((match) => {
                const home = teamDisplay(match.homeName);
                const away = teamDisplay(match.awayName);
                return (
                  <option key={match.id} value={match.id}>
                    {home.name} — {away.name}
                  </option>
                );
              })}
            </select>
          </div>

          <div className="field">
            <label htmlFor="admin-status">Статус</label>
            <select
              id="admin-status"
              className="select"
              value={status}
              disabled={!enabled || pendingTx}
              onChange={(event) => setStatus(event.target.value as MatchView['status'])}
            >
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="admin-home">Дом</label>
              <input
                id="admin-home"
                className="input"
                type="number"
                min={0}
                max={99}
                inputMode="numeric"
                placeholder="—"
                value={homeScore}
                disabled={!enabled || pendingTx}
                onChange={(event) => setHomeScore(event.target.value)}
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="admin-away">Гости</label>
              <input
                id="admin-away"
                className="input"
                type="number"
                min={0}
                max={99}
                inputMode="numeric"
                placeholder="—"
                value={awayScore}
                disabled={!enabled || pendingTx}
                onChange={(event) => setAwayScore(event.target.value)}
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="admin-minute">Минута</label>
              <input
                id="admin-minute"
                className="input"
                type="number"
                min={0}
                max={130}
                inputMode="numeric"
                placeholder="—"
                value={minute}
                disabled={!enabled || pendingTx}
                onChange={(event) => setMinute(event.target.value)}
              />
            </div>
          </div>

          <button
            type="button"
            className="btn btn--sm"
            disabled={!enabled || pendingTx || !matchId}
            title={disabledHint}
            onClick={() =>
              run('match', () =>
                updateMatchAction({
                  matchId,
                  status,
                  homeScore,
                  awayScore,
                  minute,
                }),
              )
            }
          >
            {busy === 'match' ? 'Сохраняем…' : 'Сохранить матч'}
          </button>
        </section>

        <section className="card" aria-label="Кубики">
          <h3 className="card__title">Кубики</h3>
          <p className="card__meta">Ручная выдача: бонус, компенсация сбоя, подарок.</p>
          {notice('dice')}

          <div className="field">
            <label htmlFor="admin-dice-profile">Игрок</label>
            <select
              id="admin-dice-profile"
              className="select"
              value={diceProfile}
              disabled={!enabled || pendingTx || players.length === 0}
              onChange={(event) => setDiceProfile(event.target.value)}
            >
              {players.length === 0 && <option value="">игроков нет</option>}
              {players.map((player) => (
                <option key={player.profileId} value={player.profileId}>
                  {player.nickname}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <div className="field" style={{ flex: 2 }}>
              <label htmlFor="admin-dice-tier">Кубик</label>
              <select
                id="admin-dice-tier"
                className="select"
                value={diceTier}
                disabled={!enabled || pendingTx}
                onChange={(event) => setDiceTier(event.target.value as typeof diceTier)}
              >
                {TIERS.map((tier) => (
                  <option key={tier.value} value={tier.value}>
                    {tier.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="admin-dice-count">Штук</label>
              <input
                id="admin-dice-count"
                className="input"
                type="number"
                min={1}
                max={10}
                inputMode="numeric"
                value={diceCount}
                disabled={!enabled || pendingTx}
                onChange={(event) => setDiceCount(event.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="admin-dice-reason">Причина</label>
            <input
              id="admin-dice-reason"
              className="input"
              type="text"
              maxLength={200}
              placeholder="например: бонус за активность"
              value={diceReason}
              disabled={!enabled || pendingTx}
              onChange={(event) => setDiceReason(event.target.value)}
            />
          </div>

          <button
            type="button"
            className="btn btn--sm"
            disabled={!enabled || pendingTx || !diceProfile}
            title={disabledHint}
            onClick={() =>
              run('dice', () =>
                grantDiceAction({
                  profileId: diceProfile,
                  tier: diceTier,
                  count: diceCount,
                  reason: diceReason,
                }),
              )
            }
          >
            {busy === 'dice' ? 'Выдаём…' : 'Выдать кубики'}
          </button>
        </section>

        {cardsEnabled ? (
          <>
            <section className="card" aria-label="Выдача паков">
              <h3 className="card__title">Паки (выдача)</h3>
              <p className="card__meta">Ручная выдача паков активного сезона: сборные или клубные.</p>
              {notice('pack')}

              <div className="field">
                <label htmlFor="admin-pack-kind">Тип пака</label>
                <select
                  id="admin-pack-kind"
                  className="select"
                  value={packKind}
                  disabled={!enabled || pendingTx}
                  onChange={(event) => setPackKind(event.target.value as 'national' | 'club')}
                >
                  <option value="national">Сборные</option>
                  <option value="club">Клубные</option>
                </select>
              </div>

              <div className="field">
                <label htmlFor="admin-pack-profile">Игрок</label>
                <select
                  id="admin-pack-profile"
                  className="select"
                  value={packProfile}
                  disabled={!enabled || pendingTx || players.length === 0}
                  onChange={(event) => setPackProfile(event.target.value)}
                >
                  {players.length === 0 && <option value="">игроков нет</option>}
                  {players.map((player) => (
                    <option key={player.profileId} value={player.profileId}>
                      {player.nickname}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="admin-pack-count">Количество</label>
                <input
                  id="admin-pack-count"
                  className="input"
                  type="number"
                  min={1}
                  max={20}
                  inputMode="numeric"
                  value={packCount}
                  disabled={!enabled || pendingTx}
                  onChange={(event) => setPackCount(event.target.value)}
                />
              </div>

              <button
                type="button"
                className="btn btn--sm"
                disabled={!enabled || pendingTx || !packProfile}
                title={disabledHint}
                onClick={() =>
                  run('pack', () =>
                    grantPackAction({
                      profileId: packProfile,
                      count: packCount,
                      packKind,
                    }),
                  )
                }
              >
                {busy === 'pack' ? 'Выдаём…' : 'Выдать паки'}
              </button>
            </section>

            <section className="card admin-bonus-card" aria-label="Бонус состава">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div>
                  <h3 className="card__title">Бонус состава</h3>
                  <p className="card__meta">
                    Проверьте все слоты состава после FT (вратарь, защитник, полузащитник, нападающий): засчитайте/снимите бонус вручную (в т.ч. за оценку 6.0) и отметьте как проверенное — обработанные уберутся из очереди. Автоматического начисления нет.
                  </p>
                </div>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-dim)' }}>
                  <input type="checkbox" checked={showReviewedBonuses} onChange={(e) => setShowReviewedBonuses(e.target.checked)} />
                  Показать проверенные
                </label>
              </div>
              {notice('bonus')}

              {(() => {
                const active = localSlots.filter((s) => !s.reviewedAt);
                const reviewed = localSlots.filter((s) => !!s.reviewedAt);
                const list = showReviewedBonuses ? localSlots : active;
                if (localSlots.length === 0) return <p className="card__text">Нет слотов состава по завершённым матчам.</p>;
                if (list.length === 0) return <p className="card__text">Все слоты проверены. {reviewed.length > 0 ? 'Можно показать проверенные выше.' : ''}</p>;
                return (
                  <div className="admin-bonus-list">
                    <div className="card__meta" style={{ marginBottom: 8 }}>В очереди: {active.length} · проверено: {reviewed.length}</div>
                    {list.map((item) => {
                      const home = teamDisplay(item.homeTeamName);
                      const away = teamDisplay(item.awayTeamName);
                      const isBusy = busy === 'bonus' && busySlotId === item.slotId;
                      const awarding = isBusy && busyAction === 'award';
                      const reviewing = isBusy && busyAction === 'review';
                      const reviewed = !!item.reviewedAt;
                      return (
                        <div key={item.slotId} className={`admin-bonus-item${reviewed ? ' is-reviewed' : ''}`}>
                          <div className="admin-bonus-item__main">
                            <div className="admin-bonus-item__top">
                              <span className={item.awarded ? 'chip chip--positive' : 'chip chip--muted'}>
                                {item.awarded ? `+${item.points} зачтено` : `${item.points} оч.`}
                              </span>
                              <span className="chip chip--info">{item.slot} · {ROLE_LABEL[item.roleGroup]}</span>
                              <span className="card__meta">{RARITY_LABEL[item.rarity]} · {item.rating}</span>
                              {reviewed && <span className="chip chip--muted">проверено</span>}
                            </div>
                            <div className="list-row__title">
                              {item.nickname} — {item.cardName} {item.cardTeamName ? `(${item.cardTeamName})` : ''}
                            </div>
                            <div className="list-row__meta">
                              {home.name} — {away.name} · {kickoffLabel(item.kickoffAt)} МСК · {item.awarded ? `статус: засчитан (${item.method ?? 'manual'})` : 'статус: не засчитан'}
                            </div>
                          </div>
                          <div className="admin-bonus-item__actions">
                            <button
                              type="button"
                              className={`btn btn--sm ${item.awarded ? '' : 'btn--primary'}`}
                              disabled={!enabled || pendingTx}
                              title={disabledHint}
                              onClick={() => runSlotBonus(item.slotId, !item.awarded)}
                            >
                              {awarding ? '…' : item.awarded ? 'Снять' : 'Засчитать'}
                            </button>
                            <button
                              type="button"
                              className="btn btn--sm btn--ghost"
                              disabled={!enabled || pendingTx}
                              title={disabledHint}
                              onClick={() => runSlotReview(item.slotId, !reviewed)}
                            >
                              {reviewing ? '…' : reviewed ? 'Вернуть' : 'Проверено'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </section>
          </>
        ) : null}

        <section className="card" aria-label="Ожидания">
          <h3 className="card__title">Ожидания</h3>
          <p className="card__meta">Застрявшие выборы. «Закрыть безопасно» — та же ветка, что у cron (D7).</p>
          {notice('pending')}

          {pending.length === 0 ? (
            <p className="card__text">Открытых ожиданий нет.</p>
          ) : (
            <div className="list">
              {pending.map((item) => (
                <div key={item.id} className="list-row">
                  <span className="chip chip--info">{PENDING_KIND[item.kind] ?? item.kind}</span>
                  <span className="list-row__main">
                    <span className="list-row__title">{item.nickname}</span>
                    <span className="list-row__meta">истекает {expiresLabel(item.expiresAt)} МСК</span>
                  </span>
                  <button
                    type="button"
                    className="btn btn--sm"
                    disabled={!enabled || pendingTx}
                    title={disabledHint}
                    onClick={() => run('pending', () => forceClosePendingAction({ pendingId: item.id }))}
                  >
                    {busy === 'pending' ? '…' : 'Закрыть'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card" aria-label="Роли">
          <h3 className="card__title">Роли</h3>
          <p className="card__meta">Игрок, зритель или админ. Последнего админа снять нельзя.</p>
          {notice('role')}

          <div className="field">
            <label htmlFor="admin-role-profile">Участник</label>
            <select
              id="admin-role-profile"
              className="select"
              value={roleProfile}
              disabled={!enabled || pendingTx || players.length === 0}
              onChange={(event) => pickRoleProfile(event.target.value)}
            >
              {players.length === 0 && <option value="">участников нет</option>}
              {players.map((player) => (
                <option key={player.profileId} value={player.profileId}>
                  {player.nickname} · {player.role}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="admin-role">Новая роль</label>
            <select
              id="admin-role"
              className="select"
              value={role}
              disabled={!enabled || pendingTx}
              onChange={(event) => setRole(event.target.value as Role)}
            >
              {ROLES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            className="btn btn--sm"
            disabled={!enabled || pendingTx || !roleProfile}
            title={disabledHint}
            onClick={() => run('role', () => changeRoleAction({ profileId: roleProfile, role }))}
          >
            {busy === 'role' ? 'Меняем…' : 'Сменить роль'}
          </button>
        </section>
      </div>
    </>
  );
}
