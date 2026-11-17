import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Panel, Notice, SectionTitle } from '@/components/ui/Panel';
import { Avatar } from '@/components/ui/Avatar';
import { getViewer } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { hasDatabase, serverEnv } from '@/lib/env';
import { formatRuDayMonth } from '@/lib/format';
import { describeEffects } from '@/lib/game/engine';
import { formatAccuracy, MIN_ANSWERS_FOR_ACCURACY } from '@/lib/game/scoring';
import { getCollectionProgress, listCollection } from '@/lib/repo/cards';
import { loadSeasonSnapshot } from '@/lib/repo/season';

async function getActiveSeasonId(): Promise<string | null> {
  if (!hasDatabase()) return null;
  const rows = await db()<{ id: string }[]>`
    select id from seasons where status = 'active' order by starts_on desc limit 1
  `;
  return rows[0]?.id ?? null;
}

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [snapshot, viewer] = await Promise.all([loadSeasonSnapshot(), getViewer()]);
  const player = snapshot.players.find((p) => p.profileId === id) ?? null;
  if (!player) notFound();

  const isMe = viewer?.profileId === player.profileId;
  const { cardsEnabled } = serverEnv();
  let collection: Awaited<ReturnType<typeof listCollection>> = [];
  let progress: Awaited<ReturnType<typeof getCollectionProgress>> | null = null;
  if (cardsEnabled && hasDatabase()) {
    try {
      const seasonId = snapshot.season?.id ?? (await getActiveSeasonId());
      if (seasonId) {
        [collection, progress] = await Promise.all([
          listCollection(player.profileId, seasonId),
          getCollectionProgress(player.profileId, seasonId),
        ]);
      }
    } catch {
      collection = [];
      progress = null;
    }
  }

  const effects = describeEffects({ position: player.position, effects: player.effects, finished: player.position >= 80 });
  const accuracy = player.answered ? player.correct / player.answered : null;
  const rank = [...snapshot.players].sort((a, b) => b.points - a.points || b.position - a.position).findIndex((p) => p.profileId === player.profileId) + 1;
  const recentCards = collection.slice(0, 12);
  const lastClosed = isMe ? snapshot.myLastClosedDayResult : null;

  return (
    <Panel
      title={isMe ? 'Мой профиль' : `Профиль: ${player.nickname}`}
      subtitle={isMe ? 'Ваша статистика, коллекция и прогресс в сезоне.' : 'Статистика игрока, коллекция и прогресс в сезоне.'}
      size="wide"
      actions={
        <Link href="/participants" className="btn btn--sm">Все участники</Link>
      }
    >
      <div className="profile-hero">
        <Avatar nickname={player.nickname} avatarUrl={player.avatarUrl} size="lg" />
        <div className="profile-hero__main">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 28, lineHeight: 1.1 }}>{player.nickname}</h2>
            <span className="chip chip--info">{player.role === 'admin' ? 'админ' : player.role === 'spectator' ? 'зритель' : 'игрок'}</span>
            {isMe && <span className="chip chip--positive">это вы</span>}
          </div>
          <div className="card__meta">Клетка {player.position} из 80 · место в сезоне: {rank > 0 ? `${rank}` : '—'}</div>
          {player.lastAction && <div className="card__meta">Последнее действие: {player.lastAction}</div>}
        </div>
      </div>

      <div className="stats" style={{ marginBottom: 18 }}>
        <div className="stat">
          <div className="stat__label">Очки</div>
          <div className="stat__value stat__value--lime">{player.points}</div>
        </div>
        <div className="stat">
          <div className="stat__label">Точность</div>
          <div className="stat__value" style={{ fontSize: 22 }}>{formatAccuracy(accuracy)}</div>
          <div className="card__meta">{player.correct} из {player.answered}</div>
        </div>
        <div className="stat">
          <div className="stat__label">Ответов</div>
          <div className="stat__value">{player.answered}</div>
          {player.answered < MIN_ANSWERS_FOR_ACCURACY && <div className="card__meta">до зачёта точности ещё {MIN_ANSWERS_FOR_ACCURACY - player.answered}</div>}
        </div>
        <div className="stat">
          <div className="stat__label">Кубики</div>
          <div className="stat__value" style={{ fontSize: 18 }}>d6×{player.dice.gold} · d4×{player.dice.silver} · d3×{player.dice.bronze} · d2×{player.dice.wood}</div>
        </div>
      </div>

      {lastClosed && (
        <Notice tone="info">
          Итоги прошлого дня ({formatRuDayMonth(lastClosed.gameDate)}): угадано {lastClosed.correct} из {lastClosed.total}, кубик — {lastClosed.dieTier ?? '—'}{lastClosed.bonusHit ? ', бонус за точный счёт: да' : ''}.
        </Notice>
      )}

      <SectionTitle>Эффекты и любимые</SectionTitle>
      <div className="grid grid--two" style={{ marginBottom: 20 }}>
        <div className="card">
          <h3 className="card__title">Эффекты</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {effects.length === 0 ? <span className="chip chip--muted">эффектов нет</span> : effects.map((e) => (
              <span key={e.code} className="chip chip--info">{e.label}{e.charges > 1 ? ` ×${e.charges}` : ''}</span>
            ))}
          </div>
        </div>
        <div className="card">
          <h3 className="card__title">Любимые</h3>
          <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
            <div><span style={{ opacity: 0.7 }}>Сборная:</span> {player.favoriteNationalTeam?.name ?? '—'}</div>
            <div><span style={{ opacity: 0.7 }}>Клуб:</span> {player.favoriteClub?.name ?? '—'}</div>
            <div><span style={{ opacity: 0.7 }}>Игрок:</span> {player.favoritePlayer?.name ?? '—'}</div>
          </div>
        </div>
      </div>

      <SectionTitle>Карточки</SectionTitle>
      {!cardsEnabled ? (
        <Notice>Раздел карточек временно недоступен.</Notice>
      ) : collection.length === 0 ? (
        <Notice tone="info">Пока нет карточек в коллекции.</Notice>
      ) : (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
            <div className="card__meta">Всего карточек: {collection.length}{progress ? ` · собрано: ${progress.owned}/${progress.total}` : ''}</div>
            {isMe && <Link href="/collection" className="btn btn--sm">Открыть коллекцию</Link>}
          </div>
          {progress && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {(['common','rare','epic','legend'] as const).map((r) => (
                <span key={r} className="chip chip--muted">{r}: {progress.byRarity[r].owned}/{progress.byRarity[r].total}</span>
              ))}
            </div>
          )}
          <div className="profile-cards-grid">
            {recentCards.map((card) => (
              <div key={card.instanceId} className="profile-card-mini">
                <div className="profile-card-mini__name">{card.playerName}</div>
                <div className="profile-card-mini__meta">{card.nationalTeam || '—'} · {card.roleGroup} · {card.rarity}</div>
                <div className="profile-card-mini__rating">{card.rating}</div>
              </div>
            ))}
          </div>
          {collection.length > recentCards.length && (
            <div className="card__meta" style={{ marginTop: 10 }}>Показаны последние {recentCards.length} из {collection.length}.</div>
          )}
        </div>
      )}
    </Panel>
  );
}
