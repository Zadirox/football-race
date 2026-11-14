'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Notice, SectionTitle } from '@/components/ui/Panel';
import { teamDisplay } from '@/lib/data/team-names';
import {
  awardLineupBonusAction,
  changeRoleAction,
  forceClosePendingAction,
  grantDiceAction,
  grantPackAction,
  updateMatchAction,
  type AdminRunResult,
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
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Moscow',
  });
}

function kickoffLabel(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Moscow',
  });
}

type ToolsProps = {
  enabled: boolean;
  players: PlayerView[];
  matches: MatchView[];
  pending: AdminPendingView[];
  manualBonusSlots: AdminManualLineupSlotView[];
};

/**
 * Ручные правки сезона: матч, кубики, паки, бонус состава, ожидания и роли.
 * Все кнопки — server actions, поэтому ключи провайдера и БД не попадают
 * в браузер. В демо-режиме блоки отключены и объясняют почему.
 */
export function AdminTools({ enabled, players, matches, pending, manualBonusSlots }: ToolsProps) {
  const router = useRouter();
  const [pendingTx, startTransition] = useTransition();
  const [busy, setBusy] = useState<Block | null>(null);
  const [busySlotId, setBusySlotId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ block: Block; result: AdminRunResult } | null>(null);

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

  const [roleProfile, setRoleProfile] = useState(players[0]?.profileId ?? '');
  const [role, setRole] = useState<Role>('player');

  const run = (block: Block, action: () => Promise<AdminRunResult>) => {
    if (!enabled || pendingTx) return;
    setBusy(block);
    setBusySlotId(null);
    setFeedback(null);
    startTransition(async () => {
      const result = await action();
      setFeedback({ block, result });
      setBusy(null);
      setBusySlotId(null);
      if (result.ok) router.refresh();
    });
  };

  const runSlotBonus = (slotId: string, triggered: boolean) => {
    if (!enabled || pendingTx) return;
    setBusy('bonus');
    setBusySlotId(slotId);
    setFeedback(null);
    startTransition(async () => {
      const result = await awardLineupBonusAction({ lineupSlotId: slotId, triggered });
      setFeedback({ block: 'bonus', result });
      setBusy(null);
      setBusySlotId(null);
      if (result.ok) router.refresh();
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

        <section className="card" aria-label="Пак сборных">
          <h3 className="card__title">Пак сборных (выдача)</h3>
          <p className="card__meta">Ручная выдача паков национальных сборных активного сезона.</p>
          {notice('pack')}

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
                }),
              )
            }
          >
            {busy === 'pack' ? 'Выдаём…' : 'Выдать паки'}
          </button>
        </section>

        <section className="card" aria-label="Бонус состава">
          <h3 className="card__title">Бонус состава (вручную)</h3>
          <p className="card__meta">
            Засчитать или снять бонус для вратаря, полузащитника и нападающего после финального свистка (FT).
          </p>
          {notice('bonus')}

          {manualBonusSlots.length === 0 ? (
            <p className="card__text">Нет слотов для ручного бонуса по завершённым матчам.</p>
          ) : (
            <div className="list">
              {manualBonusSlots.map((item) => {
                const home = teamDisplay(item.homeTeamName);
                const away = teamDisplay(item.awayTeamName);
                const isBusy = busy === 'bonus' && busySlotId === item.slotId;
                return (
                  <div key={item.slotId} className="list-row" style={{ alignItems: 'flex-start', gap: 10 }}>
                    <span className={item.awarded ? 'chip chip--positive' : 'chip chip--muted'}>
                      {item.awarded ? `+${item.points}` : `${item.points} оч.`}
                    </span>
                    <span className="list-row__main">
                      <span className="list-row__title">
                        {item.nickname} · {item.cardName} ({item.cardTeamName ?? '—'})
                      </span>
                      <span className="list-row__meta">
                        {home.name} — {away.name} · {kickoffLabel(item.kickoffAt)} МСК · {item.slot} ·{' '}
                        {ROLE_LABEL[item.roleGroup]} · {RARITY_LABEL[item.rarity]} · рейтинг {item.rating}
                      </span>
                      <span className="list-row__meta">
                        Статус: {item.awarded ? `засчитан (${item.method ?? 'manual'})` : 'не засчитан'}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="btn btn--sm"
                      disabled={!enabled || pendingTx}
                      title={disabledHint}
                      onClick={() => runSlotBonus(item.slotId, !item.awarded)}
                    >
                      {isBusy ? '…' : item.awarded ? 'Снять' : 'Засчитать бонус'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

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
