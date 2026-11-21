'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CardRarity, OwnedCardView } from '@/lib/types';
import { RARITY_LABEL_RU, ROLE_TITLE_RU } from '@/lib/game/cards-ui';
import {
  playPackTear,
  playRarityReveal,
  playRatingHit,
  playRevealStart,
  playRollTick,
  preloadRevealSfx,
} from '@/lib/game/reveal-sfx';
import { FutCard, type FutCardPalette, type FutCardVariant } from './FutCard';

const PackRevealScene = dynamic(
  () => import('./PackRevealScene').then((m) => m.PackRevealScene),
  { ssr: false },
);

type Phase = 'intro' | 'country' | 'role' | 'rating' | 'player' | 'final';

type Props = {
  card: OwnedCardView | null;
  collectionComplete?: boolean;
  variant?: FutCardVariant;
  palette?: FutCardPalette;
  onClose: () => void;
};

const COUNTRY_POOL = [
  'Англия', 'Франция', 'Германия', 'Испания', 'Италия', 'Португалия',
  'Нидерланды', 'Бельгия', 'Хорватия', 'Дания', 'Швейцария', 'Австрия',
  'Польша', 'Турция', 'Норвегия', 'Швеция', 'Шотландия', 'Чехия',
  'Сербия', 'Украина', 'Аргентина', 'Бразилия', 'Уругвай', 'США', 'Япония',
];

const ROLE_POOL = ['Вратарь', 'Защитник', 'Полузащитник', 'Нападающий'];

const NAME_POOL = [
  'Harry Kane', 'Kylian Mbappé', 'Jude Bellingham', 'Kevin De Bruyne', 'Virgil van Dijk',
  'Luka Modrić', 'Bruno Fernandes', 'Rodri', 'Phil Foden', 'Declan Rice',
  'Bernardo Silva', 'Rúben Dias', 'Florian Wirtz', 'Jamal Musiala', 'Pedri',
  'Gavi', 'Federico Valverde', 'Lautaro Martínez', 'Joshua Kimmich', 'İlkay Gündoğan',
  'Martin Ødegaard', 'Bukayo Saka', 'Achraf Hakimi', 'Antoine Griezmann', 'Rafael Leão',
];

const DUR = {
  intro: 1600,
  country: 4600,
  role: 3600,
  rating: 4600,
  player: 5200,
  pause: 900, // after player lands, before final card burst
} as const;

function pickOther<T>(pool: T[], current: T): T {
  if (pool.length <= 1) return current;
  let v = pool[Math.floor(Math.random() * pool.length)]!;
  let tries = 0;
  while (v === current && tries < 6) {
    v = pool[Math.floor(Math.random() * pool.length)]!;
    tries++;
  }
  return v;
}

function runSlot(opts: {
  duration: number;
  pool: (string | number)[];
  target: string | number;
  onTick: (v: string | number) => void;
  onDone: () => void;
  tickSound: (intensity: number) => void;
  cancelled: () => boolean;
}) {
  const start = performance.now();
  const step = () => {
    if (opts.cancelled()) return;
    const elapsed = performance.now() - start;
    const p = Math.min(1, elapsed / opts.duration);
    // ease-out interval: fast at start, slows near end
    const interval = 55 + p * p * 340;
    const intensity = 1 - p * 0.7;
    if (p >= 1) {
      opts.onTick(opts.target);
      opts.onDone();
      return;
    }
    opts.onTick(pickOther(opts.pool, opts.target));
    opts.tickSound(intensity);
    window.setTimeout(step, interval);
  };
  step();
}

/**
 * Раскрытие пака: 3D-пак + слот-машина (страна → роль → рейтинг → игрок),
 * длинная анимация с прокруткой значений, звуки и финальный показ карточки.
 */
export function PackOpenReveal({ card, collectionComplete, variant = 'fut', palette = 'fut', onClose }: Props) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [countryText, setCountryText] = useState('—');
  const [roleText, setRoleText] = useState('—');
  const [ratingText, setRatingText] = useState<string | number>('—');
  const [playerText, setPlayerText] = useState('—');
  const [countryLocked, setCountryLocked] = useState(false);
  const [roleLocked, setRoleLocked] = useState(false);
  const [ratingLocked, setRatingLocked] = useState(false);
  const [playerLocked, setPlayerLocked] = useState(false);
  const [sceneProgress, setSceneProgress] = useState(0);
  const cancelledRef = useRef(false);
  const timersRef = useRef<number[]>([]);

  const clearTimers = () => {
    for (const t of timersRef.current) window.clearTimeout(t);
    timersRef.current = [];
  };

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      clearTimers();
    };
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    clearTimers();
    if (!card) {
      setPhase('final');
      setSceneProgress(1);
      return;
    }

    preloadRevealSfx(card.rarity);
    setPhase('intro');
    setCountryText('—');
    setRoleText('—');
    setRatingText('—');
    setPlayerText('—');
    setCountryLocked(false);
    setRoleLocked(false);
    setRatingLocked(false);
    setPlayerLocked(false);
    setSceneProgress(0);
    playRevealStart();

    // progress ramp during intro+suspense (approximate)
    const start = performance.now();
    const total = DUR.intro + DUR.country + DUR.role + DUR.rating + DUR.player + DUR.pause + 350;
    const prog = () => {
      if (cancelledRef.current) return;
      const p = Math.min(1, (performance.now() - start) / total);
      setSceneProgress((prev) => (p > prev ? p : prev));
      if (p < 1) window.requestAnimationFrame(prog);
    };
    window.requestAnimationFrame(prog);

    const later = (fn: () => void, ms: number) => {
      const id = window.setTimeout(() => {
        if (!cancelledRef.current) fn();
      }, ms);
      timersRef.current.push(id);
    };

    // Fixed schedule for phases/slots (reliable), locks happen on slot completion.
    later(() => {
      if (cancelledRef.current) return;
      setPhase('country');
      const teamLabel = card.clubName || card.nationalTeam || '—';
      runSlot({
        duration: DUR.country,
        pool: card.setKind === 'club' ? [teamLabel, ...COUNTRY_POOL.slice(0, 12)] : COUNTRY_POOL,
        target: teamLabel,
        onTick: (v) => setCountryText(String(v)),
        onDone: () => {
          if (cancelledRef.current) return;
          setCountryText(teamLabel);
          setCountryLocked(true);
          playRollTick(0.18);
        },
        tickSound: playRollTick,
        cancelled: () => cancelledRef.current,
      });
    }, DUR.intro);

    const roleStart = DUR.intro + DUR.country;
    later(() => {
      if (cancelledRef.current) return;
      setPhase('role');
      runSlot({
        duration: DUR.role,
        pool: ROLE_POOL,
        target: ROLE_TITLE_RU[card.roleGroup],
        onTick: (v) => setRoleText(String(v)),
        onDone: () => {
          if (cancelledRef.current) return;
          setRoleText(ROLE_TITLE_RU[card.roleGroup]);
          setRoleLocked(true);
          playRollTick(0.18);
        },
        tickSound: playRollTick,
        cancelled: () => cancelledRef.current,
      });
    }, roleStart);

    const ratingStart = roleStart + DUR.role;
    later(() => {
      if (cancelledRef.current) return;
      setPhase('rating');
      const ratingPool = Array.from({ length: 23 }, (_, i) => 70 + i); // 70-92
      runSlot({
        duration: DUR.rating,
        pool: ratingPool,
        target: card.rating,
        onTick: (v) => setRatingText(v),
        onDone: () => {
          if (cancelledRef.current) return;
          setRatingText(card.rating);
          setRatingLocked(true);
          playRatingHit();
        },
        tickSound: playRollTick,
        cancelled: () => cancelledRef.current,
      });
    }, ratingStart);

    const playerStart = ratingStart + DUR.rating;
    later(() => {
      if (cancelledRef.current) return;
      setPhase('player');
      runSlot({
        duration: DUR.player,
        pool: NAME_POOL,
        target: card.playerName,
        onTick: (v) => setPlayerText(String(v)),
        onDone: () => {
          if (cancelledRef.current) return;
          setPlayerText(card.playerName);
          setPlayerLocked(true);
          playRollTick(0.18);
          later(() => {
            if (cancelledRef.current) return;
            playPackTear();
            setSceneProgress(1);
            later(() => {
              if (cancelledRef.current) return;
              setPhase('final');
              playRarityReveal(card.rarity);
            }, 350);
          }, DUR.pause);
        },
        tickSound: playRollTick,
        cancelled: () => cancelledRef.current,
      });
    }, playerStart);

    return () => {
      cancelledRef.current = true;
      clearTimers();
    };
  }, [card]);

  const rarityLabel = useMemo(() => (card ? RARITY_LABEL_RU[card.rarity] : null), [card]);
  const revealed = phase === 'final' || collectionComplete || !card;
  const rarity = card?.rarity ?? 'common';
  const rarityKnown = ratingLocked || phase === 'player' || phase === 'final' || !card;
  const visualRarity: CardRarity | 'mystery' = rarityKnown ? rarity : 'mystery';

  const skip = () => {
    if (!card || revealed) return;
    cancelledRef.current = true;
    clearTimers();
    setCountryText(card.nationalTeam || '—');
    setRoleText(ROLE_TITLE_RU[card.roleGroup]);
    setRatingText(card.rating);
    setPlayerText(card.playerName);
    setCountryLocked(true);
    setRoleLocked(true);
    setRatingLocked(true);
    setPlayerLocked(true);
    setSceneProgress(1);
    setPhase('final');
    playRarityReveal(card.rarity);
  };

  const sceneStep = phase === 'intro' ? 0 : phase === 'country' ? 1 : phase === 'role' ? 2 : phase === 'rating' ? 3 : 4;

  return (
    <div className="pack-reveal" role="dialog" aria-modal="true" aria-label="Открытие пака">
      <div className="pack-reveal__backdrop" onClick={revealed ? onClose : skip} />

      {card && !collectionComplete && (
        <div className="pack-reveal__scene" aria-hidden="true">
          <PackRevealScene rarity={rarity} step={sceneStep} progress={sceneProgress} rarityRevealed={rarityKnown} />
        </div>
      )}

      <div className={`reveal-stage${revealed ? ' reveal-stage--revealed' : ''}`}>
        <div className={`pack-reveal__panel pack-reveal__panel--${visualRarity}${revealed ? ' pack-reveal__panel--revealed' : ''}${rarityKnown ? ' pack-reveal__panel--charged' : ''}`}>
          <div className="panel-frame" aria-hidden="true">
            <span className="panel-frame__glow" />
            <span className="panel-frame__shine" />
            <span className="panel-frame__corner panel-frame__corner--tl" />
            <span className="panel-frame__corner panel-frame__corner--tr" />
            <span className="panel-frame__corner panel-frame__corner--bl" />
            <span className="panel-frame__corner panel-frame__corner--br" />
          </div>

          <div className="panel-inner">
            {collectionComplete || !card ? (
              <div className="pack-reveal__done">
                <h2 className="card__title">Коллекция собрана</h2>
                <p className="card__text">Новых карточек в этом сете больше нет. Дублей не выдаём.</p>
              </div>
            ) : (
              <>
                <div className="intro" data-show={phase === 'intro' ? 'true' : 'false'}>
                  <div className="intro__badge">{card.setKind === 'club' ? 'CLUB PACK' : 'NATIONAL PACK'}</div>
                  <div className="intro__pulse" />
                  <div className="intro__text">Открываем пак…</div>
                  <div className="intro__hint">{card.setKind === 'club' ? 'Клубы · 1–2 карточки' : 'Сборные · 1 карточка'}</div>
                </div>

                <div className={`slots${phase === 'intro' ? ' slots--hidden' : ''}`} aria-live="polite">
                  {(() => {
                    const order: Phase[] = ['intro', 'country', 'role', 'rating', 'player', 'final'];
                    const idx = order.indexOf(phase);
                    const countryDone = countryLocked || idx >= order.indexOf('role');
                    const roleDone = roleLocked || idx >= order.indexOf('rating');
                    const ratingDone = ratingLocked || idx >= order.indexOf('player');
                    const playerDone = playerLocked || idx >= order.indexOf('final');
                    const countrySpinning = phase === 'country' && !countryDone;
                    const roleSpinning = phase === 'role' && !roleDone;
                    const ratingSpinning = phase === 'rating' && !ratingDone;
                    const playerSpinning = phase === 'player' && !playerDone;
                    const Reel = ({
                      label,
                      show,
                      spinning,
                      locked,
                      text,
                      big,
                      sub,
                    }: {
                      label: string;
                      show: boolean;
                      spinning: boolean;
                      locked: boolean;
                      text: string | number;
                      big?: boolean;
                      sub?: string | null;
                    }) => (
                      <div className={`slot-row${show ? ' slot-row--show' : ''} ${locked ? 'slot-row--locked' : ''}`}>
                        <div className="slot-row__label">{label}</div>
                        <div className={`slot-reel${big ? ' slot-reel--rating' : ''}`} data-locked={locked ? 'true' : 'false'} data-spinning={spinning ? 'true' : 'false'}>
                          <span className="slot-reel__scan" aria-hidden="true" />
                          <span className={`slot-reel__value${big ? ' slot-reel__value--big' : ''}${spinning ? ' slot-reel__value--spinning' : ''}${locked ? ' slot-reel__value--landed' : ''}`}>{text}</span>
                        </div>
                        {sub ? <div className="slot-row__sub">{sub}</div> : null}
                      </div>
                    );
                    return (
                      <>
                        <Reel
                          label={card.setKind === 'club' ? 'Клуб' : 'Сборная'}
                          show={phase !== 'intro'}
                          spinning={countrySpinning}
                          locked={countryDone}
                          text={countryDone ? (card.clubName || card.nationalTeam || '—') : countryText}
                        />
                        <Reel
                          label="Роль / позиция"
                          show={countryDone || idx >= order.indexOf('role')}
                          spinning={roleSpinning}
                          locked={roleDone}
                          text={roleDone ? ROLE_TITLE_RU[card.roleGroup] : roleText}
                        />
                        <div className={`slot-row${roleDone || idx >= order.indexOf('rating') ? ' slot-row--show' : ''} ${ratingDone ? 'slot-row--locked' : ''}`}>
                          <div className="slot-row__label">Рейтинг</div>
                          <div className="slot-reel slot-reel--rating" data-locked={ratingDone ? 'true' : 'false'} data-spinning={ratingSpinning ? 'true' : 'false'}>
                            <span className="slot-reel__scan" aria-hidden="true" />
                            <span className={`slot-reel__value slot-reel__value--big${ratingSpinning ? ' slot-reel__value--spinning' : ''}${ratingDone ? ' slot-reel__value--landed' : ''}`}>{ratingDone ? card.rating : ratingText}</span>
                          </div>
                          {ratingDone && (
                            <div className={`rarity-charge rarity-charge--${rarity}`}>Редкость раскрывается…</div>
                          )}
                        </div>
                        <Reel
                          label="Игрок"
                          show={ratingDone || idx >= order.indexOf('player')}
                          spinning={playerSpinning}
                          locked={playerDone}
                          text={playerDone ? card.playerName : playerText}
                          sub={playerDone ? rarityLabel : null}
                        />
                      </>
                    );
                  })()}
                </div>

                {revealed ? (
                  <div className="pack-reveal__portrait pack-reveal__portrait--show">
                    <FutCard card={card} variant={variant} palette={palette} size="lg" interactive />
                  </div>
                ) : null}
              </>
            )}

            <div className="actions">
              {!revealed && !collectionComplete && card && (
                <button type="button" className="btn" onClick={skip}>Пропустить</button>
              )}
              <button type="button" className="btn btn--primary" onClick={onClose}>
                {revealed ? 'В коллекцию' : 'Закрыть'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .pack-reveal {
          position: fixed;
          inset: 0;
          z-index: 80;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px;
          overflow: hidden;
        }
        .pack-reveal__backdrop {
          position: absolute;
          inset: 0;
          background: radial-gradient(60% 50% at 50% 45%, rgba(10,16,24,0.55), rgba(2,4,8,0.84));
          backdrop-filter: blur(8px);
        }
        .pack-reveal__scene {
          position: absolute;
          inset: 0;
          z-index: 1;
        }

        .reveal-stage {
          position: relative;
          z-index: 2;
          width: min(600px, 100%);
          perspective: 1400px;
        }
        .pack-reveal__panel {
          --accent: #8fd8ff;
          --accent-2: #e8f7ff;
          --glow: rgba(120,200,255,0.18);
          position: relative;
          width: 100%;
          border-radius: 26px;
          padding: 3px;
          transform: rotateX(3deg) translateY(0);
          transform-style: preserve-3d;
          background:
            linear-gradient(160deg, rgba(255,255,255,0.22), rgba(255,255,255,0.04) 30%, rgba(0,0,0,0.25) 70%, rgba(255,255,255,0.12)),
            linear-gradient(180deg, rgba(30,40,56,0.95), rgba(8,12,18,0.98));
          box-shadow:
            0 1px 0 rgba(255,255,255,0.18) inset,
            0 -1px 0 rgba(0,0,0,0.5) inset,
            0 40px 90px rgba(0,0,0,0.7),
            0 18px 40px rgba(0,0,0,0.45),
            0 0 0 1px rgba(255,255,255,0.04),
            0 0 50px -12px var(--glow);
          transition: transform 500ms cubic-bezier(0.2,0.9,0.2,1), box-shadow 700ms ease, filter 700ms ease;
          max-height: calc(100vh - 36px);
        }
        .reveal-stage--revealed .pack-reveal__panel { transform: rotateX(0deg) translateY(-2px); }
        .pack-reveal__panel--mystery { --accent: #8fd8ff; --accent-2: #eaf7ff; --glow: rgba(120,200,255,0.16); filter: saturate(0.9); }
        .pack-reveal__panel--legend { --accent: #ffd978; --accent-2: #fff6d8; --glow: rgba(255,217,120,0.42); }
        .pack-reveal__panel--epic { --accent: #ddb2ff; --accent-2: #f6eaff; --glow: rgba(200,150,255,0.36); }
        .pack-reveal__panel--rare { --accent: #9fdcff; --accent-2: #e8f7ff; --glow: rgba(120,200,255,0.3); }
        .pack-reveal__panel--common { --accent: #c9823f; --accent-2: #ffe0bf; --glow: rgba(168,93,32,0.3); }
        .pack-reveal__panel--charged {
          box-shadow:
            0 1px 0 rgba(255,255,255,0.2) inset,
            0 -1px 0 rgba(0,0,0,0.5) inset,
            0 40px 90px rgba(0,0,0,0.7),
            0 18px 40px rgba(0,0,0,0.45),
            0 0 0 1px rgba(255,255,255,0.05),
            0 0 90px -8px var(--glow);
        }

        .panel-frame { position: absolute; inset: 0; border-radius: 26px; pointer-events: none; z-index: 3; }
        .panel-frame::before {
          content: ''; position: absolute; inset: 7px; border-radius: 20px;
          border: 1px solid rgba(255,255,255,0.14); box-shadow: 0 0 0 1px rgba(0,0,0,0.35) inset;
        }
        .panel-frame::after {
          content: ''; position: absolute; inset: 10px; border-radius: 17px;
          border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
          opacity: 0.9; transition: border-color 700ms ease;
        }
        .panel-frame__glow {
          position: absolute; inset: -20%;
          background: radial-gradient(40% 30% at 50% 0%, var(--glow), transparent 70%);
          filter: blur(12px); opacity: 0.9; transition: background 700ms ease, opacity 700ms ease;
        }
        .panel-frame__shine {
          position: absolute; top: 3px; left: 12%; right: 12%; height: 38%;
          border-radius: 22px 22px 60% 60%;
          background: linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0.03) 55%, transparent);
          mix-blend-mode: screen; opacity: 0.7;
        }
        .panel-frame__corner {
          position: absolute; width: 26px; height: 26px; border-color: var(--accent); border-style: solid;
          opacity: 0.85; filter: drop-shadow(0 0 6px var(--glow)); transition: border-color 700ms ease, filter 700ms ease;
        }
        .panel-frame__corner--tl { top: 12px; left: 12px; border-width: 2px 0 0 2px; border-radius: 8px 0 0 0; }
        .panel-frame__corner--tr { top: 12px; right: 12px; border-width: 2px 2px 0 0; border-radius: 0 8px 0 0; }
        .panel-frame__corner--bl { bottom: 12px; left: 12px; border-width: 0 0 2px 2px; border-radius: 0 0 0 8px; }
        .panel-frame__corner--br { bottom: 12px; right: 12px; border-width: 0 2px 2px 0; border-radius: 0 0 8px 0; }

        .panel-inner {
          position: relative; z-index: 2; border-radius: 22px; padding: 20px 18px 16px; text-align: center;
          overflow: auto; max-height: calc(100vh - 48px);
          background:
            linear-gradient(180deg, rgba(255,255,255,0.06), transparent 22%),
            radial-gradient(120% 60% at 50% -10%, rgba(255,255,255,0.08), transparent 55%),
            linear-gradient(180deg, rgba(18,24,36,0.96), rgba(9,13,19,0.98));
          box-shadow: 0 1px 0 rgba(255,255,255,0.06) inset, 0 -18px 30px rgba(0,0,0,0.25) inset;
        }

        .intro { display: grid; place-items: center; gap: 8px; padding: 14px 0 10px; transition: opacity 300ms ease, transform 300ms ease, max-height 300ms ease, margin 300ms ease; max-height: 220px; }
        .intro[data-show='false'] { opacity: 0; transform: translateY(-8px) scale(0.98); max-height: 0; margin: 0; padding: 0; overflow: hidden; }
        .intro__badge {
          font-size: 10px; font-weight: 800; letter-spacing: 0.22em; color: var(--accent-2);
          padding: 5px 10px; border-radius: 999px; border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
          background: linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02)); box-shadow: 0 0 18px -4px var(--glow);
        }
        .intro__pulse {
          width: 78px; height: 78px; border-radius: 50%;
          background: radial-gradient(circle at 35% 30%, rgba(255,255,255,0.35), transparent 30%), radial-gradient(circle, color-mix(in srgb, var(--accent) 30%, transparent), rgba(255,255,255,0.02) 55%, transparent 70%);
          border: 2px solid color-mix(in srgb, var(--accent) 55%, rgba(255,255,255,0.2));
          box-shadow: 0 0 0 0 var(--glow), 0 10px 30px rgba(0,0,0,0.35), 0 0 24px -4px var(--glow) inset;
          animation: pulse 1.5s ease-out infinite;
        }
        @keyframes pulse {
          0% { transform: scale(0.92); box-shadow: 0 0 0 0 var(--glow), 0 10px 30px rgba(0,0,0,0.35); }
          70% { transform: scale(1); box-shadow: 0 0 0 20px rgba(255,255,255,0), 0 10px 30px rgba(0,0,0,0.35); }
          100% { transform: scale(0.92); box-shadow: 0 0 0 0 rgba(255,255,255,0), 0 10px 30px rgba(0,0,0,0.35); }
        }
        .intro__text { font-family: var(--font-display); font-size: 22px; font-weight: 800; color: #fff; letter-spacing: 0.02em; text-shadow: 0 2px 16px rgba(0,0,0,0.5); }
        .intro__hint { font-size: 11px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: var(--text-faint, #cfc6b8); }

        .slots { display: grid; gap: 12px; margin-bottom: 14px; transition: opacity 250ms ease; }
        .slots--hidden { opacity: 0; max-height: 0; overflow: hidden; margin: 0; }
        .slot-row { opacity: 0; transform: translateY(12px) translateZ(0); transition: opacity 380ms ease, transform 380ms cubic-bezier(0.2,0.9,0.2,1); }
        .slot-row--show { opacity: 1; transform: translateY(0) translateZ(0); }
        .slot-row__label {
          font-family: var(--font-display); font-size: 10px; font-weight: 800; letter-spacing: 0.18em; text-transform: uppercase;
          color: color-mix(in srgb, var(--accent-2) 70%, #cfc6b8); margin-bottom: 5px; transition: color 700ms ease;
        }
        .slot-reel {
          position: relative; min-height: 48px; display: flex; align-items: center; justify-content: center; padding: 10px 14px;
          border-radius: 14px; overflow: hidden;
          background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.01) 35%, rgba(0,0,0,0.18)), linear-gradient(180deg, #0b1018, #06090e);
          border: 1px solid rgba(255,255,255,0.14);
          box-shadow: 0 1px 0 rgba(255,255,255,0.08) inset, 0 -10px 18px rgba(0,0,0,0.45) inset, 0 10px 24px rgba(0,0,0,0.35);
          transform: translateZ(8px);
          transition: border-color 600ms ease, box-shadow 600ms ease;
        }
        .slot-reel--rating { min-height: 68px; }
        .slot-reel__value--big.slot-reel__value--spinning { animation-duration: 0.08s; }
        .slot-reel[data-spinning='true'] {
          border-color: color-mix(in srgb, var(--accent) 28%, rgba(255,255,255,0.16));
          box-shadow: 0 1px 0 rgba(255,255,255,0.08) inset, 0 -10px 18px rgba(0,0,0,0.45) inset, 0 10px 24px rgba(0,0,0,0.35), 0 0 18px -6px var(--glow);
        }
        .slot-reel[data-locked='true'] {
          border-color: color-mix(in srgb, var(--accent) 55%, rgba(255,255,255,0.18));
          box-shadow: 0 1px 0 rgba(255,255,255,0.1) inset, 0 -10px 18px rgba(0,0,0,0.45) inset, 0 0 0 1px color-mix(in srgb, var(--accent) 18%, transparent) inset, 0 10px 24px rgba(0,0,0,0.35), 0 0 26px -6px var(--glow);
        }
        .slot-reel::before, .slot-reel::after { content: ''; position: absolute; left: 0; right: 0; height: 10px; pointer-events: none; z-index: 1; }
        .slot-reel::before { top: 0; background: linear-gradient(180deg, rgba(6,9,14,0.85), transparent); }
        .slot-reel::after { bottom: 0; background: linear-gradient(0deg, rgba(6,9,14,0.85), transparent); }
        .slot-reel__scan {
          position: absolute; inset: -40% -20%;
          background: linear-gradient(115deg, transparent 35%, rgba(255,255,255,0.08) 48%, transparent 60%);
          transform: translateX(-30%); opacity: 0.28; pointer-events: none; z-index: 1;
        }
        .slot-reel[data-locked='true'] .slot-reel__scan {
          opacity: 0.55; background: linear-gradient(115deg, transparent 35%, color-mix(in srgb, var(--accent) 28%, rgba(255,255,255,0.12)) 48%, transparent 60%);
        }

        .slot-reel__value {
          position: relative; z-index: 3; font-family: var(--font-display); font-size: 23px; font-weight: 800; color: #fff;
          text-shadow: 0 2px 14px rgba(0,0,0,0.55), 0 0 18px rgba(255,255,255,0.05);
          will-change: transform, opacity;
          line-height: 1.15;
          padding: 2px 4px;
          max-width: 100%;
          overflow-wrap: anywhere;
        }
        .slot-reel__value--spinning {
          color: rgba(255,255,255,0.92);
          animation: reel-text-spin 0.09s linear infinite alternate;
        }
        @keyframes reel-text-spin {
          from { transform: translateY(-2px); opacity: 0.9; }
          to { transform: translateY(2px); opacity: 1; }
        }
        .slot-reel__value--landed {
          color: #fff;
          animation: value-land 0.45s cubic-bezier(0.2,0.9,0.2,1) both;
        }
        @keyframes value-land {
          0% { opacity: 0.5; transform: translateY(6px) scale(0.99); }
          60% { opacity: 1; transform: translateY(-1px) scale(1.01); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        .slot-reel__value--big {
          font-size: 50px; line-height: 1; letter-spacing: -0.03em; font-variant-numeric: tabular-nums;
          background: linear-gradient(180deg, #fff, #d8e4ee); -webkit-background-clip: text; background-clip: text; color: transparent;
          filter: drop-shadow(0 10px 18px rgba(0,0,0,0.3));
        }
        .pack-reveal__panel--legend .slot-reel__value--big { background: linear-gradient(180deg, #fff9e3, #ffd978 60%, #ffbf3f); -webkit-background-clip: text; background-clip: text; }
        .pack-reveal__panel--epic .slot-reel__value--big { background: linear-gradient(180deg, #fbf2ff, #ddb2ff 60%, #c084fc); -webkit-background-clip: text; background-clip: text; }
        .pack-reveal__panel--rare .slot-reel__value--big { background: linear-gradient(180deg, #f2fbff, #9fdcff 60%, #67c8ff); -webkit-background-clip: text; background-clip: text; }
        .pack-reveal__panel--common .slot-reel__value--big { background: linear-gradient(180deg, #ffecd8, #d89452 60%, #a85d2a); -webkit-background-clip: text; background-clip: text; }
        .slot-row--locked .slot-reel__value--landed { transform: scale(1.02); }
        .slot-row__sub {
          font-size: 13px; font-weight: 800; color: var(--accent); margin-top: 5px; letter-spacing: 0.1em; text-transform: uppercase;
          text-shadow: 0 0 18px var(--glow); transition: color 700ms ease, text-shadow 700ms ease;
        }

        .rarity-charge {
          margin-top: 6px; font-size: 11px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase;
          color: var(--accent); opacity: 0.95; animation: charge-in 0.5s ease both;
        }
        .rarity-charge--legend { text-shadow: 0 0 16px rgba(255,217,120,0.5); }
        .rarity-charge--epic { text-shadow: 0 0 16px rgba(200,150,255,0.45); }
        .rarity-charge--rare { text-shadow: 0 0 16px rgba(120,200,255,0.4); }
        @keyframes charge-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 0.95; transform: translateY(0); } }

        .pack-reveal__portrait {
          margin: 16px auto 4px; width: fit-content; opacity: 0; transform: scale(0.68) translateY(30px) rotateX(14deg);
          filter: drop-shadow(0 34px 50px rgba(0, 0, 0, 0.6));
          transition: opacity 0.75s ease 0.05s, transform 0.85s cubic-bezier(0.2, 0.9, 0.2, 1) 0.05s;
        }
        .pack-reveal__portrait--show { opacity: 1; transform: scale(1) translateY(0) rotateX(0deg); }

        .actions { display: flex; align-items: center; justify-content: center; gap: 10px; margin-top: 18px; flex-wrap: wrap; }
        .pack-reveal__done { padding: 18px 0 8px; }

        @media (max-width: 560px) {
          .pack-reveal { padding: 12px; }
          .pack-reveal__panel { transform: rotateX(1.5deg); border-radius: 22px; }
          .panel-inner { padding: 16px 14px 14px; }
          .slot-reel__value { font-size: 20px; }
          .slot-reel__value--big { font-size: 42px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .intro__pulse, .slot-reel__value--spinning { animation: none; }
          .slot-row, .pack-reveal__portrait, .pack-reel__panel, .reveal-stage, .intro, .slots, .slot-reel__value--landed { transition: none; transform: none; animation: none; opacity: 1; filter: none; }
        }
      `}</style>
    </div>
  );
}
