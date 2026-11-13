'use client';

import { useMemo, useState, useTransition } from 'react';
import { Panel, EmptyState, Notice } from '@/components/ui/Panel';
import { participationOk, PARTICIPATION_THRESHOLD_PERCENT } from '@/lib/game/dice';
import { canAnswer, dayState, type MatchdayView } from '@/lib/game/day-state';
import { submitAnswerAction } from '@/lib/actions/game';
import { teamDisplay } from '@/lib/data/team-names';
import type { MatchView, QuestionView, SeasonSnapshot } from '@/lib/types';

function kickoffMsk(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Moscow',
  });
}

export function PredictionsClient({ snapshot }: { snapshot: SeasonSnapshot }) {
  const { matches, questions, demo } = snapshot;
  const nowMs = Date.parse(snapshot.serverNow);
  const phase = dayState(snapshot.matchday, nowMs);
  const dayClosed = phase === 'closed';
  /** Отвечать может только участник сезона: зритель и гость смотрят. */
  const canPlay = snapshot.me?.isPlayer === true;

  const [choices, setChoices] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const question of questions) {
      if (question.myChoice) initial[question.id] = question.myChoice;
    }
    return initial;
  });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [league, setLeague] = useState<string | null>(null);

  const matchesById = useMemo(() => new Map(matches.map((m) => [m.id, m])), [matches]);
  const leagues = useMemo(() => {
    const map = new Map<string, string>();
    for (const match of matches) map.set(match.leagueCode, match.leagueTitle);
    return [...map.entries()];
  }, [matches]);

  const visibleMatches = league ? matches.filter((m) => m.leagueCode === league) : matches;
  const regular = questions.filter((q) => !q.isBonus);
  const answered = regular.filter((q) => choices[q.id]).length;
  const participation = regular.length ? answered / regular.length : 0;

  const pick = (questionId: string, key: string) => {
    if (!canPlay) return;
    const prev = choices[questionId];
    setChoices((state) => ({ ...state, [questionId]: key }));
    setSaveError(null);

    // В демо без базы ответ остаётся только в этой сессии браузера.
    if (demo) return;

    setSavingId(questionId);
    startTransition(async () => {
      const result = await submitAnswerAction({ questionId, choice: key });
      setSavingId(null);
      if (!result.ok) {
        // Если сохранить не удалось (например вопрос уже закрыт), возвращаем прежний выбор.
        setChoices((state) => {
          const next = { ...state };
          if (prev) next[questionId] = prev;
          else delete next[questionId];
          return next;
        });
        setSaveError(result.message || 'Не удалось сохранить ответ. Попробуй ещё раз.');
      }
    });
  };

  const answersChip = !canPlay ? (
    <span className="chip chip--muted">только просмотр</span>
  ) : dayClosed ? (
    <span className="chip chip--trap">приём закрыт</span>
  ) : savingId ? (
    <span className="chip chip--info">сохраняем…</span>
  ) : phase === 'upcoming' ? (
    <span className="chip chip--info">до старта матчей</span>
  ) : (
    <span className={participationOk(answered, regular.length) ? 'chip chip--positive' : 'chip'}>
      {answered} из {regular.length} обычных
    </span>
  );

  return (
    <Panel
      title="Предикты"
      subtitle={`Вопросы без букмекерской линии: ответ считается из финального счёта. Порог участия — ${PARTICIPATION_THRESHOLD_PERCENT}% вопросов дня.`}
      size="wide"
      actions={answersChip}
    >
      {!canPlay && (
        <div style={{ marginBottom: 16 }}>
          <Notice>
            {snapshot.me
              ? 'Зрительский режим: вопросы видны, но ответы принимает только участник сезона.'
              : 'Ты не вошёл в сезон: вопросы видны всем, ответы — только участникам. Вход — кнопкой «Войти» в шапке.'}
          </Notice>
        </div>
      )}

      {saveError && (
        <div style={{ marginBottom: 16 }}>
          <Notice>{saveError}</Notice>
        </div>
      )}

      {dayClosed && (
        <div style={{ marginBottom: 16 }}>
          <Notice>
            Приём ответов закрыт: игровой день завершён. Ответы зафиксированы и уходят на подсчёт — менять их уже
            нельзя.
          </Notice>
        </div>
      )}

      {!dayClosed && phase === 'upcoming' && (
        <div style={{ marginBottom: 16 }}>
          <Notice tone="info">
            Игровой день ещё не открыт: ответы принимаются до старта каждого матча — вопрос закрывается в момент
            начала игры.
          </Notice>
        </div>
      )}

      {demo && (
        <div style={{ marginBottom: 16 }}>
          <Notice tone="info">
            Демо-режим: ответы сохраняются на время сессии в браузере. После подключения базы они уйдут на сервер и
            закроются со стартом матча.
          </Notice>
        </div>
      )}

      <div className="stats" style={{ marginBottom: 18 }}>
        <div className="stat">
          <div className="stat__label">Участие</div>
          <div className="stat__value stat__value--lime">{Math.round(participation * 100)}%</div>
        </div>
        <div className="stat">
          <div className="stat__label">Вопросов дня</div>
          <div className="stat__value">{regular.length}</div>
        </div>
        <div className="stat">
          <div className="stat__label">Бонусных</div>
          <div className="stat__value">{questions.filter((q) => q.isBonus).length}</div>
        </div>
        <div className="stat">
          <div className="stat__label">Кубик за день</div>
          <div className="stat__value" style={{ fontSize: 15 }}>
            {!canPlay
              ? 'недоступен'
              : dayClosed
                ? 'закрыт'
                : participationOk(answered, regular.length)
                  ? 'будет'
                  : `нужно ${Math.ceil(regular.length * 0.8)} ответов`}
          </div>
        </div>
      </div>

      <div className="filters" role="group" aria-label="Фильтр по турниру">
        <button type="button" className="filter" data-active={league === null} onClick={() => setLeague(null)}>
          Все матчи
        </button>
        {leagues.map(([code, title]) => (
          <button
            key={code}
            type="button"
            className="filter"
            data-active={league === code}
            onClick={() => setLeague(code)}
          >
            {title}
          </button>
        ))}
      </div>

      {visibleMatches.length === 0 ? (
        <EmptyState title="Вопросов нет" text="Как только день будет собран, здесь появятся матчи и вопросы к ним." />
      ) : (
        <div className="list" style={{ gap: 22 }}>
          {visibleMatches.map((match) => (
            <MatchQuestions
              key={match.id}
              match={match}
              questions={questions.filter((q) => q.matchId === match.id)}
              choices={choices}
              onPick={pick}
              matchday={snapshot.matchday}
              nowMs={nowMs}
              canPlay={canPlay}
            />
          ))}
        </div>
      )}
    </Panel>
  );
}

function MatchQuestions({
  match,
  questions,
  choices,
  onPick,
  matchday,
  nowMs,
  canPlay,
}: {
  match: MatchView;
  questions: QuestionView[];
  choices: Record<string, string>;
  onPick: (questionId: string, key: string) => void;
  matchday: MatchdayView | null;
  nowMs: number;
  canPlay: boolean;
}) {
  const regular = questions.filter((q) => !q.isBonus);
  const answered = regular.filter((q) => choices[q.id]).length;
  const allLocked = questions.length > 0 && questions.every((q) => !canAnswer(q, matchday, nowMs));

  const home = teamDisplay(match.homeName);
  const away = teamDisplay(match.awayName);

  return (
    <section className="section" style={{ marginBottom: 0 }}>
      <div className="section__title" style={{ textTransform: 'none', letterSpacing: '0.02em', fontSize: 14, color: 'var(--snow)' }}>
        <span title={`${home.name} — ${away.name}`}>
          {home.name} — {away.name}
        </span>
        <span className="chip chip--muted" style={{ textTransform: 'uppercase' }}>
          {match.leagueTitle} · {kickoffMsk(match.kickoffUtc)}
        </span>
        {allLocked ? (
          <span className="chip chip--trap" style={{ marginLeft: 'auto' }}>
            приём закрыт
          </span>
        ) : (
          <span className="card__meta" style={{ marginLeft: 'auto' }}>
            {answered} из {regular.length} обычных
          </span>
        )}
      </div>

      <div className="grid" style={{ gap: 10 }}>
        {questions.map((question) => {
          const selected = choices[question.id];
          const closed = !canAnswer(question, matchday, nowMs);
          const open = !closed && canPlay;
          const resolved = question.status === 'resolved' && question.correctOption !== null;
          const hit = resolved && selected !== undefined && selected === question.correctOption;
          const miss = resolved && selected !== undefined && selected !== question.correctOption;

          const options = question.options.map((option) => (
            <button
              key={option.key}
              type="button"
              className="option"
              data-selected={selected === option.key}
              data-correct={resolved && question.correctOption === option.key ? 'true' : undefined}
              data-wrong={miss && selected === option.key ? 'true' : undefined}
              disabled={!open}
              onClick={() => {
                if (open) onPick(question.id, option.key);
              }}
            >
              {option.label}
            </button>
          ));

          return (
            <div key={question.id} className="question" data-bonus={question.isBonus}>
              <div className="question__prompt">
                <span>{question.prompt}</span>
                {question.isBonus && <span className="chip chip--gold">бонус · золотой кубик</span>}
                {hit && <span className="chip chip--positive">верно</span>}
                {miss && <span className="chip chip--negative">мимо</span>}
                {closed && !resolved && <span className="chip chip--muted">приём закрыт</span>}
              </div>

              {question.kind === 'exact_score' ? (
                <div className="exact-grid">{options}</div>
              ) : (
                <div className="question__options">{options}</div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
