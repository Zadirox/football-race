'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Panel, EmptyState, Notice } from '@/components/ui/Panel';
import type { MatchView } from '@/lib/types';

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
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Moscow',
  });
}

function Crest({ name, url }: { name: string; url: string | null }) {
  if (url) {
    // Логотипы провайдера — внешние; приватный проект, поэтому без оптимизатора Next.
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="team__crest" src={url} alt="" loading="lazy" />;
  }
  return (
    <span className="team__crest" style={{ display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800 }}>
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}

export function MatchesClient({ matches }: { matches: MatchView[] }) {
  const leagues = useMemo(() => {
    const map = new Map<string, { code: string; title: string; count: number }>();
    for (const match of matches) {
      const entry = map.get(match.leagueCode);
      if (entry) entry.count += 1;
      else map.set(match.leagueCode, { code: match.leagueCode, title: match.leagueTitle, count: 1 });
    }
    return [...map.values()];
  }, [matches]);

  const [league, setLeague] = useState<string | null>(null);
  const visible = league ? matches.filter((m) => m.leagueCode === league) : matches;

  return (
    <Panel
      title="Матчи дня"
      subtitle="Только разрешённые турниры: топ-5 лиг, Лига чемпионов, Лига наций, Евро, ЧМ и товарищеские топ-сборных. Время — МСК."
      size="wide"
      actions={
        <Link href="/predictions" className="btn btn--primary btn--sm">
          К предиктам
        </Link>
      }
    >
      <div className="filters" role="group" aria-label="Фильтр по турниру">
        <button type="button" className="filter" data-active={league === null} onClick={() => setLeague(null)}>
          Все <span className="filter__count">{matches.length}</span>
        </button>
        {leagues.map((item) => (
          <button
            key={item.code}
            type="button"
            className="filter"
            data-active={league === item.code}
            onClick={() => setLeague(item.code)}
          >
            {item.title} <span className="filter__count">{item.count}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState title="Матчей нет" text="Игровой день ещё не собран. Как только расписание появится, матчи приедут сюда." />
      ) : (
        <div className="grid grid--cards">
          {visible.map((match) => {
            const finished = match.status === 'FT';
            const live = match.status === 'LIVE' || match.status === 'HT';
            return (
              <article key={match.id} className="match-card">
                <div className="match-card__top">
                  <span>{match.leagueTitle}</span>
                  <span className={live ? 'chip chip--positive' : 'chip chip--muted'}>{STATUS_LABEL[match.status]}</span>
                </div>

                <div className="match-card__teams">
                  <div className="team">
                    <Crest name={match.homeName} url={match.homeLogo} />
                    <span className="team__name">{match.homeName}</span>
                  </div>
                  <div className={live ? 'score score--live' : 'score'}>
                    {match.homeScore !== null && match.awayScore !== null
                      ? `${match.homeScore} : ${match.awayScore}`
                      : '— : —'}
                    <span className="score__sub">
                      {match.minute !== null ? `${match.minute}′` : kickoffMsk(match.kickoffUtc)}
                    </span>
                  </div>
                  <div className="team team--away">
                    <Crest name={match.awayName} url={match.awayLogo} />
                    <span className="team__name">{match.awayName}</span>
                  </div>
                </div>

                <div className="card__meta" style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span>
                    {match.myAnswered} из {match.questionCount} ответов
                  </span>
                  <span>{finished ? 'ответы закрыты' : 'приём открыт'}</span>
                </div>
                <div className="progress" aria-hidden="true">
                  <div
                    className="progress__bar"
                    style={{ width: `${match.questionCount ? (match.myAnswered / match.questionCount) * 100 : 0}%` }}
                  />
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        <Notice tone="info">
          Ночные матчи после 00:00 МСК относятся к предыдущему игровому дню — день закрывается в 08:59:59 МСК.
        </Notice>
      </div>
    </Panel>
  );
}
