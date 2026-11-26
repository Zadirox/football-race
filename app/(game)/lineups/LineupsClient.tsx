'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { removeLineupSlotAction, saveLineupSlotAction } from '@/lib/actions/lineups';
import { CardTile } from '@/components/cards/CardTile';
import { Notice } from '@/components/ui/Panel';
import { teamDisplay } from '@/lib/data/team-names';
import { LINEUP_POINTS } from '@/lib/game/cards';
import { canLineupCardPlayMatch, isClubContestMatch, lineupCardTeamLabel } from '@/lib/game/lineup-eligibility';
import { RARITY_LABEL_RU, ROLE_LABEL_RU, teamFlag } from '@/lib/game/cards-ui';
import { makeLineupSlotKey, shouldApplySaveResult, type LineupAutosaveState } from '@/lib/game/lineup-autosave';
import type { LineupSlotKind, MatchLineupView, OwnedCardView } from '@/lib/types';

type Props = {
  matches: MatchLineupView[];
  ownedCards: OwnedCardView[];
};

const SLOTS: LineupSlotKind[] = ['OF1', 'OF2', 'GK'];

const SLOT_META: Record<LineupSlotKind, { title: string; short: string; hint: string }> = {
  GK: { title: 'Вратарь', short: 'GK', hint: 'Только GK карты этой команды' },
  OF1: { title: 'Полевой 1', short: 'OF', hint: 'DEF / MID / FWD этой команды' },
  OF2: { title: 'Полевой 2', short: 'OF', hint: 'DEF / MID / FWD этой команды' },
};

const PITCH_SLOT_CLASS: Record<LineupSlotKind, string> = {
  GK: 'slot slot--gk',
  OF1: 'slot slot--of1',
  OF2: 'slot slot--of2',
};

function kickoffLabel(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Moscow',
  });
}

function cardShort(card: OwnedCardView): string {
  const team = lineupCardTeamLabel(card);
  return `${card.playerName} · ${ROLE_LABEL_RU[card.roleGroup]} · ${card.rating}${team ? ` · ${team}` : ''}`;
}

function teamInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
  return letters || 'FC';
}

function TeamBadge({ name, logo }: { name: string; logo: string | null }) {
  if (logo) {
    return <img src={logo} alt="" className="team-badge" loading="lazy" />;
  }
  return <span className="team-badge team-badge--fallback" aria-hidden="true">{teamInitials(name)}</span>;
}

type SlotRuntime = {
  confirmedCardId: string;
  desiredCardId: string;
  state: LineupAutosaveState;
  error: string | null;
};

export function LineupsClient({ matches, ownedCards }: Props) {
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  const byMatchSelection = useMemo(() => {
    const map = new Map<string, Map<LineupSlotKind, string>>();
    for (const m of matches) {
      const slots = new Map<LineupSlotKind, string>();
      for (const s of m.slots) if (s.card) slots.set(s.slot, s.card.instanceId);
      map.set(m.matchId, slots);
    }
    return map;
  }, [matches]);

  const buildRuntime = useCallback((source: Map<string, Map<LineupSlotKind, string>>) => {
    const next: Record<string, SlotRuntime> = {};
    for (const m of matches) {
      for (const slot of SLOTS) {
        const key = makeLineupSlotKey(m.matchId, slot);
        const cardId = source.get(m.matchId)?.get(slot) ?? '';
        next[key] = { confirmedCardId: cardId, desiredCardId: cardId, state: 'idle', error: null };
      }
    }
    return next;
  }, [matches]);

  const [runtime, setRuntime] = useState<Record<string, SlotRuntime>>(() => buildRuntime(byMatchSelection));
  const runtimeRef = useRef(runtime);
  runtimeRef.current = runtime;

  const requestIdsRef = useRef<Record<string, number>>({});
  const queuesRef = useRef<Record<string, Promise<void>>>({});

  useEffect(() => {
    // Sync confirmed state from server refresh/initial load; keep in-flight slots intact.
    setRuntime((prev) => {
      const next = { ...prev };
      for (const m of matches) {
        for (const slot of SLOTS) {
          const key = makeLineupSlotKey(m.matchId, slot);
          const serverCardId = byMatchSelection.get(m.matchId)?.get(slot) ?? '';
          const cur = next[key];
          if (!cur) {
            next[key] = { confirmedCardId: serverCardId, desiredCardId: serverCardId, state: 'idle', error: null };
            continue;
          }
          if (cur.state === 'saving') continue;
          const desiredChangedLocally = cur.desiredCardId !== cur.confirmedCardId;
          if (desiredChangedLocally) continue;
          next[key] = { ...cur, confirmedCardId: serverCardId, desiredCardId: serverCardId, state: cur.state === 'error' ? 'error' : 'idle', error: cur.state === 'error' ? cur.error : null };
        }
      }
      return next;
    });
  }, [matches, byMatchSelection]);

  const selections = useMemo(() => {
    const map = new Map<string, Map<LineupSlotKind, string>>();
    for (const m of matches) {
      const slots = new Map<LineupSlotKind, string>();
      for (const slot of SLOTS) {
        const key = makeLineupSlotKey(m.matchId, slot);
        const cardId = runtime[key]?.desiredCardId ?? byMatchSelection.get(m.matchId)?.get(slot) ?? '';
        if (cardId) slots.set(slot, cardId);
      }
      map.set(m.matchId, slots);
    }
    return map;
  }, [matches, runtime, byMatchSelection]);

  const enqueueSave = useCallback((matchId: string, slot: LineupSlotKind, desiredCardId: string | null) => {
    const key = makeLineupSlotKey(matchId, slot);
    const requestId = (requestIdsRef.current[key] ?? 0) + 1;
    requestIdsRef.current[key] = requestId;
    setRuntime((prev) => {
      const cur = prev[key] ?? { confirmedCardId: '', desiredCardId: '', state: 'idle' as const, error: null };
      return { ...prev, [key]: { ...cur, desiredCardId: desiredCardId ?? '', state: 'saving', error: null } };
    });

    const prevPromise = queuesRef.current[key] ?? Promise.resolve();
    const run = prevPromise.catch(() => undefined).then(async () => {
      const latest = requestIdsRef.current[key] ?? 0;
      if (!shouldApplySaveResult({ requestId, latestRequestId: latest })) return;
      const res = desiredCardId
        ? await saveLineupSlotAction({ matchId, slot, cardInstanceId: desiredCardId })
        : await removeLineupSlotAction({ matchId, slot });

      const stillLatest = requestIdsRef.current[key] ?? 0;
      if (!shouldApplySaveResult({ requestId, latestRequestId: stillLatest })) return;

      setRuntime((prev) => {
        const cur = prev[key];
        if (!cur) return prev;
        if (res.ok) {
          return { ...prev, [key]: { ...cur, confirmedCardId: desiredCardId ?? '', desiredCardId: desiredCardId ?? '', state: 'saved', error: null } };
        }
        return {
          ...prev,
          [key]: {
            ...cur,
            desiredCardId: cur.confirmedCardId,
            state: 'error',
            error: res.message,
          },
        };
      });
      setFeedback(res.ok ? { ok: true, message: res.message } : { ok: false, message: res.message });
      if (res.ok) {
        setTimeout(() => {
          setRuntime((prev) => {
            const cur = prev[key];
            if (!cur || cur.state !== 'saved') return prev;
            if ((requestIdsRef.current[key] ?? 0) !== requestId) return prev;
            return { ...prev, [key]: { ...cur, state: 'idle' } };
          });
        }, 1500);
      }
    });
    queuesRef.current[key] = run;
  }, []);

  const setSlot = useCallback((matchId: string, slot: LineupSlotKind, cardInstanceId: string) => {
    const key = makeLineupSlotKey(matchId, slot);
    const cur = runtimeRef.current[key];
    const prev = cur?.desiredCardId ?? '';
    if (prev === cardInstanceId) return;
    if (!cardInstanceId) {
      enqueueSave(matchId, slot, null);
      return;
    }
    enqueueSave(matchId, slot, cardInstanceId);
  }, [enqueueSave]);

  const clear = useCallback((matchId: string, slot: LineupSlotKind) => {
    enqueueSave(matchId, slot, null);
  }, [enqueueSave]);

  const eligibleCards = useCallback((match: MatchLineupView, slot: LineupSlotKind) => {
    const selectedInMatch = new Set(
      (['GK', 'OF1', 'OF2'] as LineupSlotKind[])
        .filter((s) => s !== slot)
        .map((s) => selections.get(match.matchId)?.get(s))
        .filter(Boolean) as string[],
    );
    return ownedCards.filter((c) => {
      if (selectedInMatch.has(c.instanceId)) return false;
      if (slot === 'GK' && c.roleGroup !== 'GK') return false;
      if (slot !== 'GK' && c.roleGroup === 'GK') return false;
      return canLineupCardPlayMatch(c, {
        homeName: match.homeName,
        awayName: match.awayName,
        leagueCode: match.leagueCode ?? null,
      });
    });
  }, [ownedCards, selections]);

  if (matches.length === 0) {
    return (
      <Notice tone="info">
        Нет матчей, по которым можно поставить карточки игроков.
      </Notice>
    );
  }

  return (
    <div className="lineups">
      {feedback && (
        <div style={{ marginBottom: 12 }}>
          <Notice tone={feedback.ok ? 'info' : 'danger'}>{feedback.message}</Notice>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16, padding: 12 }}>
        <p className="card__text" style={{ margin: 0 }}>
          Состав на матч: <strong>1 вратарь + 2 полевых</strong> этой команды. Можно менять до дедлайна матча.
          Потенциал бонуса: <strong>10/20/30/40</strong> за Common/Rare/Epic/Legend (если условие бонуса выполнено).
          Изменения сохраняются автоматически.
        </p>
      </div>

      <div className="grid" style={{ gap: 18 }}>
        {matches.map((match) => {
          const home = teamDisplay(match.homeName);
          const away = teamDisplay(match.awayName);
          const locked = match.locked || new Date(match.kickoffUtc).getTime() <= Date.now();
          const clubContest = isClubContestMatch({ leagueCode: match.leagueCode ?? null });
          const homeMark = clubContest ? null : teamFlag(home.name, null);
          const awayMark = clubContest ? null : teamFlag(away.name, null);

          return (
            <section key={match.matchId} className="match-card-wrap card">
              <div className="match-head">
                <div className="match-head__teams">
                  <span className="team-pill">
                    {clubContest ? <TeamBadge name={home.name} logo={match.homeLogo ?? null} /> : <span aria-hidden="true">{homeMark}</span>}
                    {home.name}
                  </span>
                  <span className="vs">vs</span>
                  <span className="team-pill">
                    {clubContest ? <TeamBadge name={away.name} logo={match.awayLogo ?? null} /> : <span aria-hidden="true">{awayMark}</span>}
                    {away.name}
                  </span>
                </div>
                <div className="match-head__meta">
                  <span className="contest-chip">{clubContest ? 'Клубный матч' : 'Матч сборных'}</span>
                  <span>{kickoffLabel(match.kickoffUtc)} МСК</span>
                  <span className={`status-chip ${locked ? 'status-chip--locked' : 'status-chip--open'}`}>
                    {locked ? 'Состав заблокирован' : 'Можно менять'}
                  </span>
                  <span className="card__meta">{match.status}</span>
                </div>
              </div>

              <div className="pitch" aria-label="Слоты состава">
                <div className="pitch__lines" aria-hidden="true" />
                {SLOTS.map((slot) => {
                  const slotState = match.slots.find((s) => s.slot === slot) ?? { matchId: match.matchId, slot, card: null };
                  const currentCard = slotState.card ?? null;
                  const key = makeLineupSlotKey(match.matchId, slot);
                  const rt = runtime[key];
                  const chosen = rt?.desiredCardId ?? (currentCard?.instanceId ?? '');
                  const options = eligibleCards(match, slot);
                  const meta = SLOT_META[slot];
                  const selectedCard = chosen ? (ownedCards.find((c) => c.instanceId === chosen) ?? currentCard) : currentCard;
                  const potential = selectedCard ? LINEUP_POINTS[selectedCard.rarity] : null;

                  let bonusLine = 'Бонус ещё не проверен';
                  let bonusTone: 'muted' | 'good' | 'bad' = 'muted';
                  if (slotState.bonusAwarded) {
                    bonusLine = `Бонус начислен: +${slotState.bonusPoints ?? 0} (${slotState.bonusMethod === 'auto' ? 'авто' : 'вручную'})`;
                    bonusTone = 'good';
                  } else if (slotState.bonusMethod) {
                    bonusLine = 'Бонус не начислен';
                    bonusTone = 'bad';
                  } else if (potential != null) {
                    bonusLine = `Потенциал: +${potential} (${RARITY_LABEL_RU[selectedCard!.rarity]})`;
                  }

                  const teamLabel = selectedCard ? lineupCardTeamLabel(selectedCard) : '';
                  const saveState = rt?.state ?? 'idle';
                  const saveError = rt?.error ?? null;
                  const isSaving = saveState === 'saving';

                  return (
                    <div key={slot} className={PITCH_SLOT_CLASS[slot]}>
                      <div className="slot__head">
                        <span className="slot__badge">{meta.short}</span>
                        <span className="slot__title">{meta.title}</span>
                        <span className="slot__autosave" data-state={saveState} aria-live="polite">
                          {saveState === 'saving' ? 'Сохраняем…' : saveState === 'saved' ? 'Сохранено' : saveState === 'error' ? 'Ошибка' : ''}
                        </span>
                      </div>

                      <div className="slot__body">
                        {selectedCard ? (
                          <div className="slot__card">
                            <CardTile card={selectedCard} size="sm" interactive={false} />
                            {teamLabel && <div className="slot__preview-note">{teamLabel}</div>}
                          </div>
                        ) : (
                          <div className="slot__empty">
                            <div className="slot__empty-icon" aria-hidden="true">{slot === 'GK' ? '🧤' : '⚽'}</div>
                            <div className="slot__empty-text">Слот пуст</div>
                            <div className="slot__empty-hint">{meta.hint}</div>
                          </div>
                        )}

                        <div className="slot__controls">
                          <div className={`bonus-line bonus-line--${bonusTone}`}>{bonusLine}</div>

                          <label className="field" style={{ marginBottom: 8 }}>
                            <span className="filter__label">Карточка</span>
                            <select
                              className="select"
                              value={chosen}
                              disabled={locked || isSaving}
                              onChange={(e) => setSlot(match.matchId, slot, e.target.value)}
                              aria-label={`${meta.title}: выбрать карточку`}
                            >
                              <option value="">— не выбрано —</option>
                              {options.map((c) => (
                                <option key={c.instanceId} value={c.instanceId}>
                                  {cardShort(c)} · {RARITY_LABEL_RU[c.rarity]} (+{LINEUP_POINTS[c.rarity]})
                                </option>
                              ))}
                              {currentCard && !options.some((o) => o.instanceId === currentCard.instanceId) && chosen === currentCard.instanceId && (
                                <option value={currentCard.instanceId}>
                                  {cardShort(currentCard)} · {RARITY_LABEL_RU[currentCard.rarity]} (+{LINEUP_POINTS[currentCard.rarity]})
                                </option>
                              )}
                            </select>
                          </label>

                          <div className="slot__actions">
                            <button
                              type="button"
                              className="btn btn--sm"
                              disabled={locked || isSaving || !chosen}
                              onClick={() => clear(match.matchId, slot)}
                            >
                              Убрать
                            </button>
                          </div>

                          <div className="slot__hint">
                            {saveError ? <span style={{ color: '#ff9c88' }}>{saveError}</span> : locked ? (
                              <span>Изменение недоступно: матч начался.</span>
                            ) : options.length > 0 ? (
                              <span>Доступно карточек: {options.length}. {meta.hint}.</span>
                            ) : (
                              <span>Нет подходящих карточек. Нужна {slot === 'GK' ? 'карточка GK' : 'полевая карточка (DEF/MID/FWD)'} этой команды в этом матче.</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <style jsx>{`
        .match-card-wrap { padding: 14px; }
        .match-head {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 12px;
        }
        .match-head__teams {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
          font-family: var(--font-display);
          font-size: 18px;
          font-weight: 800;
          color: #fff;
        }
        .team-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 999px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.14);
        }
        .team-badge {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          object-fit: contain;
          flex: 0 0 22px;
          background: rgba(255,255,255,0.08);
        }
        .team-badge--fallback {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: .02em;
          color: var(--lime, #c8f25a);
          border: 1px solid rgba(200,242,90,0.35);
          background: rgba(200,242,90,0.08);
        }
        .contest-chip {
          padding: 3px 8px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .04em;
          border: 1px solid rgba(255,255,255,0.18);
          background: rgba(255,255,255,0.05);
          color: var(--text-dim, #e8e2d8);
        }
        .vs { color: var(--text-faint, #cfc6b8); font-size: 13px; text-transform: uppercase; letter-spacing: .08em; }
        .match-head__meta {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          font-weight: 700;
          color: var(--text-dim, #e8e2d8);
        }
        .status-chip {
          padding: 3px 8px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .06em;
          text-transform: uppercase;
          border: 1px solid rgba(255,255,255,0.18);
        }
        .status-chip--open { color: var(--lime, #c8f25a); border-color: rgba(200,242,90,.35); background: rgba(200,242,90,.08); }
        .status-chip--locked { color: #ffcc80; border-color: rgba(255,204,128,.35); background: rgba(255,204,128,.08); }

        .pitch {
          position: relative;
          border-radius: 16px;
          padding: 14px;
          border: 2px solid rgba(255,255,255,0.16);
          background:
            radial-gradient(120% 80% at 50% 0%, rgba(255,255,255,0.06), transparent 45%),
            linear-gradient(180deg, rgba(63, 107, 74, 0.42), rgba(24, 54, 38, 0.55)),
            rgba(10, 18, 16, 0.6);
          overflow: hidden;
          display: grid;
          grid-template-columns: 1fr 1fr;
          grid-template-areas:
            "of1 of2"
            "gk gk";
          gap: 12px;
        }
        .pitch__lines {
          position: absolute;
          inset: 10px;
          border: 1.5px solid rgba(255,255,255,0.16);
          border-radius: 12px;
          pointer-events: none;
        }
        .pitch__lines::before {
          content: '';
          position: absolute;
          left: 50%; top: 0; bottom: 0;
          width: 1.5px;
          transform: translateX(-50%);
          background: rgba(255,255,255,0.12);
        }
        .pitch__lines::after {
          content: '';
          position: absolute;
          left: 50%; top: 50%;
          width: 120px; height: 120px;
          transform: translate(-50%, -50%);
          border: 1.5px solid rgba(255,255,255,0.12);
          border-radius: 50%;
        }

        .slot {
          position: relative;
          z-index: 1;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.16);
          background: rgba(6, 10, 14, 0.55);
          backdrop-filter: blur(2px);
          padding: 10px;
          min-width: 0;
        }
        .slot--of1 { grid-area: of1; }
        .slot--of2 { grid-area: of2; }
        .slot--gk { grid-area: gk; max-width: 520px; justify-self: center; width: 100%; }

        .slot__head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
        .slot__badge {
          display: inline-flex; align-items: center; justify-content: center;
          min-width: 34px; height: 24px; padding: 0 8px;
          border-radius: 999px;
          background: rgba(200,242,90,0.12);
          border: 1px solid rgba(200,242,90,0.35);
          color: var(--lime, #c8f25a);
          font-size: 11px; font-weight: 800; letter-spacing: .08em;
        }
        .slot__title { font-family: var(--font-display); font-size: 14px; font-weight: 800; color: #fff; }
        .slot__autosave { margin-left: auto; font-size: 11px; font-weight: 700; color: var(--text-faint, #cfc6b8); min-height: 16px; }
        .slot__autosave[data-state="saving"] { color: #ffcc80; }
        .slot__autosave[data-state="saved"] { color: var(--lime, #c8f25a); }
        .slot__autosave[data-state="error"] { color: #ff9c88; }

        .slot__body {
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 10px;
          align-items: start;
        }
        .slot__card { display: flex; flex-direction: column; align-items: center; gap: 6px; }
        .slot__preview-note {
          font-size: 11px; font-weight: 700; color: #ffcc80;
          padding: 2px 8px; border-radius: 999px;
          background: rgba(255,204,128,0.1); border: 1px solid rgba(255,204,128,0.25);
        }
        .slot__empty {
          width: 170px;
          min-height: 220px;
          border-radius: 12px;
          border: 1.5px dashed rgba(255,255,255,0.22);
          background: rgba(255,255,255,0.03);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 10px;
          gap: 6px;
        }
        .slot__empty-icon { font-size: 22px; }
        .slot__empty-text { font-weight: 800; color: #fff; }
        .slot__empty-hint { font-size: 11px; color: var(--text-faint, #cfc6b8); line-height: 1.35; }

        .slot__controls { min-width: 0; }
        .bonus-line { font-size: 12px; font-weight: 700; margin-bottom: 8px; }
        .bonus-line--muted { color: var(--text-dim, #e8e2d8); }
        .bonus-line--good { color: var(--lime, #c8f25a); }
        .bonus-line--bad { color: #ff9c88; }
        .slot__actions { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 6px; }
        .slot__hint { font-size: 12px; color: var(--text-faint, #cfc6b8); line-height: 1.4; }
        .filter__label {
          display: block;
          font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;
          color: var(--text-faint, #cfc6b8); margin-bottom: 4px;
        }

        @media (max-width: 860px) {
          .slot__body { grid-template-columns: 1fr; justify-items: center; }
          .slot__controls { width: 100%; }
          .slot__empty { width: 100%; max-width: 220px; min-height: 140px; }
        }
        @media (max-width: 640px) {
          .pitch {
            grid-template-columns: 1fr;
            grid-template-areas:
              "of1"
              "of2"
              "gk";
          }
          .slot--gk { max-width: none; }
          .match-head__teams { font-size: 16px; }
        }
      `}</style>
    </div>
  );
}
