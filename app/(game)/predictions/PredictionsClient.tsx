'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Panel, EmptyState, Notice } from '@/components/ui/Panel';
import { canAnswer, dayState, type MatchdayView } from '@/lib/game/day-state';
import { distributionPercent, distributionTotal } from '@/lib/game/distribution';
import { dayResultDieLabel, formatDayAccuracy } from '@/lib/game/day-results';
import { formatRuDayMonth, formatRuDayMonthYear, formatRuKickoffMsk } from '@/lib/format';
import { loadMatchdayPredictionsAction, submitAnswerAction } from '@/lib/actions/game';
import { teamDisplay } from '@/lib/data/team-names';
import { answerFor, type QuestionRule } from '@/lib/data/questions';
import type { MatchView, QuestionView, SeasonSnapshot } from '@/lib/types';

const STATUS_LABEL: Record<MatchView['status'], string> = {
  NS: 'не начался',
  LIVE: 'идёт',
  HT: 'перерыв',
  FT: 'завершён',
  PST: 'перенесён',
  CANC: 'отменён',
  ABD: 'прерван',
};

function kickoffMsk(iso: string): string {
  return formatRuKickoffMsk(iso);
}

export function PredictionsClient({ snapshot }: { snapshot: SeasonSnapshot }) {
  const router = useRouter();
  const nowMs = Date.parse(snapshot.serverNow);

  const [view, setView] = useState<'current' | string>('current');
  const [pastLoading, setPastLoading] = useState(false);
  const [pastError, setPastError] = useState<string | null>(null);
  const [pastData, setPastData] = useState<{
    id: string;
    matchday: MatchdayView;
    matches: MatchView[];
    questions: QuestionView[];
  } | null>(null);

  const viewingPast = view !== 'current';
  const activeMatchday = viewingPast ? pastData?.matchday ?? null : snapshot.matchday;
  const matches = viewingPast ? (pastData?.matches ?? []) : snapshot.matches;
  const questions = viewingPast ? (pastData?.questions ?? []) : snapshot.questions;
  const demo = snapshot.demo;
  const phase = viewingPast ? 'closed' : dayState(snapshot.matchday, nowMs);
  const dayClosed = phase === 'closed' || viewingPast;
  /** Отвечать может только участник сезона и только в текущем дне. */
  const canPlay = !viewingPast && snapshot.me?.isPlayer === true;
  const lastClosed = !viewingPast && snapshot.me?.isPlayer ? snapshot.myLastClosedDayResult : null;

  const [choices, setChoices] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const question of snapshot.questions) {
      if (question.myChoice) initial[question.id] = question.myChoice;
    }
    return initial;
  });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [league, setLeague] = useState<string | null>(null);
  const [openMatches, setOpenMatches] = useState<Record<string, boolean>>({});

  // При обновлении текущего дня (polling/router.refresh) подхватываем новые выборы/данные.
  useEffect(() => {
    if (viewingPast) return;
    setChoices((state) => {
      const next = { ...state };
      for (const question of snapshot.questions) {
        if (question.myChoice) next[question.id] = question.myChoice;
      }
      return next;
    });
  }, [snapshot.questions, viewingPast]);

  const shouldPollLive = !viewingPast && snapshot.matches.some((m) => {
    if (m.status === 'LIVE' || m.status === 'HT') return true;
    if (m.status === 'FT' || m.status === 'PST' || m.status === 'CANC' || m.status === 'ABD') return false;
    const kickoff = Date.parse(m.kickoffUtc);
    if (Number.isNaN(kickoff)) return false;
    const now = Date.now();
    return kickoff <= now + 15 * 60_000 && kickoff >= now - 6 * 60 * 60_000;
  });

  useEffect(() => {
    if (!shouldPollLive || demo) return;
    const id = setInterval(() => {
      router.refresh();
    }, 30_000);
    return () => clearInterval(id);
  }, [shouldPollLive, demo, router]);

  useEffect(() => {
    setLeague(null);
    setOpenMatches({});
  }, [view, pastData?.id, snapshot.matchday?.id]);

  const pastOptions = useMemo(() => {
    const opts = snapshot.closedMatchdays.filter((d) => d.id !== snapshot.matchday?.id);
    // если текущий день закрыт, всё равно дадим выбрать его явно как архив из списка
    if (snapshot.matchday?.status === 'closed' && !opts.find((d) => d.id === snapshot.matchday?.id)) {
      const cur = snapshot.matchday;
      opts.unshift({ id: cur.id, gameDate: cur.gameDate, status: cur.status, qTotal: cur.qTotal, closesAt: cur.closesAt });
    }
    return opts;
  }, [snapshot.closedMatchdays, snapshot.matchday]);

  const openPastDay = async (id: string) => {
    if (id === 'current') {
      setView('current');
      setPastError(null);
      return;
    }
    setView(id);
    if (pastData?.id === id) return;
    setPastLoading(true);
    setPastError(null);
    try {
      const res = await loadMatchdayPredictionsAction(id);
      if (!res.ok) {
        setPastError(res.message);
        setPastData(null);
      } else {
        setPastData({ id, matchday: res.data.matchday, matches: res.data.matches, questions: res.data.questions });
      }
    } catch {
      setPastError('Не удалось загрузить данные дня.');
      setPastData(null);
    } finally {
      setPastLoading(false);
    }
  };

  const leagues = useMemo(() => {
    const map = new Map<string, string>();
    for (const match of matches) map.set(match.leagueCode, match.leagueTitle);
    return [...map.entries()];
  }, [matches]);

  const visibleMatches = league ? matches.filter((m) => m.leagueCode === league) : matches;

  // По умолчанию все матчи свёрнуты; участник раскрывает нужный вручную.
  useEffect(() => {
    if (viewingPast && !pastData) return;
    setOpenMatches((prev) => {
      const next = { ...prev };
      for (const match of visibleMatches) {
        if (next[match.id] !== undefined) continue;
        next[match.id] = false;
      }
      return next;
    });
  }, [visibleMatches, questions, choices, viewingPast, pastData]);
  const regular = questions.filter((q) => !q.isBonus);
  const answered = viewingPast
    ? regular.filter((q) => q.myChoice).length
    : regular.filter((q) => choices[q.id]).length;
  const correctCount = viewingPast
    ? regular.filter((q) => q.status === 'resolved' && q.myChoice && q.myChoice === q.correctOption).length
    : 0;
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

  const effectiveChoices = viewingPast
    ? Object.fromEntries(questions.flatMap((q) => (q.myChoice ? [[q.id, q.myChoice] as const] : [])))
    : choices;

  const answersChip = viewingPast ? (
    <span className="chip chip--muted">архив дня</span>
  ) : !snapshot.me?.isPlayer ? (
    <span className="chip chip--muted">только просмотр</span>
  ) : dayClosed ? (
    <span className="chip chip--trap">приём закрыт</span>
  ) : savingId ? (
    <span className="chip chip--info">сохраняем…</span>
  ) : phase === 'upcoming' ? (
    <span className="chip chip--info">до старта матчей</span>
  ) : (
    <span className="chip chip--positive">
      отвечено {answered} из {regular.length}
    </span>
  );

  const currentLabel = snapshot.matchday
    ? `Текущий день (${formatRuDayMonth(snapshot.matchday.gameDate)})`
    : 'Текущий день';
  const selectedPast = viewingPast
    ? pastOptions.find((d) => d.id === view) ?? snapshot.closedMatchdays.find((d) => d.id === view)
    : null;

  const toggleMatch = (id: string) => {
    setOpenMatches((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <Panel
      title="Прогнозы"
      subtitle={viewingPast
        ? 'Архив: матчи, проценты ответов и твои результаты за выбранный игровой день.'
        : 'Отвечай на вопросы по матчам дня. Ответы проверяются автоматически по итогам игр. Кубик за день получат все: даже без угаданных ответов — деревянный, а за точные прогнозы — лучше.'}
      size="wide"
      actions={answersChip}
    >
      {(pastOptions.length > 0 || viewingPast) && (
        <div className="predictions-daybar">
          <button
            type="button"
            className="filter"
            data-active={!viewingPast}
            onClick={() => void openPastDay('current')}
          >
            {currentLabel}
          </button>
          <label className="predictions-daybar__select">
            <span className="card__meta">Прошлый день:</span>
            <select
              className="predictions-select"
              value={viewingPast ? view : ''}
              onChange={(e) => { const id = e.target.value; if (id) void openPastDay(id); }}
              disabled={pastLoading}
              aria-label="Выбор прошедшего дня"
            >
              <option value="">{viewingPast ? (selectedPast ? formatRuDayMonthYear(selectedPast.gameDate) : 'выбран') : 'выбрать…'}</option>
              {pastOptions.map((d) => (
                <option key={d.id} value={d.id}>
                  {formatRuDayMonthYear(d.gameDate)}{d.qTotal != null ? ` · ${d.qTotal} вопр.` : ''}
                </option>
              ))}
            </select>
          </label>
          {pastLoading && <span className="chip chip--info">загружаем…</span>}
        </div>
      )}

      {viewingPast && pastError && (
        <div style={{ marginBottom: 16 }}>
          <Notice>{pastError}</Notice>
        </div>
      )}

      {viewingPast && !pastError && pastData && (
        <div style={{ marginBottom: 16 }}>
          <Notice tone="info">
            Просмотр прошедшего дня ({formatRuDayMonthYear(pastData.matchday.gameDate)}): приём ответов закрыт. Показаны проценты ответов и итог (верно/мимо) по твоим прогнозам.
            {regular.length > 0 ? ` Угадано ${correctCount} из ${regular.length} (${formatDayAccuracy(correctCount, regular.length)}).` : ''}
          </Notice>
        </div>
      )}

      {!viewingPast && !snapshot.me?.isPlayer && (
        <div style={{ marginBottom: 16 }}>
          <Notice>
            {snapshot.me
              ? 'Зрительский режим: вопросы видны, но ответы принимает только участник сезона.'
              : 'Ты не вошёл в сезон: вопросы видны всем, ответы — только участникам. Вход — кнопкой «Войти» в шапке.'}
          </Notice>
        </div>
      )}

      {!viewingPast && saveError && (
        <div style={{ marginBottom: 16 }}>
          <Notice>{saveError}</Notice>
        </div>
      )}

      {!viewingPast && dayClosed && snapshot.matchday?.status === 'closed' && (
        <div style={{ marginBottom: 16 }}>
          <Notice>
            Приём ответов закрыт: игровой день завершён. Ответы зафиксированы и уходят на подсчёт — менять их уже нельзя.
          </Notice>
        </div>
      )}

      {!viewingPast && lastClosed && (
        <div style={{ marginBottom: 16 }}>
          <Notice tone="info">
            Итоги прошедшего дня ({formatRuDayMonth(lastClosed.gameDate)}): угадано {lastClosed.correct} из {lastClosed.total} ({formatDayAccuracy(lastClosed.correct, lastClosed.total)}), кубик за день — {dayResultDieLabel(lastClosed.dieTier) ?? 'не выдан'}{lastClosed.bonusHit ? ', бонус за точный счёт получен.' : '.'}
            {pastOptions.length > 0 ? ' Ниже можно открыть прошлый день и посмотреть проценты и свои ответы.' : ''}
          </Notice>
        </div>
      )}

      {!viewingPast && !dayClosed && phase === 'upcoming' && (
        <div style={{ marginBottom: 16 }}>
          <Notice tone="info">
            Игровой день ещё не открыт: ответы принимаются до старта каждого матча — вопрос закрывается в момент начала игры.
          </Notice>
        </div>
      )}

      {demo && !viewingPast && (
        <div style={{ marginBottom: 16 }}>
          <Notice tone="info">
            Демо-режим: ответы сохраняются на время сессии в браузере. После подключения базы они уйдут на сервер и закроются со стартом матча.
          </Notice>
        </div>
      )}

      {shouldPollLive && (
        <div style={{ marginBottom: 16 }}>
          <Notice tone="info">Идут матчи: счёт и статистика обновляются автоматически (примерно каждые 30 секунд при живых матчах) по мере поступления данных. В вопросах показывается текущее состояние условий (например, «сейчас: Да»), когда его можно определить по данным матча.</Notice>
        </div>
      )}

      {viewingPast && pastLoading ? (
        <EmptyState title="Загрузка…" text="Подтягиваем матчи, статистику и проценты ответов за выбранный день." />
      ) : viewingPast && (!pastData || pastError) ? (
        !pastError ? <EmptyState title="Выберите день" text="Выберите прошлый игровой день, чтобы посмотреть статистику и результаты." /> : null
      ) : (
        <>
          <div className="stats" style={{ marginBottom: 18 }}>
            <div className="stat">
              <div className="stat__label">{viewingPast ? 'Твой результат' : 'Твой прогресс'}</div>
              <div className="stat__value stat__value--lime">{viewingPast ? correctCount : Math.round(participation * 100) + '%'}</div>
              <div className="card__meta">{viewingPast ? `угадано ${correctCount} из ${regular.length} (${formatDayAccuracy(correctCount, regular.length)})` : `отвечено ${answered} из ${regular.length} основных`}</div>
            </div>
            <div className="stat">
              <div className="stat__label">Основных вопросов</div>
              <div className="stat__value">{regular.length}</div>
            </div>
            <div className="stat">
              <div className="stat__label">Бонусных вопросов</div>
              <div className="stat__value">{questions.filter((q) => q.isBonus).length}</div>
            </div>
            <div className="stat">
              <div className="stat__label">{viewingPast ? 'Ответов дано' : 'Кубик за день'}</div>
              <div className="stat__value" style={{ fontSize: viewingPast ? 28 : 15 }}>
                {viewingPast ? answered : (!canPlay ? 'недоступен' : dayClosed ? 'день завершён' : 'деревянный или лучше')}
              </div>
              {!viewingPast && canPlay && !dayClosed && (
                <div className="card__meta">кубик дадут всем участникам, даже без угаданных ответов</div>
              )}
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
            <EmptyState title="Вопросов нет" text={viewingPast ? 'В этом дне нет матчей для отображения.' : 'Как только день будет собран, здесь появятся матчи и вопросы к ним.'} />
          ) : (
            <div className="predictions-matches">
              {visibleMatches.map((match) => {
                const mq = questions.filter((q) => q.matchId === match.id);
                const regularQ = mq.filter((q) => !q.isBonus);
                const answeredCount = regularQ.filter((q) => effectiveChoices[q.id]).length;
                const complete = regularQ.length > 0 && answeredCount === regularQ.length;
                const isOpen = openMatches[match.id] ?? false;
                return (
                  <MatchQuestions
                    key={match.id}
                    match={match}
                    questions={mq}
                    choices={effectiveChoices}
                    onPick={pick}
                    matchday={activeMatchday}
                    nowMs={nowMs}
                    canPlay={canPlay}
                    open={isOpen}
                    complete={complete}
                    answered={answeredCount}
                    onToggle={() => toggleMatch(match.id)}
                  />
                );
              })}
            </div>
          )}
        </>
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
  open = true,
  complete = false,
  answered: answeredProp,
  onToggle,
}: {
  match: MatchView;
  questions: QuestionView[];
  choices: Record<string, string>;
  onPick: (questionId: string, key: string) => void;
  matchday: MatchdayView | null;
  nowMs: number;
  canPlay: boolean;
  open?: boolean;
  complete?: boolean;
  answered?: number;
  onToggle?: () => void;
}) {
  const regular = questions.filter((q) => !q.isBonus);
  const answered = answeredProp ?? regular.filter((q) => choices[q.id]).length;
  const allLocked = questions.length > 0 && questions.every((q) => !canAnswer(q, matchday, nowMs));
  const live = match.status === 'LIVE' || match.status === 'HT';
  const finished = match.status === 'FT';
  const hasScore = match.homeScore !== null && match.awayScore !== null;

  const home = teamDisplay(match.homeName);
  const away = teamDisplay(match.awayName);

  const localizeText = (text: string): string =>
    text
      .replaceAll(match.homeName, home.name)
      .replaceAll(match.awayName, away.name);

  const stats = match.stats;
  const statParts: string[] = [];
  if (stats.cornersHome != null && stats.cornersAway != null) {
    statParts.push(`угловые ${stats.cornersHome}:${stats.cornersAway} (${stats.cornersHome + stats.cornersAway})`);
  }
  const ycKnown = stats.yellowCardsHome != null && stats.yellowCardsAway != null;
  const rcKnown = stats.redCardsHome != null && stats.redCardsAway != null;
  if (ycKnown || rcKnown) {
    const yc = ycKnown ? `${stats.yellowCardsHome}:${stats.yellowCardsAway}` : '—';
    const rc = rcKnown ? `${stats.redCardsHome}:${stats.redCardsAway}` : '—';
    statParts.push(`ЖК ${yc}${rcKnown ? `, КК ${rc}` : ''}`);
  }
  if (stats.shotsOnTargetHome != null && stats.shotsOnTargetAway != null) {
    statParts.push(`УВ ${stats.shotsOnTargetHome}:${stats.shotsOnTargetAway} (${stats.shotsOnTargetHome + stats.shotsOnTargetAway})`);
  }
  if (stats.possessionHome != null && stats.possessionAway != null) {
    statParts.push(`владение ${stats.possessionHome}%:${stats.possessionAway}%`);
  }
  const showStats = statParts.length > 0 && (match.status === 'LIVE' || match.status === 'HT' || match.status === 'FT');

  return (
    <section
      className={`predictions-match${complete ? ' predictions-match--complete' : ''}${open ? ' predictions-match--open' : ''}`}
      data-complete={complete ? 'true' : undefined}
    >
      <div className="predictions-match__head">
        <button
          type="button"
          className="predictions-match__toggle"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={`match-${match.id}-questions`}
        >
          <span className="predictions-match__chev" aria-hidden="true">{open ? '▾' : '▸'}</span>
          <div className="predictions-match__head-main">
            <div className="predictions-match__title" title={`${home.name} — ${away.name}`}>
              {home.name} <span className="predictions-match__vs">—</span> {away.name}
            </div>
            <div className="predictions-match__meta">
              <span className={live ? 'chip chip--positive' : finished ? 'chip chip--info' : 'chip chip--muted'}>
                {STATUS_LABEL[match.status]}
              </span>
              <span className={live ? 'chip chip--info' : 'chip chip--muted'}>
                {hasScore ? `${match.homeScore} : ${match.awayScore}` : '— : —'}
                {match.minute !== null ? ` · ${match.minute}′` : ''}
              </span>
              <span className="chip chip--muted">{match.leagueTitle}</span>
              <span className="chip chip--muted">начало {kickoffMsk(match.kickoffUtc)}</span>
              {allLocked ? (
                <span className="chip chip--trap">приём закрыт</span>
              ) : (
                <span className="chip chip--info">приём до {kickoffMsk(match.kickoffUtc)}</span>
              )}
            </div>
            {showStats && (
              <div className="predictions-match__meta predictions-match__stats">
                <span className="chip chip--muted" title="Статистика матча (по последним данным)">
                  {statParts.join(' · ')}
                </span>
              </div>
            )}
          </div>
          <div className="predictions-match__progress" aria-label={`Отвечено ${answered} из ${regular.length}`}>
            {complete ? (
              <span className="chip chip--positive predictions-match__complete-badge">✓ все ответы</span>
            ) : (
              <span className="chip chip--muted">{answered}/{regular.length}</span>
            )}
          </div>
        </button>
      </div>

      {open && (
      <div id={`match-${match.id}-questions`} className="predictions-match__questions">
        {questions.map((question) => {
          const selected = choices[question.id];
          const closed = !canAnswer(question, matchday, nowMs);
          const open = !closed && canPlay;
          const resolved = question.status === 'resolved' && question.correctOption !== null;
          const hit = resolved && selected !== undefined && selected === question.correctOption;
          const miss = resolved && selected !== undefined && selected !== question.correctOption;

          const liveNow =
            !resolved && question.rule
              ? answerFor(
                  question.rule as QuestionRule,
                  {
                    home: match.homeScore,
                    away: match.awayScore,
                    htHome: match.stats.htHomeScore,
                    htAway: match.stats.htAwayScore,
                  },
                  {
                    cornersHome: match.stats.cornersHome,
                    cornersAway: match.stats.cornersAway,
                    yellowCardsHome: match.stats.yellowCardsHome,
                    yellowCardsAway: match.stats.yellowCardsAway,
                    redCardsHome: match.stats.redCardsHome,
                    redCardsAway: match.stats.redCardsAway,
                    possessionHome: match.stats.possessionHome,
                    possessionAway: match.stats.possessionAway,
                    shotsOnTargetHome: match.stats.shotsOnTargetHome,
                    shotsOnTargetAway: match.stats.shotsOnTargetAway,
                  },
                )
              : null;
          const liveNowOption = liveNow != null ? question.options.find((o) => o.key === liveNow) : null;
          const liveNowLabel =
            liveNow == null
              ? null
              : liveNowOption
                ? localizeText(
                    liveNow === 'home' ? home.name : liveNow === 'away' ? away.name : liveNowOption.label,
                  )
                : liveNow === 'yes'
                  ? 'Да'
                  : liveNow === 'no'
                    ? 'Нет'
                    : String(liveNow);

          const distTotal = distributionTotal(question.distribution);
          const options = question.options.map((option) => {
            let label = localizeText(option.label);
            if (option.key === 'home') label = home.name;
            if (option.key === 'away') label = away.name;
            const pct = distTotal > 0 ? distributionPercent(question.distribution, option.key) : null;
            return (
              <button
                key={option.key}
                type="button"
                className="option"
                data-selected={selected === option.key}
                data-correct={resolved && question.correctOption === option.key ? 'true' : undefined}
                data-wrong={miss && selected === option.key ? 'true' : undefined}
                data-live-now={!resolved && liveNow === option.key ? 'true' : undefined}
                disabled={!open}
                onClick={() => {
                  if (open) onPick(question.id, option.key);
                }}
              >
                <span>{label}</span>
                {pct !== null && <span className="option__dist"> · {pct}%</span>}
              </button>
            );
          });

          return (
            <div key={question.id} className="question question--compact" data-bonus={question.isBonus}>
              <div className="question__prompt">
                <span>{localizeText(question.prompt)}</span>
                <span className="question__tags">
                  {question.isBonus && <span className="chip chip--gold">бонус</span>}
                  {hit && <span className="chip chip--positive">верно</span>}
                  {miss && <span className="chip chip--negative">мимо</span>}
                  {closed && !resolved && <span className="chip chip--muted">закрыт</span>}
                  {liveNowLabel && !resolved && (match.status === 'LIVE' || match.status === 'HT' || match.status === 'FT') && (
                    <span className="chip chip--info" title="Текущее состояние по последним данным матча">
                      сейчас: {liveNowLabel}
                    </span>
                  )}
                </span>
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
      )}
    </section>
  );
}
