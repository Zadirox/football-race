'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { openPackAction } from '@/lib/actions/cards';
import { preloadRevealSfx, playRevealStart } from '@/lib/game/reveal-sfx';
import { CardTile } from '@/components/cards/CardTile';
import type { FutCardPalette, FutCardVariant } from '@/components/cards/FutCard';
import { PackOpenReveal } from '@/components/cards/PackOpenReveal';
import { Notice } from '@/components/ui/Panel';
import { RARITY_LABEL_RU, ROLE_TITLE_RU } from '@/lib/game/cards-ui';
import type { CollectionProgressView } from '@/lib/repo/cards';
import type { CardSetKind, OwnedCardView, PackGrantView, PackOpenResultView } from '@/lib/types';

const NATIONAL_SET_ID = '00000000-0000-0000-0000-00000000c001';
const CLUB_SET_ID = '00000000-0000-0000-0000-00000000c002';

type SetTab = {
  id: string;
  kind: CardSetKind;
  title: string;
  packSubtitle: string;
  preopenKicker: string;
  preopenTitle: string;
  teamFilterLabel: string;
  teamFilterAll: string;
  searchPlaceholder: string;
};

const SET_TABS: SetTab[] = [
  {
    id: NATIONAL_SET_ID,
    kind: 'national',
    title: 'Сборные',
    packSubtitle: 'Невскрытые паки «Сборные». В каждом — 1 карточка, без дублей.',
    preopenKicker: 'NATIONAL PACK',
    preopenTitle: 'Сборные',
    teamFilterLabel: 'Сборная',
    teamFilterAll: 'Все сборные',
    searchPlaceholder: 'Поиск: игрок или сборная',
  },
  {
    id: CLUB_SET_ID,
    kind: 'club',
    title: 'Клубы',
    packSubtitle: 'Невскрытые паки «Клубный пак». 1 карточка + шанс 10% на вторую, без дублей.',
    preopenKicker: 'CLUB PACK',
    preopenTitle: 'Клубы',
    teamFilterLabel: 'Клуб',
    teamFilterAll: 'Все клубы',
    searchPlaceholder: 'Поиск: игрок или клуб',
  },
];

type Props = {
  packs: PackGrantView[];
  cards: OwnedCardView[];
  progresses: CollectionProgressView[];
};

const RARITY_ORDER: Record<OwnedCardView['rarity'], number> = {
  legend: 0,
  epic: 1,
  rare: 2,
  common: 3,
};

const RARITIES: OwnedCardView['rarity'][] = ['common', 'rare', 'epic', 'legend'];
const ROLES: OwnedCardView['roleGroup'][] = ['GK', 'DEF', 'MID', 'FWD'];

function pct(owned: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((owned / total) * 100);
}

function emptyProgress(setId: string): CollectionProgressView {
  return {
    setId,
    owned: 0,
    total: 0,
    byRarity: {
      common: { owned: 0, total: 0 },
      rare: { owned: 0, total: 0 },
      epic: { owned: 0, total: 0 },
      legend: { owned: 0, total: 0 },
    },
  };
}

export function CollectionClient({ packs, cards, progresses }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [packList, setPackList] = useState(packs);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [preopen, setPreopen] = useState<SetTab | null>(null);
  const [revealQueue, setRevealQueue] = useState<OwnedCardView[]>([]);
  const [revealIndex, setRevealIndex] = useState(0);
  const [revealComplete, setRevealComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const progressBySet = useMemo(() => {
    const map = new Map<string, CollectionProgressView>();
    for (const p of progresses) map.set(p.setId, p);
    return map;
  }, [progresses]);

  const availableTabs = useMemo(() => {
    return SET_TABS.filter((tab) => {
      const prog = progressBySet.get(tab.id);
      const hasCards = cards.some((c) => c.setId === tab.id);
      const hasPacks = packs.some((p) => p.setId === tab.id);
      return (prog?.total ?? 0) > 0 || hasCards || hasPacks;
    });
  }, [cards, packs, progressBySet]);

  const [activeSetId, setActiveSetId] = useState<string>(() => {
    if (packs.length > 0) return packs[0]!.setId;
    return availableTabs[0]?.id ?? NATIONAL_SET_ID;
  });

  useEffect(() => {
    setPackList(packs);
  }, [packs]);

  useEffect(() => {
    if (availableTabs.length === 0) return;
    if (!availableTabs.some((t) => t.id === activeSetId)) {
      setActiveSetId(availableTabs[0]!.id);
    }
  }, [availableTabs, activeSetId]);

  const activeTab = useMemo(
    () => availableTabs.find((t) => t.id === activeSetId) ?? availableTabs[0] ?? SET_TABS[0]!,
    [availableTabs, activeSetId],
  );

  const activeProgress = progressBySet.get(activeTab.id) ?? emptyProgress(activeTab.id);
  const activePacks = useMemo(() => packList.filter((p) => p.setId === activeTab.id), [packList, activeTab.id]);
  const activeCardsAll = useMemo(() => cards.filter((c) => c.setId === activeTab.id), [cards, activeTab.id]);

  const revealActive = preopen !== null || revealQueue.length > 0 || revealComplete;
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (revealActive) document.documentElement.dataset.packOpening = 'true';
    else delete document.documentElement.dataset.packOpening;
    return () => {
      delete document.documentElement.dataset.packOpening;
    };
  }, [revealActive]);

  const [variant, setVariant] = useState<FutCardVariant>('fut');
  const [palette, setPalette] = useState<FutCardPalette>('fut');
  const [query, setQuery] = useState('');
  const [rarity, setRarity] = useState<'all' | OwnedCardView['rarity']>('all');
  const [role, setRole] = useState<'all' | OwnedCardView['roleGroup']>('all');
  const [team, setTeam] = useState<'all' | string>('all');
  const [sort, setSort] = useState<'rarity' | 'rating' | 'name'>('rarity');

  useEffect(() => {
    setQuery('');
    setRarity('all');
    setRole('all');
    setTeam('all');
  }, [activeSetId]);

  const poolComplete = activeProgress.total > 0 && activeProgress.owned >= activeProgress.total;
  const percent = pct(activeProgress.owned, activeProgress.total);

  const teams = useMemo(() => {
    const set = new Set<string>();
    for (const c of activeCardsAll) {
      const label = c.clubName || c.nationalTeam;
      if (label) set.add(label);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'ru'));
  }, [activeCardsAll]);

  const visibleCards = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('ru');
    let list = activeCardsAll.filter((c) => {
      const teamLabel = c.clubName || c.nationalTeam;
      if (rarity !== 'all' && c.rarity !== rarity) return false;
      if (role !== 'all' && c.roleGroup !== role) return false;
      if (team !== 'all' && teamLabel !== team) return false;
      if (q) {
        const hay = `${c.playerName} ${teamLabel}`.toLocaleLowerCase('ru');
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    list = [...list].sort((a, b) => {
      if (sort === 'rating') {
        if (b.rating !== a.rating) return b.rating - a.rating;
        return a.playerName.localeCompare(b.playerName, 'ru');
      }
      if (sort === 'name') return a.playerName.localeCompare(b.playerName, 'ru');
      const r = RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity];
      if (r !== 0) return r;
      if (b.rating !== a.rating) return b.rating - a.rating;
      return a.playerName.localeCompare(b.playerName, 'ru');
    });
    return list;
  }, [activeCardsAll, query, rarity, role, team, sort]);

  const hasActiveFilters = query.trim() !== '' || rarity !== 'all' || role !== 'all' || team !== 'all';

  const open = (grant: PackGrantView) => {
    if (pending || preopen || revealQueue.length > 0 || revealComplete) return;
    const tab = SET_TABS.find((t) => t.id === grant.setId) ?? activeTab;
    setError(null);
    setOpeningId(grant.id);
    setPreopen(tab);
    preloadRevealSfx();
    playRevealStart();
    const started = Date.now();
    startTransition(async () => {
      try {
        const res = await openPackAction(grant.id);
        const wait = Math.max(0, 1800 - (Date.now() - started));
        if (wait) await new Promise((r) => setTimeout(r, wait));
        setOpeningId(null);
        if (!res.ok) {
          setPreopen(null);
          setError(res.message);
          return;
        }
        setPackList((prev) => prev.filter((p) => p.id !== grant.id));
        const result: PackOpenResultView = res.result;
        if (result.cards && result.cards.length > 0) {
          setRevealQueue(result.cards);
          setRevealIndex(0);
          setRevealComplete(false);
        } else {
          setRevealQueue([]);
          setRevealIndex(0);
          setRevealComplete(true);
        }
        setPreopen(null);
      } catch {
        setOpeningId(null);
        setPreopen(null);
        setError('Не удалось открыть пак. Попробуйте ещё раз.');
      }
    });
  };

  const resetFilters = () => {
    setQuery('');
    setRarity('all');
    setRole('all');
    setTeam('all');
  };

  const closeReveal = () => {
    if (revealQueue.length > 0 && revealIndex < revealQueue.length - 1) {
      setRevealIndex((i) => i + 1);
      return;
    }
    setRevealQueue([]);
    setRevealIndex(0);
    setRevealComplete(false);
    window.dispatchEvent(new Event('cards:packs-changed'));
    router.refresh();
  };

  const currentRevealCard = revealQueue[revealIndex] ?? null;

  return (
    <div className="collection">
      {preopen && (
        <div className="pack-preopen" aria-live="polite" aria-label="Подготовка к открытию пака">
          <div className="pack-preopen__bg" />
          <div className="pack-preopen__stage">
            <div className="pack-preopen__halo" />
            <div className="pack-preopen__ring pack-preopen__ring--a" />
            <div className="pack-preopen__ring pack-preopen__ring--b" />
            <div className="pack-preopen__pack">
              <div className="pack-preopen__pack-face">
                <span className="pack-preopen__kicker">{preopen.preopenKicker}</span>
                <span className="pack-preopen__title">{preopen.preopenTitle}</span>
                <span className="pack-preopen__sub">{preopen.kind === 'club' ? '1–2 карточки' : '1 карточка'}</span>
              </div>
              <div className="pack-preopen__sheen" />
            </div>
            <div className="pack-preopen__sparks" aria-hidden="true">
              <span /><span /><span /><span /><span /><span /><span /><span />
            </div>
            <div className="pack-preopen__caption">Подготовка к открытию…</div>
          </div>
        </div>
      )}

      {error && (
        <div style={{ marginBottom: 12 }}>
          <Notice tone="danger">{error}</Notice>
        </div>
      )}

      {availableTabs.length > 1 && (
        <div className="set-tabs" role="tablist" aria-label="Наборы карточек">
          {availableTabs.map((tab) => {
            const prog = progressBySet.get(tab.id) ?? emptyProgress(tab.id);
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={tab.id === activeTab.id}
                className={`set-tab${tab.id === activeTab.id ? ' set-tab--active' : ''}`}
                onClick={() => setActiveSetId(tab.id)}
              >
                <span className="set-tab__title">{tab.title}</span>
                <span className="set-tab__meta">{prog.owned}/{prog.total}</span>
              </button>
            );
          })}
        </div>
      )}

      <section className="section">
        <div className="section__head">
          <div>
            <h2 className="section__title">Паки — {activeTab.title}</h2>
            <p className="section__sub">{activeTab.packSubtitle}</p>
          </div>
        </div>
        {activePacks.length === 0 ? (
          <div className="soft-note">
            {poolComplete
              ? 'Невскрытых паков нет. Коллекция этого набора полностью собрана — новые карточки больше не выпадают.'
              : 'Невскрытых паков нет. Пак можно получить за игровой день, на клетке «Пак на выбор» или от админа.'}
          </div>
        ) : (
          <div className="packs">
            {activePacks.map((pack) => (
              <div key={pack.id} className="pack-row">
                <div className="pack-row__icon" aria-hidden="true">🎴</div>
                <div className="pack-row__main">
                  <div className="pack-row__title">{pack.packTitle}</div>
                  <div className="pack-row__meta">
                    Источник: {pack.source === 'admin' ? 'админ' : pack.source === 'matchday' ? 'игровой день' : 'клетка'}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn--sm btn--primary"
                  disabled={pending}
                  onClick={() => open(pack)}
                >
                  {pending && openingId === pack.id ? 'Открываем…' : 'Открыть'}
                </button>
              </div>
            ))}
          </div>
        )}
        {poolComplete && activePacks.length > 0 && (
          <div className="soft-note soft-note--warn" style={{ marginTop: 10 }}>
            Пул этого набора собран. Открытие пака не даст новую карточку (дубли не выдаются).
          </div>
        )}
      </section>

      <section className="section">
        <div className="section__head">
          <div>
            <h2 className="section__title">Коллекция — {activeTab.title}</h2>
            <p className="section__sub">Прогресс и поиск по вашим карточкам.</p>
          </div>
          <div className="progress-pill" aria-label="Прогресс коллекции">
            <span className="progress-pill__nums">{activeProgress.owned} / {activeProgress.total}</span>
            <span className="progress-pill__pct">{percent}%</span>
          </div>
        </div>

        <div className="progress-wrap">
          <div className="progress" role="progressbar" aria-valuenow={activeProgress.owned} aria-valuemin={0} aria-valuemax={activeProgress.total}>
            <div className="progress__bar" style={{ width: `${percent}%` }} />
          </div>
          <div className="rarity-stats">
            {RARITIES.map((r) => {
              const s = activeProgress.byRarity[r];
              return (
                <div key={r} className="rarity-stat" data-rarity={r}>
                  <span className="rarity-stat__dot" aria-hidden="true" />
                  <span className="rarity-stat__label">{RARITY_LABEL_RU[r]}</span>
                  <span className="rarity-stat__value">{s.owned}/{s.total}</span>
                </div>
              );
            })}
          </div>
          {poolComplete && (
            <div className="soft-note soft-note--ok" style={{ marginTop: 10 }}>
              Коллекция этого набора собрана — новых карточек без дублей больше нет.
            </div>
          )}
        </div>
      </section>

      <section className="section">
        <div className="filters-panel">
          <div className="filters-top">
            <label className="search" aria-label="Поиск по коллекции">
              <span className="search__icon" aria-hidden="true">⌕</span>
              <input
                className="search__input"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={activeTab.searchPlaceholder}
              />
            </label>
            <div className="filters-top__right">
              <label className="mini-select">
                <span>Сортировка</span>
                <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
                  <option value="rarity">Редкость → рейтинг</option>
                  <option value="rating">Рейтинг</option>
                  <option value="name">Имя</option>
                </select>
              </label>
              <label className="mini-select">
                <span>{activeTab.teamFilterLabel}</span>
                <select value={team} onChange={(e) => setTeam(e.target.value)}>
                  <option value="all">{activeTab.teamFilterAll}</option>
                  {teams.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
            </div>
          </div>

          <div className="filter-group">
            <div className="filter-group__label">Редкость</div>
            <div className="pills" role="group" aria-label="Фильтр по редкости">
              <button type="button" className={`pill${rarity === 'all' ? ' pill--active' : ''}`} onClick={() => setRarity('all')}>Все</button>
              {RARITIES.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`pill pill--${r}${rarity === r ? ' pill--active' : ''}`}
                  onClick={() => setRarity(r)}
                >
                  {RARITY_LABEL_RU[r]}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-group">
            <div className="filter-group__label">Позиция</div>
            <div className="pills" role="group" aria-label="Фильтр по позиции">
              <button type="button" className={`pill${role === 'all' ? ' pill--active' : ''}`} onClick={() => setRole('all')}>Все</button>
              {ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`pill${role === r ? ' pill--active' : ''}`}
                  onClick={() => setRole(r)}
                >
                  {ROLE_TITLE_RU[r]}
                </button>
              ))}
            </div>
          </div>

          <div className="filters-foot">
            <span className="filters-foot__count">Показано: <strong>{visibleCards.length}</strong> из {activeCardsAll.length}</span>
            {hasActiveFilters && (
              <button type="button" className="btn btn--sm" onClick={resetFilters}>Сбросить</button>
            )}
          </div>
        </div>

        <details className="style-details">
          <summary>Вид карточек (стиль и палитра)</summary>
          <div className="style-details__body">
            <label className="mini-select">
              <span>Стиль</span>
              <select value={variant} onChange={(e) => setVariant(e.target.value as FutCardVariant)}>
                <option value="fut">Классический FUT</option>
                <option value="premium">Премиум-тёмный</option>
              </select>
            </label>
            <label className="mini-select">
              <span>Палитра</span>
              <select value={palette} onChange={(e) => setPalette(e.target.value as FutCardPalette)}>
                <option value="fut">FUT-градиенты</option>
                <option value="lux">Тёмный люкс</option>
              </select>
            </label>
          </div>
        </details>

        {activeCardsAll.length === 0 ? (
          <div className="empty">
            <p>В вашей коллекции пока нет карточек этого набора. Откройте пак, чтобы получить первую карточку.</p>
          </div>
        ) : visibleCards.length > 0 ? (
          <div className="cards-grid">
            {visibleCards.map((card) => (
              <CardTile key={card.instanceId} card={card} variant={variant} palette={palette} />
            ))}
          </div>
        ) : (
          <div className="empty">
            <p>По выбранным фильтрам ничего не найдено.</p>
            <button type="button" className="btn btn--sm" onClick={resetFilters}>Сбросить фильтры</button>
          </div>
        )}
      </section>

      {(currentRevealCard || revealComplete) && (
        <PackOpenReveal
          card={revealComplete ? null : currentRevealCard}
          collectionComplete={revealComplete}
          variant={variant}
          palette={palette}
          poolCards={activeCardsAll}
          onClose={closeReveal}
        />
      )}

      {revealQueue.length > 1 && !revealComplete && (
        <div className="reveal-counter" aria-live="polite">Карта {revealIndex + 1} из {revealQueue.length}</div>
      )}

      <style jsx>{`
        .collection { display: grid; gap: 16px; }
        .set-tabs { display: flex; flex-wrap: wrap; gap: 8px; }
        .set-tab {
          appearance: none; border: 1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.04);
          color: var(--text-dim, #e8e2d8); padding: 10px 14px; border-radius: 12px; cursor: pointer;
          display: inline-flex; align-items: center; gap: 10px; font-weight: 800;
        }
        .set-tab--active {
          color: #0b1114; background: linear-gradient(180deg, #e9f7b5, #c8f25a); border-color: rgba(200,242,90,0.7);
        }
        .set-tab__title { font-size: 14px; }
        .set-tab__meta { font-size: 12px; opacity: 0.85; font-variant-numeric: tabular-nums; }
        .reveal-counter {
          position: fixed; top: 18px; left: 50%; transform: translateX(-50%); z-index: 90;
          padding: 6px 12px; border-radius: 999px; background: rgba(10,14,18,0.85); color: #fff;
          border: 1px solid rgba(255,255,255,0.18); font-size: 12px; font-weight: 800; letter-spacing: .04em;
          backdrop-filter: blur(6px);
        }
        .section {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.10);
          border-radius: 16px;
          padding: 16px;
        }
        .section__head {
          display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 10px; margin-bottom: 12px;
        }
        .section__title { margin: 0; font-family: var(--font-display); font-size: 20px; font-weight: 800; color: #fff; }
        .section__sub { margin: 4px 0 0; font-size: 13px; color: var(--text-faint, #cfc6b8); }
        .soft-note {
          padding: 12px 14px; border-radius: 12px; font-size: 14px; line-height: 1.45;
          color: var(--text-dim, #e8e2d8); background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
        }
        .soft-note--ok { border-color: rgba(200,242,90,0.22); background: rgba(200,242,90,0.06); }
        .soft-note--warn { border-color: rgba(255,204,128,0.22); background: rgba(255,204,128,0.06); }
        .packs { display: grid; gap: 8px; }
        .pack-row {
          display: flex; align-items: center; gap: 12px; padding: 10px 12px;
          border-radius: 12px; background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
        }
        .pack-row__icon { font-size: 22px; line-height: 1; }
        .pack-row__main { flex: 1; min-width: 0; }
        .pack-row__title { font-weight: 800; color: #fff; }
        .pack-row__meta { font-size: 12px; color: var(--text-faint, #cfc6b8); margin-top: 2px; }
        .progress-pill {
          display: inline-flex; align-items: baseline; gap: 8px; padding: 8px 12px;
          border-radius: 999px; background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.10); font-variant-numeric: tabular-nums;
        }
        .progress-pill__nums { font-weight: 800; color: #fff; }
        .progress-pill__pct { font-size: 13px; font-weight: 700; color: var(--lime, #c8f25a); }
        .progress-wrap { display: grid; gap: 10px; }
        .progress { width: 100%; height: 8px; border-radius: 999px; background: rgba(255,255,255,0.08); overflow: hidden; }
        .progress__bar { height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--lime, #c8f25a), #ffe08a); transition: width 300ms ease; }
        .rarity-stats { display: flex; flex-wrap: wrap; gap: 8px; }
        .rarity-stat {
          display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 999px;
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.10);
          font-size: 12px; font-variant-numeric: tabular-nums;
        }
        .rarity-stat__dot { width: 8px; height: 8px; border-radius: 50%; background: #aab4c0; }
        .rarity-stat[data-rarity='common'] .rarity-stat__dot { background: #b9a070; }
        .rarity-stat[data-rarity='rare'] .rarity-stat__dot { background: #6ec8ff; }
        .rarity-stat[data-rarity='epic'] .rarity-stat__dot { background: #d7a8ff; }
        .rarity-stat[data-rarity='legend'] .rarity-stat__dot { background: #ffd978; box-shadow: 0 0 8px rgba(255,217,120,0.5); }
        .rarity-stat__label { color: var(--text-dim, #e8e2d8); font-weight: 600; }
        .rarity-stat__value { color: #fff; font-weight: 800; }
        .filters-panel {
          display: grid; gap: 14px; padding: 14px; border-radius: 14px;
          background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);
          margin-bottom: 14px;
        }
        .filters-top { display: flex; flex-wrap: wrap; gap: 10px; align-items: stretch; }
        .filters-top__right { display: flex; flex-wrap: wrap; gap: 10px; margin-left: auto; }
        .search {
          flex: 1 1 260px; display: flex; align-items: center; gap: 8px; min-width: 220px;
          padding: 10px 12px; border-radius: 12px; background: rgba(0,0,0,0.18);
          border: 1px solid rgba(255,255,255,0.10);
        }
        .search:focus-within { border-color: rgba(200,242,90,0.35); box-shadow: 0 0 0 3px rgba(200,242,90,0.08); }
        .search__icon { color: var(--text-faint, #cfc6b8); font-size: 16px; }
        .search__input { flex: 1; min-width: 0; background: transparent; border: none; outline: none; color: #fff; font-size: 14px; }
        .search__input::placeholder { color: rgba(255,255,255,0.38); }
        .mini-select { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: var(--text-faint, #cfc6b8); font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
        .mini-select select {
          appearance: none; background: rgba(0,0,0,0.18); color: #fff; border: 1px solid rgba(255,255,255,0.12);
          border-radius: 10px; padding: 8px 10px; font-size: 13px; font-weight: 600; min-width: 160px;
        }
        .mini-select select:focus { outline: none; border-color: rgba(200,242,90,0.35); }
        .filter-group { display: grid; gap: 8px; }
        .filter-group__label { font-size: 12px; font-weight: 700; color: var(--text-dim, #e8e2d8); }
        .pills { display: flex; flex-wrap: wrap; gap: 8px; }
        .pill {
          appearance: none; border: 1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.03);
          color: var(--text-dim, #e8e2d8); padding: 7px 12px; border-radius: 999px; font-size: 13px; font-weight: 700;
          cursor: pointer; transition: background 150ms ease, border-color 150ms ease, color 150ms ease, transform 120ms ease;
        }
        .pill:hover { background: rgba(255,255,255,0.07); color: #fff; }
        .pill--active { color: #0b1114; background: linear-gradient(180deg, #e9f7b5, #c8f25a); border-color: rgba(200,242,90,0.7); box-shadow: 0 6px 18px rgba(200,242,90,0.18); }
        .pill--common.pill--active { background: linear-gradient(180deg, #efe1c2, #c9b07a); border-color: rgba(201,176,122,0.7); }
        .pill--rare.pill--active { background: linear-gradient(180deg, #dff3ff, #8fd8ff); border-color: rgba(143,216,255,0.7); }
        .pill--epic.pill--active { background: linear-gradient(180deg, #f2e2ff, #d8b0ff); border-color: rgba(216,176,255,0.7); }
        .pill--legend.pill--active { background: linear-gradient(180deg, #fff2c6, #ffd978); border-color: rgba(255,217,120,0.8); }
        .filters-foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; padding-top: 4px; border-top: 1px solid rgba(255,255,255,0.06); }
        .filters-foot__count { font-size: 13px; color: var(--text-faint, #cfc6b8); }
        .filters-foot__count strong { color: #fff; }
        .style-details { margin-bottom: 14px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.02); }
        .style-details summary { cursor: pointer; padding: 10px 12px; font-size: 13px; font-weight: 700; color: var(--text-dim, #e8e2d8); list-style: none; }
        .style-details summary::-webkit-details-marker { display: none; }
        .style-details__body { display: flex; flex-wrap: wrap; gap: 10px; padding: 0 12px 12px; }
        .cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(204px, 1fr)); gap: 18px; align-items: start; justify-items: center; }
        .empty { display: grid; justify-items: start; gap: 10px; padding: 18px; border-radius: 14px; background: rgba(255,255,255,0.03); border: 1px dashed rgba(255,255,255,0.14); color: var(--text-dim, #e8e2d8); }
        .empty p { margin: 0; }
        @media (max-width: 720px) {
          .filters-top__right { margin-left: 0; width: 100%; }
          .filters-top__right .mini-select { flex: 1 1 160px; }
          .filters-top__right .mini-select select { width: 100%; min-width: 0; }
        }
        @media (max-width: 520px) {
          .section { padding: 14px; }
          .cards-grid { grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 12px; }
          .pack-row { flex-wrap: wrap; }
          .pack-row .btn { width: 100%; }
        }
      `}</style>
    </div>
  );
}
