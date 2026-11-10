'use client';

import { useMemo, useState } from 'react';
import { Panel, EmptyState } from '@/components/ui/Panel';
import { MECHANICS, POLARITY_LABEL, type MechanicPolarity } from '@/lib/game/catalog';

const POLARITY_CHIP: Record<MechanicPolarity, string> = {
  positive: 'chip--positive',
  negative: 'chip--negative',
  neutral: 'chip--info',
  trap: 'chip--trap',
};

const APPLICATION_LABEL: Record<string, string> = {
  auto: 'срабатывает само',
  choice: 'нужен выбор',
  other: 'на другого игрока',
};

type Filter = 'all' | MechanicPolarity | 'core';

export function EffectsClient() {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const counts = useMemo(() => {
    const result: Record<string, number> = { all: MECHANICS.length, core: 0 };
    for (const item of MECHANICS) {
      result[item.polarity] = (result[item.polarity] ?? 0) + 1;
      if (item.core) result.core = (result.core ?? 0) + 1;
    }
    return result;
  }, []);

  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    return MECHANICS.filter((item) => {
      if (filter === 'core' && !item.core) return false;
      if (filter !== 'all' && filter !== 'core' && item.polarity !== filter) return false;
      if (!text) return true;
      return (
        item.name.toLowerCase().includes(text) ||
        item.tagline.toLowerCase().includes(text) ||
        item.description.toLowerCase().includes(text) ||
        item.code.includes(text)
      );
    });
  }, [filter, query]);

  return (
    <Panel
      title="Эффекты на карте"
      subtitle="Сорок клеток из восьмидесяти — событийные. Здесь все механики: что творится, как это работает и как друг с другом сталкивается."
      size="wide"
    >
      <div className="search">
        <span aria-hidden="true">⌕</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Найти механику: VAR, газон, передача…"
          aria-label="Поиск по механикам"
        />
      </div>

      <div className="filters" role="group" aria-label="Фильтр механик">
        {(
          [
            ['all', 'Все'],
            ['core', 'В релизе'],
            ['positive', 'Позитив'],
            ['negative', 'Негатив'],
            ['neutral', 'Нейтрально'],
            ['trap', 'Ловушки'],
          ] as Array<[Filter, string]>
        ).map(([key, label]) => (
          <button key={key} type="button" className="filter" data-active={filter === key} onClick={() => setFilter(key)}>
            {label} <span className="filter__count">{counts[key] ?? 0}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState title="Ничего не нашлось" text="Попробуй короче: «карточка», «передача», «риск»." />
      ) : (
        <div className="grid grid--cards">
          {visible.map((item) => (
            <article key={item.code} className="card">
              <div className="card__head">
                <span className="chip chip--muted">{item.code}</span>
                <h3 className="card__title">{item.name}</h3>
                <span className={`chip ${POLARITY_CHIP[item.polarity]}`} style={{ marginLeft: 'auto' }}>
                  {POLARITY_LABEL[item.polarity]}
                </span>
              </div>
              <p className="card__meta" style={{ marginBottom: 6 }}>
                {item.tagline}
              </p>
              <p className="card__text">{item.description}</p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
                <span className="chip chip--muted">{APPLICATION_LABEL[item.application]}</span>
                {item.core ? (
                  <span className="chip chip--positive">в релизе 12 ноября</span>
                ) : (
                  <span className="chip">вторая волна</span>
                )}
              </div>
              {item.note && (
                <p className="card__meta" style={{ marginTop: 10 }}>
                  {item.note}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </Panel>
  );
}
