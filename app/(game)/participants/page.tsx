import Link from 'next/link';
import { Panel } from '@/components/ui/Panel';
import { describeEffects } from '@/lib/game/engine';
import { accuracyOf, formatAccuracy, MIN_ANSWERS_FOR_ACCURACY } from '@/lib/game/scoring';
import { loadSeasonSnapshot } from '@/lib/repo/season';
import type { PlayerView } from '@/lib/types';

const ROLE_LABEL: Record<PlayerView['role'], string> = {
  admin: 'админ',
  player: 'игрок',
  spectator: 'зритель',
};

const ROLE_CHIP: Record<PlayerView['role'], string> = {
  admin: 'chip--gold',
  player: 'chip--positive',
  spectator: 'chip--info',
};

const DICE_ORDER: Array<{ tier: keyof PlayerView['dice']; label: string }> = [
  { tier: 'gold', label: 'd6' },
  { tier: 'silver', label: 'd4' },
  { tier: 'bronze', label: 'd3' },
  { tier: 'wood', label: 'd2' },
];

function hueFor(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 360;
  return hash;
}

export default async function ParticipantsPage() {
  const snapshot = await loadSeasonSnapshot();
  const players = [...snapshot.players].sort((a, b) => b.position - a.position);

  return (
    <Panel
      title="Участники"
      subtitle={`${snapshot.season.title} · ${players.length} человек. У каждого свой цвет на карте, свои эффекты и свой запас кубиков.`}
      size="wide"
      actions={
        <Link href="/ratings" className="btn btn--sm">
          Все рейтинги
        </Link>
      }
    >
      <div className="grid grid--cards">
        {players.map((player) => {
          const effects = describeEffects({
            position: player.position,
            effects: player.effects,
            finished: player.position >= 80,
          });
          const hue = hueFor(player.nickname);
          const accuracy = accuracyOf(player);
          return (
            <article key={player.profileId} className="card">
              <div className="card__head">
                <span
                  className="avatar"
                  aria-hidden="true"
                  style={{
                    background: `linear-gradient(150deg, hsl(${hue} 85% 70%), hsl(${(hue + 42) % 360} 70% 48%))`,
                  }}
                >
                  {player.nickname.slice(0, 1).toUpperCase()}
                </span>
                <div style={{ minWidth: 0 }}>
                  <h2 className="card__title">{player.nickname}</h2>
                  <div className="card__meta">клетка {player.position} из 80</div>
                </div>
                <span className={`chip ${ROLE_CHIP[player.role]}`} style={{ marginLeft: 'auto' }}>
                  {ROLE_LABEL[player.role]}
                </span>
              </div>

              <div className="stats" style={{ marginBottom: 12 }}>
                <div className="stat">
                  <div className="stat__label">Очки</div>
                  <div className="stat__value stat__value--lime" style={{ fontSize: 18 }}>
                    {player.points}
                  </div>
                </div>
                <div className="stat">
                  <div className="stat__label">Точность</div>
                  <div className="stat__value" style={{ fontSize: 18 }}>
                    {formatAccuracy(accuracy)}
                  </div>
                </div>
                <div className="stat">
                  <div className="stat__label">Ответов</div>
                  <div className="stat__value" style={{ fontSize: 18 }}>
                    {player.answered}
                  </div>
                </div>
              </div>

              <div className="dice-bank" style={{ marginBottom: 12, background: 'rgba(255,255,255,0.03)' }}>
                {DICE_ORDER.map(({ tier, label }) => (
                  <span key={tier} className="dice-chip" style={{ cursor: 'default' }}>
                    <span className={`die die--${tier}`}>{label}</span>×{player.dice[tier]}
                  </span>
                ))}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {effects.length === 0 ? (
                  <span className="chip chip--muted">эффектов нет</span>
                ) : (
                  effects.map((effect) => (
                    <span key={effect.code} className="chip chip--info">
                      {effect.label}
                      {effect.charges > 1 ? ` ×${effect.charges}` : ''}
                    </span>
                  ))
                )}
              </div>

              {player.answered < MIN_ANSWERS_FOR_ACCURACY && (
                <p className="card__meta" style={{ marginTop: 10 }}>
                  До зачёта точности нужно {MIN_ANSWERS_FOR_ACCURACY - player.answered} ответов.
                </p>
              )}
            </article>
          );
        })}
      </div>
    </Panel>
  );
}
