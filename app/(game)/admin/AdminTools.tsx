'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Notice, SectionTitle } from '@/components/ui/Panel';
import { formatRuShortDateTimeMsk } from '@/lib/format';
import { teamDisplay } from '@/lib/data/team-names';
import { CardBonusAdminSummaryModal } from '@/components/cards/CardBonusReportsModal';
import {
  changeRoleAction,
  forceClosePendingAction,
  grantDiceAction,
  grantPackAction,
  resolveFanSectorAction,
  reviewLineupBonusAction,
  submitLineupBonusBatchAction,
  updateMatchAction,
  type AdminRunResult,
} from '@/lib/actions/admin';
import type { AdminCardBonusBatchResultView, MatchView, PlayerView, Role } from '@/lib/types';
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
  var: 'VAR', tactics: 'тактика', locker: 'раздевалка', passage: 'передача', last_minute: 'последняя минута',
  rematch: 'ответный матч', simulation: 'симуляция', gentleman: 'джентльмен', training_base: 'тренировка',
  guess_player: 'узнай футболиста', fan_sector: 'фан-сектор', coach_contract: 'контракт тренера',
};
const ROLE_LABEL: Record<AdminManualLineupSlotView['roleGroup'], string> = {
  GK: 'вратарь', DEF: 'защитник', MID: 'полузащитник', FWD: 'нападающий',
};
const RARITY_LABEL: Record<AdminManualLineupSlotView['rarity'], string> = {
  common: 'Common', rare: 'Rare', epic: 'Epic', legend: 'Legend',
};

function scoreText(value: number | null | undefined): string { return value === null || value === undefined ? '' : String(value); }
function expiresLabel(iso: string): string { return formatRuShortDateTimeMsk(iso); }
function kickoffLabel(iso: string): string { return formatRuShortDateTimeMsk(iso); }
function dayMsk(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso));
  const y = parts.find((p) => p.type === 'year')?.value ?? '0000';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}
function dayLabel(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) return day;
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

type ToolsProps = {
  enabled: boolean;
  players: PlayerView[];
  matches: MatchView[];
  pending: AdminPendingView[];
  manualBonusSlots: AdminManualLineupSlotView[];
  cardsEnabled?: boolean;
};

export function AdminTools({ enabled, players, matches, pending, manualBonusSlots, cardsEnabled }: ToolsProps) {
  const router = useRouter();
  const [pendingTx, startTransition] = useTransition();
  const [busy, setBusy] = useState<Block | null>(null);
  const [busySlotId, setBusySlotId] = useState<string | null>(null);
  const [showProcessedBonuses, setShowProcessedBonuses] = useState(false);
  const [localSlots, setLocalSlots] = useState(manualBonusSlots);
  const [feedback, setFeedback] = useState<{ block: Block; result: AdminRunResult } | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [summary, setSummary] = useState<AdminCardBonusBatchResultView | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);

  useEffect(() => { setLocalSlots(manualBonusSlots); }, [manualBonusSlots]);

  const days = useMemo(() => {
    const set = new Set<string>();
    for (const s of localSlots) set.add(dayMsk(s.kickoffAt));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [localSlots]);
  const activeDays = useMemo(() => {
    const set = new Set<string>();
    for (const s of localSlots) if (!s.reviewedAt) set.add(dayMsk(s.kickoffAt));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [localSlots]);
  const [filterDay, setFilterDay] = useState<string>('all');
  useEffect(() => {
    if (filterDay !== 'all' && !days.includes(filterDay)) setFilterDay(activeDays[0] ?? days[0] ?? 'all');
  }, [days, activeDays, filterDay]);
  useEffect(() => {
    if (filterDay === 'all' && activeDays.length > 0) setFilterDay(activeDays[0] ?? 'all');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredSlots = useMemo(() => filterDay === 'all' ? localSlots : localSlots.filter((s) => dayMsk(s.kickoffAt) === filterDay), [localSlots, filterDay]);
  const active = useMemo(() => filteredSlots.filter((s) => !s.reviewedAt), [filteredSlots]);
  const processed = useMemo(() => filteredSlots.filter((s) => !!s.reviewedAt), [filteredSlots]);
  const list = showProcessedBonuses ? filteredSlots : active;

  useEffect(() => {
    setSelected((prev) => {
      const next: Record<string, boolean> = {};
      for (const s of active) next[s.slotId] = prev[s.slotId] === true;
      return next;
    });
  }, [active.map((s) => s.slotId).join('|')]);

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
    setBusy(block); setBusySlotId(null); setFeedback(null);
    startTransition(async () => {
      const result = await action();
      setFeedback({ block, result }); setBusy(null); setBusySlotId(null);
      if (result.ok && opts?.refresh !== false) router.refresh();
    });
  };

  const runReturnToQueue = (slotId: string) => {
    if (!enabled || pendingTx) return;
    setBusy('bonus'); setBusySlotId(slotId); setFeedback(null);
    setLocalSlots((prev) => prev.map((s) => s.slotId === slotId ? { ...s, reviewedAt: null } : s));
    startTransition(async () => {
      const result = await reviewLineupBonusAction({ lineupSlotId: slotId, reviewed: false });
      setFeedback({ block: 'bonus', result }); setBusy(null); setBusySlotId(null);
      if (!result.ok) setLocalSlots((prev) => prev.map((s) => s.slotId === slotId ? { ...s, reviewedAt: new Date().toISOString() } : s));
      else router.refresh();
    });
  };

  const submitBatch = () => {
    if (!enabled || pendingTx) return;
    const visibleSlotIds = active.map((s) => s.slotId);
    if (visibleSlotIds.length === 0) {
      setFeedback({ block: 'bonus', result: { ok: false, message: 'Нет активных карточек для отправки в выбранном фильтре' } });
      return;
    }
    const selectedAwardedSlotIds = visibleSlotIds.filter((id) => selected[id] === true);
    setBusy('bonus'); setBusySlotId(null); setFeedback(null);
    startTransition(async () => {
      const result = await submitLineupBonusBatchAction({ visibleSlotIds, selectedAwardedSlotIds, filterDay: filterDay === 'all' ? undefined : filterDay });
      setFeedback({ block: 'bonus', result: { ok: result.ok, message: result.message } });
      setBusy(null);
      if (result.ok) {
        const report = (result as AdminRunResult & { report?: AdminCardBonusBatchResultView }).report;
        if (report) { setSummary(report); setSummaryOpen(true); }
        router.refresh();
      }
    });
  };

  const pickMatch = (id: string) => {
    setMatchId(id);
    const found = matchList.find((match) => match.id === id);
    if (!found) return;
    setStatus(found.status); setHomeScore(scoreText(found.homeScore)); setAwayScore(scoreText(found.awayScore)); setMinute(scoreText(found.minute));
  };
  const pickRoleProfile = (id: string) => {
    setRoleProfile(id);
    const found = players.find((player) => player.profileId === id);
    if (found) setRole(found.role);
  };
  const notice = (block: Block) => feedback?.block === block ? <div style={{ marginBottom: 12 }}><Notice tone={feedback.result.ok ? 'info' : 'danger'}>{feedback.result.message}</Notice></div> : null;
  const disabledHint = enabled ? undefined : 'Включится после подключения БД';

  return (
    <>
      <SectionTitle>Правки</SectionTitle>
      {!enabled && (
        <div style={{ marginBottom: 16 }}>
          <Notice>Правки ниже включатся вместе с базой. Схемы и действия уже написаны — после миграций и <code>.env</code> кнопки заработают без изменения кода.</Notice>
        </div>
      )}

      <div className="admin-tools">
        <section className="card" aria-label="Матч">
          <h3 className="card__title">Матч</h3>
          <p className="card__meta">Счёт, статус и минута: правка поверх провайдера.</p>
          {notice('match')}
          <div className="field"><label htmlFor="admin-match">Выбрать матч</label>
            <select id="admin-match" className="select" value={matchId} disabled={!enabled || pendingTx || matchList.length === 0} onChange={(e) => pickMatch(e.target.value)}>
              {matchList.length === 0 && <option value="">матчей нет</option>}
              {matchList.map((match) => { const home = teamDisplay(match.homeName); const away = teamDisplay(match.awayName); return <option key={match.id} value={match.id}>{home.name} — {away.name}</option>; })}
            </select>
          </div>
          <div className="field"><label htmlFor="admin-status">Статус</label>
            <select id="admin-status" className="select" value={status} disabled={!enabled || pendingTx} onChange={(e) => setStatus(e.target.value as MatchView['status'])}>
              {STATUSES.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="field" style={{ flex: 1 }}><label htmlFor="admin-home">Дом</label><input id="admin-home" className="input" type="number" min={0} max={99} inputMode="numeric" placeholder="—" value={homeScore} disabled={!enabled || pendingTx} onChange={(e) => setHomeScore(e.target.value)} /></div>
            <div className="field" style={{ flex: 1 }}><label htmlFor="admin-away">Гости</label><input id="admin-away" className="input" type="number" min={0} max={99} inputMode="numeric" placeholder="—" value={awayScore} disabled={!enabled || pendingTx} onChange={(e) => setAwayScore(e.target.value)} /></div>
            <div className="field" style={{ flex: 1 }}><label htmlFor="admin-minute">Минута</label><input id="admin-minute" className="input" type="number" min={0} max={130} inputMode="numeric" placeholder="—" value={minute} disabled={!enabled || pendingTx} onChange={(e) => setMinute(e.target.value)} /></div>
          </div>
          <button type="button" className="btn btn--sm" disabled={!enabled || pendingTx || !matchId} title={disabledHint} onClick={() => run('match', () => updateMatchAction({ matchId, status, homeScore, awayScore, minute }))}>{busy === 'match' ? 'Сохраняем…' : 'Сохранить матч'}</button>
        </section>

        <section className="card" aria-label="Кубики">
          <h3 className="card__title">Кубики</h3>
          <p className="card__meta">Ручная выдача: бонус, компенсация сбоя, подарок.</p>
          {notice('dice')}
          <div className="field"><label htmlFor="admin-dice-profile">Игрок</label>
            <select id="admin-dice-profile" className="select" value={diceProfile} disabled={!enabled || pendingTx || players.length === 0} onChange={(e) => setDiceProfile(e.target.value)}>
              {players.length === 0 && <option value="">игроков нет</option>}
              {players.map((p) => <option key={p.profileId} value={p.profileId}>{p.nickname}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="field" style={{ flex: 2 }}><label htmlFor="admin-dice-tier">Кубик</label>
              <select id="admin-dice-tier" className="select" value={diceTier} disabled={!enabled || pendingTx} onChange={(e) => setDiceTier(e.target.value as typeof diceTier)}>
                {TIERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="field" style={{ flex: 1 }}><label htmlFor="admin-dice-count">Штук</label><input id="admin-dice-count" className="input" type="number" min={1} max={10} inputMode="numeric" value={diceCount} disabled={!enabled || pendingTx} onChange={(e) => setDiceCount(e.target.value)} /></div>
          </div>
          <div className="field"><label htmlFor="admin-dice-reason">Причина</label><input id="admin-dice-reason" className="input" type="text" maxLength={200} placeholder="например: бонус за активность" value={diceReason} disabled={!enabled || pendingTx} onChange={(e) => setDiceReason(e.target.value)} /></div>
          <button type="button" className="btn btn--sm" disabled={!enabled || pendingTx || !diceProfile} title={disabledHint} onClick={() => run('dice', () => grantDiceAction({ profileId: diceProfile, tier: diceTier, count: diceCount, reason: diceReason }))}>{busy === 'dice' ? 'Выдаём…' : 'Выдать кубики'}</button>
        </section>

        {cardsEnabled ? (
          <>
            <section className="card" aria-label="Выдача паков">
              <h3 className="card__title">Паки (выдача)</h3>
              <p className="card__meta">Ручная выдача паков активного сезона: сборные или клубные.</p>
              {notice('pack')}
              <div className="field"><label htmlFor="admin-pack-kind">Тип пака</label>
                <select id="admin-pack-kind" className="select" value={packKind} disabled={!enabled || pendingTx} onChange={(e) => setPackKind(e.target.value as 'national' | 'club')}>
                  <option value="national">Сборные</option><option value="club">Клубные</option>
                </select>
              </div>
              <div className="field"><label htmlFor="admin-pack-profile">Игрок</label>
                <select id="admin-pack-profile" className="select" value={packProfile} disabled={!enabled || pendingTx || players.length === 0} onChange={(e) => setPackProfile(e.target.value)}>
                  {players.length === 0 && <option value="">игроков нет</option>}
                  {players.map((p) => <option key={p.profileId} value={p.profileId}>{p.nickname}</option>)}
                </select>
              </div>
              <div className="field"><label htmlFor="admin-pack-count">Количество</label><input id="admin-pack-count" className="input" type="number" min={1} max={20} inputMode="numeric" value={packCount} disabled={!enabled || pendingTx} onChange={(e) => setPackCount(e.target.value)} /></div>
              <button type="button" className="btn btn--sm" disabled={!enabled || pendingTx || !packProfile} title={disabledHint} onClick={() => run('pack', () => grantPackAction({ profileId: packProfile, count: packCount, packKind }))}>{busy === 'pack' ? 'Выдаём…' : 'Выдать паки'}</button>
            </section>

            <section className="card admin-bonus-card" aria-label="Бонус состава">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div>
                  <h3 className="card__title">Бонус состава</h3>
                  <p className="card__meta">Отметьте галочками карточки, которые принесли очки, и нажмите «Отправить результат». Неотмеченные видимые карточки будут обработаны без очков. Скрытые фильтром не затрагиваются.</p>
                </div>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-dim)' }}>
                  <input type="checkbox" checked={showProcessedBonuses} onChange={(e) => setShowProcessedBonuses(e.target.checked)} />
                  Показать обработанные
                </label>
              </div>

              <div style={{ display: 'flex', gap: 10, margin: '12px 0', flexWrap: 'wrap', alignItems: 'center' }}>
                <label className="field" style={{ minWidth: 220, margin: 0 }}>
                  <span className="filter__label">День матча</span>
                  <select className="select" value={filterDay} disabled={pendingTx} onChange={(e) => setFilterDay(e.target.value)}>
                    <option value="all">Все дни</option>
                    {days.map((d) => <option key={d} value={d}>{dayLabel(d)}</option>)}
                  </select>
                </label>
                <button type="button" className="btn btn--sm btn--primary" disabled={!enabled || pendingTx || active.length === 0} title={disabledHint} onClick={submitBatch}>
                  {busy === 'bonus' && !busySlotId ? 'Отправляем…' : 'Отправить результат'}
                </button>
                <div className="card__meta">В очереди: {active.length} · обработано: {processed.length}</div>
              </div>

              {notice('bonus')}

              {localSlots.length === 0 ? <p className="card__text">Нет слотов состава по завершённым матчам.</p> : list.length === 0 ? (
                <p className="card__text">{showProcessedBonuses ? 'Нет карточек в выбранном фильтре.' : 'В выбранном фильтре нет активных карточек.'}</p>
              ) : (
                <div className="admin-bonus-list">
                  {list.map((item) => {
                    const home = teamDisplay(item.homeTeamName);
                    const away = teamDisplay(item.awayTeamName);
                    const isBusy = busy === 'bonus' && busySlotId === item.slotId;
                    const processedItem = !!item.reviewedAt;
                    const checked = selected[item.slotId] === true;
                    return (
                      <div key={item.slotId} className={`admin-bonus-item${processedItem ? ' is-reviewed' : ''}`}>
                        <div className="admin-bonus-item__main">
                          <div className="admin-bonus-item__top" style={{ alignItems: 'center' }}>
                            {!processedItem ? (
                              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                <input type="checkbox" checked={checked} disabled={!enabled || pendingTx} onChange={(e) => setSelected((prev) => ({ ...prev, [item.slotId]: e.target.checked }))} />
                                <span className="card__meta">Принесла очки</span>
                              </label>
                            ) : (
                              <span className={item.awarded ? 'chip chip--positive' : 'chip chip--muted'}>{item.awarded ? `+${item.points} зачтено` : '0 оч.'}</span>
                            )}
                            <span className="chip chip--info">{item.slot} · {ROLE_LABEL[item.roleGroup]}</span>
                            <span className="card__meta">{RARITY_LABEL[item.rarity]} · {item.rating}</span>
                            {processedItem && <span className="chip chip--muted">обработано</span>}
                          </div>
                          <div className="list-row__title">{item.nickname} — {item.cardName} {item.cardTeamName ? `(${item.cardTeamName})` : ''}</div>
                          <div className="list-row__meta">{home.name} — {away.name} · {kickoffLabel(item.kickoffAt)} МСК · {processedItem ? (item.awarded ? `статус: засчитан (${item.method ?? 'manual'})` : 'статус: без очков') : `потенциал: ${item.points} оч.`}</div>
                        </div>
                        <div className="admin-bonus-item__actions">
                          {processedItem ? (
                            <button type="button" className="btn btn--sm btn--ghost" disabled={!enabled || pendingTx} title={disabledHint} onClick={() => runReturnToQueue(item.slotId)}>
                              {isBusy ? '…' : 'Вернуть в очередь'}
                            </button>
                          ) : (
                            <span className="card__meta">Будет отправлено: {checked ? `+${item.points}` : '0'}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        ) : null}

        <section className="card" aria-label="Ожидания">
          <h3 className="card__title">Ожидания</h3>
          <p className="card__meta">Застрявшие выборы. «Закрыть безопасно» — та же ветка, что у cron (D7).</p>
          {notice('pending')}
          {pending.length === 0 ? <p className="card__text">Открытых ожиданий нет.</p> : (
            <div className="list">
              {pending.map((item) => (
                <div key={item.id} className="list-row">
                  <span className="chip chip--info">{PENDING_KIND[item.kind] ?? item.kind}</span>
                  <span className="list-row__main">
                    <span className="list-row__title">{item.nickname}</span>
                    <span className="list-row__meta">истекает {expiresLabel(item.expiresAt)} МСК</span>
                  </span>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {item.kind === 'fan_sector' && (
                      <>
                        <button type="button" className="btn btn--sm" disabled={!enabled || pendingTx} title={disabledHint} onClick={() => run('pending', () => resolveFanSectorAction({ pendingId: item.id, approved: true }))}>{busy === 'pending' ? '…' : 'Одобрить'}</button>
                        <button type="button" className="btn btn--sm" disabled={!enabled || pendingTx} title={disabledHint} onClick={() => run('pending', () => resolveFanSectorAction({ pendingId: item.id, approved: false }))}>{busy === 'pending' ? '…' : 'Отклонить'}</button>
                      </>
                    )}
                    <button type="button" className="btn btn--sm" disabled={!enabled || pendingTx} title={disabledHint} onClick={() => run('pending', () => forceClosePendingAction({ pendingId: item.id }))}>{busy === 'pending' ? '…' : 'Закрыть'}</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card" aria-label="Роли">
          <h3 className="card__title">Роли</h3>
          <p className="card__meta">Игрок, зритель или админ. Последнего админа снять нельзя.</p>
          {notice('role')}
          <div className="field"><label htmlFor="admin-role-profile">Участник</label>
            <select id="admin-role-profile" className="select" value={roleProfile} disabled={!enabled || pendingTx || players.length === 0} onChange={(e) => pickRoleProfile(e.target.value)}>
              {players.length === 0 && <option value="">участников нет</option>}
              {players.map((p) => <option key={p.profileId} value={p.profileId}>{p.nickname} · {p.role}</option>)}
            </select>
          </div>
          <div className="field"><label htmlFor="admin-role">Новая роль</label>
            <select id="admin-role" className="select" value={role} disabled={!enabled || pendingTx} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>
          <button type="button" className="btn btn--sm" disabled={!enabled || pendingTx || !roleProfile} title={disabledHint} onClick={() => run('role', () => changeRoleAction({ profileId: roleProfile, role }))}>{busy === 'role' ? 'Меняем…' : 'Сменить роль'}</button>
        </section>
      </div>

      <CardBonusAdminSummaryModal open={summaryOpen} onClose={() => setSummaryOpen(false)} title="Результат начисления" summary={summary} />
    </>
  );
}
