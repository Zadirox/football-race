'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { removeLineupSlotAction, saveLineupSlotAction } from '@/lib/actions/lineups';
import { Notice } from '@/components/ui/Panel';
import { teamDisplay } from '@/lib/data/team-names';
import type { LineupSlotKind, MatchLineupView, OwnedCardView } from '@/lib/types';

type Props = {
  matches: MatchLineupView[];
  ownedCards: OwnedCardView[];
};

const SLOT_LABEL: Record<LineupSlotKind, string> = {
  GK: 'Вратарь (GK)',
  OF1: 'Полевой 1',
  OF2: 'Полевой 2',
};

const ROLE_LABEL: Record<OwnedCardView['roleGroup'], string> = {
  GK: 'GK',
  DEF: 'DEF',
  MID: 'MID',
  FWD: 'FWD',
};

function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function canCardPlayMatch(cardTeam: string, homeName: string, awayName: string): boolean {
  const candidates = new Set([
    normalize(cardTeam),
    normalize(teamDisplay(cardTeam).name),
    normalize(teamDisplay(homeName).name),
    normalize(teamDisplay(awayName).name),
  ]);
  // heuristic: compare card team canonical/display against home/away canonical names
  const cardCanon = normalize(teamDisplay(cardTeam).name) || normalize(cardTeam);
  const homeCanon = normalize(teamDisplay(homeName).name) || normalize(homeName);
  const awayCanon = normalize(teamDisplay(awayName).name) || normalize(awayName);
  if (!cardCanon) return false;
  return cardCanon === homeCanon || cardCanon === awayCanon || candidates.has(cardCanon);
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

export function LineupsClient({ matches, ownedCards }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const byMatchSelection = useMemo(() => {
    const map = new Map<string, Map<LineupSlotKind, string>>();
    for (const m of matches) {
      const slots = new Map<LineupSlotKind, string>();
      for (const s of m.slots) if (s.card) slots.set(s.slot, s.card.instanceId);
      map.set(m.matchId, slots);
    }
    return map;
  }, [matches]);

  const [selections, setSelections] = useState(byMatchSelection);

  // keep local state in sync when server data refreshes
  useEffect(() => {
    setSelections(byMatchSelection);
  }, [byMatchSelection]);

  const setSlot = (matchId: string, slot: LineupSlotKind, cardInstanceId: string) => {
    setSelections((prev) => {
      const next = new Map(prev);
      const m = new Map(next.get(matchId) ?? []);
      m.set(slot, cardInstanceId);
      next.set(matchId, m);
      return next;
    });
  };

  const save = (matchId: string, slot: LineupSlotKind) => {
    const cardInstanceId = selections.get(matchId)?.get(slot);
    if (!cardInstanceId) {
      setFeedback({ ok: false, message: 'Выберите карточку для слота' });
      return;
    }
    const key = `${matchId}:${slot}`;
    setBusyKey(key);
    setFeedback(null);
    startTransition(async () => {
      const res = await saveLineupSlotAction({ matchId, slot, cardInstanceId });
      setFeedback(res);
      setBusyKey(null);
      if (res.ok) router.refresh();
    });
  };

  const clear = (matchId: string, slot: LineupSlotKind) => {
    const key = `${matchId}:${slot}:clear`;
    setBusyKey(key);
    setFeedback(null);
    startTransition(async () => {
      const res = await removeLineupSlotAction({ matchId, slot });
      setFeedback(res);
      setBusyKey(null);
      if (res.ok) router.refresh();
    });
  };

  const eligibleCards = (match: MatchLineupView, slot: LineupSlotKind) => {
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
      return canCardPlayMatch(c.nationalTeam, match.homeName, match.awayName);
    });
  };

  if (matches.length === 0) {
    return <Notice>На сегодня матчей для составов нет. Загляните позже, когда появится игровой день.</Notice>;
  }

  return (
    <div className="lineups">
      {feedback && (
        <div style={{ marginBottom: 12 }}>
          <Notice tone={feedback.ok ? 'info' : 'danger'}>{feedback.message}</Notice>
        </div>
      )}

      <div className="grid" style={{ gap: 16 }}>
        {matches.map((match) => {
          const home = teamDisplay(match.homeName);
          const away = teamDisplay(match.awayName);
          const locked = match.locked || new Date(match.kickoffUtc).getTime() <= Date.now();
          return (
            <section key={match.matchId} className="card">
              <div className="card__head" style={{ marginBottom: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <h2 className="card__title" style={{ marginBottom: 4 }}>
                    {home.name} — {away.name}
                  </h2>
                  <p className="card__meta">
                    {kickoffLabel(match.kickoffUtc)} МСК · {match.status}
                    {locked ? ' · состав заблокирован' : ' · можно менять до кик-оффа'}
                  </p>
                </div>
              </div>

              <div className="list">
                {(['GK', 'OF1', 'OF2'] as LineupSlotKind[]).map((slot) => {
                  const current = match.slots.find((s) => s.slot === slot) ?? { matchId: match.matchId, slot, card: null };
                  const currentCard = current.card;
                  const chosen = selections.get(match.matchId)?.get(slot) ?? '';
                  const options = eligibleCards(match, slot);
                  const key = `${match.matchId}:${slot}`;
                  const bonusText = current.bonusAwarded
                    ? `Бонус: +${current.bonusPoints ?? 0} (${current.bonusMethod === 'auto' ? 'авто' : 'вручную'})`
                    : current.bonusMethod
                      ? 'Бонус не засчитан'
                      : null;
                  return (
                    <div key={slot} className="card" style={{ padding: 12 }}>
                      <div className="card__meta" style={{ marginBottom: 6 }}>{SLOT_LABEL[slot]}</div>
                      {currentCard && (
                        <div className="card__text" style={{ marginBottom: 8 }}>
                          Сейчас: <strong>{currentCard.playerName}</strong> ({currentCard.nationalTeam}, {ROLE_LABEL[currentCard.roleGroup]}, {currentCard.rating}, {currentCard.rarity})
                          {bonusText ? <span> · {bonusText}</span> : null}
                        </div>
                      )}
                      <div className="field" style={{ marginBottom: 8 }}>
                        <label htmlFor={`slot-${key}`}>Карточка</label>
                        <select
                          id={`slot-${key}`}
                          className="select"
                          value={chosen}
                          disabled={locked || pending}
                          onChange={(e) => setSlot(match.matchId, slot, e.target.value)}
                        >
                          <option value="">— не выбрано —</option>
                          {options.map((c) => (
                            <option key={c.instanceId} value={c.instanceId}>
                              {c.playerName} · {c.nationalTeam} · {ROLE_LABEL[c.roleGroup]} · {c.rating} · {c.rarity}
                            </option>
                          ))}
                          {currentCard && !options.some((o) => o.instanceId === currentCard.instanceId) && (
                            <option value={currentCard.instanceId}>
                              {currentCard.playerName} · {currentCard.nationalTeam} · {ROLE_LABEL[currentCard.roleGroup]} · {currentCard.rating} · {currentCard.rarity}
                            </option>
                          )}
                        </select>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn btn--sm btn--primary"
                          disabled={locked || pending || !chosen}
                          onClick={() => save(match.matchId, slot)}
                        >
                          {busyKey === key ? 'Сохраняем…' : 'Сохранить'}
                        </button>
                        <button
                          type="button"
                          className="btn btn--sm"
                          disabled={locked || pending || (!current.card && !chosen)}
                          onClick={() => clear(match.matchId, slot)}
                        >
                          {busyKey === `${key}:clear` ? '…' : 'Очистить'}
                        </button>
                      </div>
                      {locked && <p className="card__meta" style={{ marginTop: 8 }}>Редактирование закрыто: матч начался.</p>}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}