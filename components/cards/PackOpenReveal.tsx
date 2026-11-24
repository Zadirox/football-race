'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CardRarity, OwnedCardView } from '@/lib/types';
import { RARITY_LABEL_RU, ROLE_LABEL_RU, ROLE_TITLE_RU, teamFlag } from '@/lib/game/cards-ui';
import { preloadRevealSfx } from '@/lib/game/reveal-sfx';
import { FutCard, type FutCardPalette, type FutCardVariant } from './FutCard';

type Phase = 'intro' | 'spin' | 'final';

type Props = {
  card: OwnedCardView | null;
  collectionComplete?: boolean;
  variant?: FutCardVariant;
  palette?: FutCardPalette;
  onClose: () => void;
  /** Optional pool for spin variety (e.g. cards from the same set). */
  poolCards?: OwnedCardView[];
};

type SpinItem = { label: string; img?: string | null; isFlag?: boolean; flag?: string | null };

const CLUB_CRESTS: Record<string, string> = {
  'ac milan': '/crests/ac-milan.png',
  'milan': '/crests/ac-milan.png',
  'arsenal': '/crests/arsenal.png',
  'aston villa': '/crests/aston-villa.png',
  'atletico madrid': '/crests/atletico-madrid.png',
  'атлетико мадрид': '/crests/atletico-madrid.png',
  'barcelona': '/crests/barcelona.png',
  'барселона': '/crests/barcelona.png',
  'bayern munich': '/crests/bayern-munich.png',
  'bayern': '/crests/bayern-munich.png',
  'бавария': '/crests/bayern-munich.png',
  'borussia dortmund': '/crests/borussia-dortmund.png',
  'боруссия д': '/crests/borussia-dortmund.png',
  'боруссия дортмунд': '/crests/borussia-dortmund.png',
  'brighton': '/crests/brighton.png',
  'chelsea': '/crests/chelsea.png',
  'челси': '/crests/chelsea.png',
  'como': '/crests/como.png',
  'fenerbahce': '/crests/fenerbahce.png',
  'фенербахче': '/crests/fenerbahce.png',
  'galatasaray': '/crests/galatasaray.png',
  'галатасарай': '/crests/galatasaray.png',
  'inter': '/crests/inter.png',
  'интер': '/crests/inter.png',
  'juventus': '/crests/juventus.png',
  'ювентус': '/crests/juventus.png',
  'lille': '/crests/lille.png',
  'лилль': '/crests/lille.png',
  'liverpool': '/crests/liverpool.png',
  'ливерпуль': '/crests/liverpool.png',
  'manchester city': '/crests/manchester-city.png',
  'манчестер сити': '/crests/manchester-city.png',
  'manchester united': '/crests/manchester-united.png',
  'манчестер юнайтед': '/crests/manchester-united.png',
  'napoli': '/crests/napoli.png',
  'наполи': '/crests/napoli.png',
  'psg': '/crests/psg.png',
  'paris saint-germain': '/crests/psg.png',
  'псж': '/crests/psg.png',
  'rb leipzig': '/crests/rb-leipzig.png',
  'рб лейпциг': '/crests/rb-leipzig.png',
  'real madrid': '/crests/real-madrid.png',
  'реал мадрид': '/crests/real-madrid.png',
  'roma': '/crests/roma.png',
  'рома': '/crests/roma.png',
  'tottenham': '/crests/tottenham.png',
  'тоттенхэм': '/crests/tottenham.png',
};

const BG_TRACKS = ['/sounds/packs/bg/bg-1.mp3', '/sounds/packs/bg/bg-2.mp3'];
const REVEAL_SOUNDS: Record<CardRarity, string[]> = {
  common: [
    '/sounds/packs/reveal/common/baby-laughing-meme.mp3',
    '/sounds/packs/reveal/common/meme-violin-sad-violin.mp3',
    '/sounds/packs/reveal/common/movie_1.mp3',
    '/sounds/packs/reveal/common/omg-bruh-oh-hell-nah.mp3',
    '/sounds/packs/reveal/common/sad-violin-meme-hamster-mp3.mp3',
    '/sounds/packs/reveal/common/spongebob-fail.mp3',
    '/sounds/packs/reveal/common/vot-takaia-vot-kh-nia-sobachka.mp3',
  ],
  rare: [
    '/sounds/packs/reveal/rare/1-000-000-000-iq.mp3',
    '/sounds/packs/reveal/rare/dexter-meme.mp3',
    '/sounds/packs/reveal/rare/faaah.mp3',
    '/sounds/packs/reveal/rare/spiderman-meme-song.mp3',
    '/sounds/packs/reveal/rare/zvuk-litvina.mp3',
  ],
  epic: [
    '/sounds/packs/reveal/epic/gol-messi-vs-getafe-narrat-per-puyal-full-hd-1080p-audiotrimmer-1.mp3',
    '/sounds/packs/reveal/epic/suuuuuuuuuuuuu.mp3',
    '/sounds/packs/reveal/epic/verity-edit.mp3',
  ],
  legend: [
    '/sounds/packs/reveal/legendary/gta-san-andreas-gorevi-gecme-muzigi-respect-mp3indirdur.mp3',
    '/sounds/packs/reveal/legendary/tiki-tiki-boosted.mp3',
  ],
};

const ROLE_FULL: Record<string, string> = {
  GK: 'Вратарь',
  DEF: 'Защитник',
  MID: 'Полузащитник',
  FWD: 'Нападающий',
};

const FALLBACK_NATIONS = ['Бразилия', 'Франция', 'Англия', 'Испания', 'Германия', 'Португалия', 'Аргентина', 'Нидерланды', 'Италия', 'Бельгия'];
const FALLBACK_CLUBS = ['Арсенал', 'Реал Мадрид', 'Барселона', 'Ливерпуль', 'Бавария', 'ПСЖ', 'Манчестер Сити', 'Интер', 'Милан', 'Челси'];
const FALLBACK_NAMES = ['ALEX NOVAK', 'LEO MARTIN', 'MARCUS VALE', 'NOAH GRANT', 'DANI ROJAS'];

function norm(s: string) { return s.trim().toLowerCase(); }
function crestFor(name: string | null | undefined) { return name ? CLUB_CRESTS[norm(name)] ?? null : null; }
function sameVal(a: unknown, b: unknown) {
  if (a && b && typeof a === 'object' && typeof b === 'object') return (a as SpinItem).label === (b as SpinItem).label && (a as SpinItem).img === (b as SpinItem).img;
  return a === b;
}
function rarityPillLabel(r: CardRarity) {
  if (r === 'legend') return 'Легендарная';
  if (r === 'epic') return 'Эпическая';
  if (r === 'rare') return 'Редкая';
  return 'Обычная';
}

export function PackOpenReveal({ card, collectionComplete, variant = 'fut', palette = 'fut', onClose, poolCards = [] }: Props) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [revealed, setRevealed] = useState(false);
  const [step, setStep] = useState(0);
  const [nation, setNation] = useState<SpinItem>({ label: 'Клуб' });
  const [pos, setPos] = useState('—');
  const [rating, setRating] = useState('—');
  const [name, setName] = useState<SpinItem>({ label: 'НЕИЗВЕСТНЫЙ ИГРОК' });
  const [nationLocked, setNationLocked] = useState(false);
  const [posLocked, setPosLocked] = useState(false);
  const [ratingLocked, setRatingLocked] = useState(false);
  const [nameLocked, setNameLocked] = useState(false);
  const [rarityShown, setRarityShown] = useState(false);
  const [introShow, setIntroShow] = useState(false);
  const [introDissolve, setIntroDissolve] = useState(false);
  const [continueReady, setContinueReady] = useState(false);
  const [continueVisible, setContinueVisible] = useState(false);
  const [fxVol, setFxVol] = useState(0.8);
  const [bgVol, setBgVol] = useState(0.65);

  const cancelledRef = useRef(false);
  const timersRef = useRef<number[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const bgSourceRef = useRef<AudioBufferSourceNode | HTMLAudioElement | null>(null);
  const bgGainRef = useRef<GainNode | null>(null);
  const bgStopTimerRef = useRef<number | null>(null);
  const bgTokenRef = useRef(0);
  const lastBgRef = useRef(-1);
  const revealAudioRef = useRef<HTMLAudioElement | null>(null);
  const fxVolRef = useRef(0.8);
  const bgVolRef = useRef(0.65);

  fxVolRef.current = fxVol;
  bgVolRef.current = bgVol;

  const clearTimers = () => { for (const t of timersRef.current) window.clearTimeout(t); timersRef.current = []; };
  const later = (fn: () => void, ms: number) => {
    const t = window.setTimeout(() => { if (!cancelledRef.current) fn(); }, ms);
    timersRef.current.push(t);
    return t;
  };

  const ensureCtx = () => {
    if (typeof window === 'undefined') return null;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
    if (audioCtxRef.current.state === 'suspended') void audioCtxRef.current.resume().catch(() => {});
    return audioCtxRef.current;
  };

  const tone = (freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.03, when = 0) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const v = Math.max(0.0001, vol * (fxVolRef.current / 0.8));
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, ctx.currentTime + when);
    g.gain.exponentialRampToValueAtTime(v, ctx.currentTime + when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + when + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(ctx.currentTime + when); o.stop(ctx.currentTime + when + dur + 0.02);
  };
  const sfx = {
    tick: () => tone(520 + Math.random() * 180, 0.04, 'triangle', 0.012),
    lock: () => { tone(660, 0.08, 'sine', 0.03); tone(880, 0.12, 'sine', 0.025, 0.05); },
    rarity: () => { tone(523, 0.18, 'sine', 0.03); tone(659, 0.18, 'sine', 0.03, 0.06); tone(784, 0.28, 'sine', 0.035, 0.12); tone(1047, 0.35, 'triangle', 0.02, 0.18); },
  };

  const stopReveal = () => { if (revealAudioRef.current) { revealAudioRef.current.pause(); revealAudioRef.current.currentTime = 0; revealAudioRef.current = null; } };
  const stopBg = () => {
    bgTokenRef.current++;
    if (bgStopTimerRef.current) { window.clearTimeout(bgStopTimerRef.current); bgStopTimerRef.current = null; }
    const src = bgSourceRef.current;
    if (src) {
      try {
        if (src instanceof HTMLAudioElement) { src.pause(); src.currentTime = 0; }
        else src.stop();
      } catch {}
      bgSourceRef.current = null;
    }
    bgGainRef.current = null;
  };

  const playBg = async () => {
    stopBg();
    const token = ++bgTokenRef.current;
    ensureCtx();
    let idx = Math.floor(Math.random() * BG_TRACKS.length);
    if (BG_TRACKS.length > 1 && idx === lastBgRef.current) idx = (idx + 1) % BG_TRACKS.length;
    lastBgRef.current = idx;
    const srcUrl = BG_TRACKS[idx]!;
    const ctx = audioCtxRef.current;
    if (ctx) {
      try {
        const res = await fetch(srcUrl);
        const buf = await res.arrayBuffer();
        const audioBuf = await ctx.decodeAudioData(buf);
        if (token !== bgTokenRef.current || !audioCtxRef.current) return;
        stopBg(); bgTokenRef.current = token;
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        source.buffer = audioBuf;
        gain.gain.value = bgVolRef.current;
        source.connect(gain); gain.connect(ctx.destination);
        source.start(0);
        bgSourceRef.current = source;
        bgGainRef.current = gain;
        bgStopTimerRef.current = window.setTimeout(() => { if (token === bgTokenRef.current) stopBg(); }, 30000);
        return;
      } catch {}
    }
    try {
      if (token !== bgTokenRef.current) return;
      stopBg(); bgTokenRef.current = token;
      const a = new Audio(srcUrl);
      a.volume = bgVolRef.current;
      bgSourceRef.current = a;
      void a.play().catch(() => {});
      bgStopTimerRef.current = window.setTimeout(() => { if (token === bgTokenRef.current) stopBg(); }, 30000);
    } catch {}
  };

  const playRevealSound = (r: CardRarity) => {
    stopReveal();
    const list = REVEAL_SOUNDS[r] ?? REVEAL_SOUNDS.common;
    const src = list[Math.floor(Math.random() * list.length)]!;
    const a = new Audio(src);
    a.volume = fxVolRef.current;
    revealAudioRef.current = a;
    void a.play().catch(() => {});
  };

  useEffect(() => () => { cancelledRef.current = true; clearTimers(); stopBg(); stopReveal(); }, []);

  useEffect(() => {
    if (bgGainRef.current) bgGainRef.current.gain.value = bgVol;
    const src = bgSourceRef.current;
    if (src instanceof HTMLAudioElement) src.volume = bgVol;
  }, [bgVol]);

  useEffect(() => {
    if (revealAudioRef.current) revealAudioRef.current.volume = fxVol;
  }, [fxVol]);

  useEffect(() => {
    document.documentElement.setAttribute('data-pack-opening', 'true');
    return () => { document.documentElement.removeAttribute('data-pack-opening'); };
  }, []);

  const data = useMemo(() => {
    if (!card) return null;
    const isClub = card.setKind === 'club';
    const teamLabel = isClub ? (card.clubName || card.nationalTeam || 'Клуб') : (card.nationalTeam || 'Сборная');
    const teamImg = isClub ? crestFor(teamLabel) : null;
    const teamFlagEmoji = !isClub ? teamFlag(card.nationalTeam, card.nationalTeamSlug) : null;
    const finalNation: SpinItem = { label: teamLabel, img: teamImg, isFlag: !isClub, flag: teamFlagEmoji };
    const finalName: SpinItem = { label: card.playerName, img: card.photoUrl ?? null };
    const posFull = ROLE_TITLE_RU[card.roleGroup] ?? ROLE_FULL[card.roleGroup] ?? card.roleGroup;
    const posShort = ROLE_LABEL_RU[card.roleGroup] ?? card.roleGroup;

    const nationPool: SpinItem[] = [];
    const seenNation = new Set<string>();
    const pushNation = (it: SpinItem) => { const k = norm(it.label); if (seenNation.has(k)) return; seenNation.add(k); nationPool.push(it); };
    pushNation(finalNation);
    for (const c of poolCards) {
      if (isClub) {
        const l = c.clubName || c.nationalTeam;
        if (l) pushNation({ label: l, img: crestFor(l) });
      } else {
        const l = c.nationalTeam;
        if (l) pushNation({ label: l, img: null, isFlag: true, flag: teamFlag(l, c.nationalTeamSlug) });
      }
    }
    const fallbacks = isClub ? FALLBACK_CLUBS : FALLBACK_NATIONS;
    for (const fb of fallbacks) pushNation(isClub ? { label: fb, img: crestFor(fb) } : { label: fb, isFlag: true, flag: teamFlag(fb) });

    const namePool: SpinItem[] = [];
    const seenName = new Set<string>();
    const pushName = (it: SpinItem) => { const k = norm(it.label); if (seenName.has(k)) return; seenName.add(k); namePool.push(it); };
    pushName(finalName);
    for (const c of poolCards) pushName({ label: c.playerName, img: c.photoUrl ?? null });
    for (const n of FALLBACK_NAMES) pushName({ label: n, img: null });

    const ratingPool = Array.from({ length: 30 }, (_, i) => String(70 + i));
    const posPool = ['Вратарь', 'Защитник', 'Левый защитник', 'Правый защитник', 'Опорный полузащитник', 'Центральный полузащитник', 'Атакующий полузащитник', 'Правый вингер', 'Левый вингер', 'Нападающий'];
    if (!posPool.includes(posFull)) posPool.push(posFull);

    return { isClub, teamLabel, finalNation, finalName, posFull, posShort, rating: String(card.rating), rarity: card.rarity, nationPool, namePool, ratingPool, posPool };
  }, [card, poolCards]);

  useEffect(() => {
    cancelledRef.current = false;
    clearTimers();
    stopBg(); stopReveal();
    setPhase('intro'); setRevealed(false); setStep(0);
    setNation({ label: card?.setKind === 'club' ? 'Клуб' : 'Сборная' });
    setPos('—'); setRating('—'); setName({ label: 'НЕИЗВЕСТНЫЙ ИГРОК' });
    setNationLocked(false); setPosLocked(false); setRatingLocked(false); setNameLocked(false);
    setRarityShown(false); setIntroShow(false); setIntroDissolve(false);
    setContinueReady(false); setContinueVisible(false);

    if (!card) { setRevealed(true); setPhase('final'); return; }
    preloadRevealSfx(card.rarity);
    ensureCtx();
    void playBg();

    const runSlot = <T,>(opts: { pool: T[]; target: T; duration: number; onTick: (v: T) => void; onDone: () => void; tickSound?: boolean }) => {
      const start = performance.now();
      const tick = () => {
        if (cancelledRef.current) return;
        const elapsed = performance.now() - start;
        const p = Math.min(1, elapsed / opts.duration);
        const interval = 90 + p * p * 520;
        if (p >= 1) { opts.onTick(opts.target); sfx.lock(); opts.onDone(); return; }
        let v = opts.pool[Math.floor(Math.random() * opts.pool.length)] as T;
        if (sameVal(v, opts.target)) v = opts.pool[(opts.pool.indexOf(v) + 1) % opts.pool.length] as T;
        opts.onTick(v);
        if (opts.tickSound !== false) sfx.tick();
        later(tick, interval);
      };
      tick();
    };

    later(() => setPhase('spin'), 600);
    later(() => {
      setStep(1); setIntroShow(true);
      if (!data) return;
      runSlot({ pool: data.nationPool, target: data.finalNation, duration: 7000, onTick: (v) => setNation(v), onDone: () => { setNation(data.finalNation); setNationLocked(true); } });
      runSlot({ pool: data.posPool, target: data.posFull, duration: 12000, tickSound: false, onTick: (v) => setPos(v), onDone: () => { setPos(data.posFull); setPosLocked(true); } });
      runSlot({ pool: data.ratingPool, target: data.rating, duration: 17500, tickSound: false, onTick: (v) => setRating(v), onDone: () => { setRating(data.rating); setRatingLocked(true); } });
      runSlot({ pool: data.namePool, target: data.finalName, duration: 24000, tickSound: false, onTick: (v) => setName(v), onDone: () => { setName(data.finalName); setNameLocked(true); } });
    }, 1000);

    later(() => setIntroDissolve(true), 8400);
    later(() => { setIntroShow(false); setIntroDissolve(false); }, 9200);
    later(() => setStep(2), 8500);
    later(() => setStep(3), 13500);
    later(() => { setStep(4); setRarityShown(true); sfx.rarity(); }, 19000);
    later(() => setStep(5), 20000);
    later(() => {
      setRevealed(true); setPhase('final'); stopBg(); playRevealSound(card.rarity);
      setContinueVisible(true);
      later(() => setContinueReady(true), 4000);
    }, 25500);

    return () => { cancelledRef.current = true; clearTimers(); stopBg(); stopReveal(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.instanceId, collectionComplete]);

  const skip = () => {
    if (!card || revealed) return;
    cancelledRef.current = true;
    clearTimers();
    stopBg(); stopReveal();
    if (data) {
      setNation(data.finalNation); setPos(data.posFull); setRating(data.rating); setName(data.finalName);
      setNationLocked(true); setPosLocked(true); setRatingLocked(true); setNameLocked(true);
      setRarityShown(true); setStep(5); setIntroShow(false); setIntroDissolve(false);
      setRevealed(true); setPhase('final'); setContinueVisible(true); setContinueReady(true);
    }
  };

  const onPrimary = () => { if (!revealed) { skip(); return; } onClose(); };
  const onBackdrop = () => { if (revealed) onClose(); else skip(); };

  const rarity = card?.rarity ?? 'common';
  const rarityLabel = rarityPillLabel(rarity);
  const teamLabel = data?.isClub ? 'Клуб' : 'Сборная';
  const posSize = pos.length > 18 ? '20px' : pos.length > 12 ? '24px' : '28px';

  if (collectionComplete || !card) {
    return (
      <div className="pr" role="dialog" aria-modal="true" aria-label="Открытие пака">
        <div className="pr__bg" onClick={onClose} />
        <div className="pr__simple">
          <h2 className="pr__simpleTitle">Коллекция собрана</h2>
          <p className="pr__simpleText">Новых карточек в этом сете больше нет. Дублей не выдаём.</p>
          <button type="button" className="btn btn--primary" onClick={onClose}>В коллекцию</button>
        </div>
        <style jsx>{`
          .pr{position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;padding:18px}
          .pr__bg{position:absolute;inset:0;background:radial-gradient(60% 50% at 50% 45%, rgba(10,16,24,.6), rgba(2,4,8,.88));backdrop-filter:blur(8px)}
          .pr__simple{position:relative;z-index:2;width:min(520px,100%);padding:28px;border-radius:24px;background:linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.02)), rgba(12,20,32,.72);border:1px solid rgba(255,255,255,.1);text-align:center;box-shadow:0 30px 80px rgba(0,0,0,.5)}
          .pr__simpleTitle{margin:0 0 8px;font-family:var(--font-display),sans-serif;font-size:36px;color:#fff}
          .pr__simpleText{margin:0 0 18px;color:rgba(255,255,255,.78)}
        `}</style>
      </div>
    );
  }

  return (
    <div className="pr" role="dialog" aria-modal="true" aria-label="Открытие пака">
      <div className="pr__bg" onClick={onBackdrop} />
      <div className={`pr__stage ${phase !== 'intro' ? 'pr__stage--open' : ''} ${rarityShown ? 'pr__stage--rarity' : ''}`}>
        <div className="pr__fx" aria-hidden="true"><div className="pr__fx-a" /><div className="pr__fx-b" /><div className="pr__fx-c" /></div>
        <div className="pr__tunnel">
          <div className="pr__world">
            <div className="pr__wall pr__wall--l" /><div className="pr__wall pr__wall--r" />
            <div className="pr__ceil" /><div className="pr__floor" /><div className="pr__end" />
          </div>

          <div className={`pr__panel pr__panel--l ${nationLocked ? 'is-locked' : step >= 1 ? 'is-active' : ''}`}>
            <div className="pr__plabel">{teamLabel}</div>
            <div className="pr__pmedia">
              {nation.img ? <img src={nation.img} alt="" /> : nation.flag ? <span className="pr__flag">{nation.flag}</span> : null}
              <div className="pr__pval">{nation.label}</div>
            </div>
          </div>
          <div className={`pr__panel pr__panel--r ${posLocked ? 'is-locked' : step >= 1 ? 'is-active' : ''}`}>
            <div className="pr__plabel">Роль</div>
            <div className="pr__pval" style={{ fontSize: posSize }}>{pos}</div>
          </div>
          <div className={`pr__panel pr__panel--l pr__panel--rating ${ratingLocked ? 'is-locked' : step >= 1 ? 'is-active' : ''}`}>
            <div className="pr__plabel">Рейтинг</div>
            <div className="pr__pval pr__pval--big">{rating}</div>
          </div>
          <div className={`pr__panel pr__panel--r pr__panel--player ${nameLocked ? 'is-locked' : step >= 1 ? 'is-active' : ''}`}>
            <div className="pr__plabel">Игрок</div>
            <div className="pr__pmedia">
              {name.img ? <img src={name.img} alt="" className="pr__pavatar" /> : null}
              <div className="pr__pval">{name.label}</div>
            </div>
          </div>

          <div className={`pr__center ${rarityShown ? 'is-show' : ''}`}>
            {!revealed || !card ? (
              <div className={`pr__mysteryCard r-${rarityShown ? rarity : 'mystery'}`}>
                <div className="pr__mcTop"><div><div className="pr__mcRating">{ratingLocked ? rating : '—'}</div><div className="pr__mcPos">{posLocked ? (data?.posShort ?? '—') : '—'}</div></div><div className="pr__mcTeam">{nationLocked ? nation.label : teamLabel}</div></div>
                <div className="pr__mcPortrait">{nameLocked && name.img ? <img src={name.img} alt="" /> : <span>?</span>}</div>
                <div className="pr__mcName">{nameLocked ? name.label : 'НЕИЗВЕСТНЫЙ ИГРОК'}</div>
                {rarityShown && <div className={`pr__pill r-${rarity}`}>{rarityLabel}</div>}
              </div>
            ) : (
              <div className="pr__finalCard">
                <FutCard card={card} variant={variant} palette={palette} size="lg" interactive />
                <div className={`pr__pill r-${rarity}`}>{rarityLabel}</div>
              </div>
            )}
          </div>

          <div className={`pr__intro ${introShow ? 'is-show' : ''} ${introDissolve ? 'is-dissolve' : ''}`} aria-hidden="true">
            <div className={`pr__iplaque ${nationLocked ? 'is-locked' : ''}`}>
              <div className="pr__ilabel">{teamLabel}</div>
              <div className="pr__ibody">
                {nation.img ? <img src={nation.img} alt="" /> : nation.flag ? <span className="pr__iflag">{nation.flag}</span> : null}
                <div className="pr__ival">{nation.label}</div>
              </div>
            </div>
            <div className={`pr__iplaque pr__iplaque--player ${nameLocked ? 'is-locked' : ''}`}>
              <div className="pr__ilabel">Игрок</div>
              <div className="pr__ibody pr__ibody--player">
                {name.img ? <img src={name.img} alt="" /> : <div className="pr__iavatar">?</div>}
                <div className="pr__ival">{name.label}</div>
              </div>
            </div>
            <div className="pr__imeta">
              <div className={`pr__ichip ${posLocked ? 'is-locked' : ''}`}><span>Роль</span><b style={{ fontSize: pos.length > 18 ? 18 : pos.length > 12 ? 22 : 28 }}>{pos}</b></div>
              <div className={`pr__ichip ${ratingLocked ? 'is-locked' : ''}`}><span>Рейтинг</span><b>{rating}</b></div>
            </div>
          </div>
        </div>

        <div className="pr__hud">
          <div className="pr__steps">
            {['Клуб', 'Роль', 'Рейтинг', 'Редкость', 'Игрок'].map((l, i) => (
              <span key={l} className={`pr__step ${step === i + 1 ? 'is-on' : step > i + 1 ? 'is-done' : ''}`}>{i + 1}. {l}</span>
            ))}
          </div>
          <div className="pr__actions">
            <label className="pr__vol">Музыка <input type="range" min={0} max={100} value={Math.round(bgVol * 100)} onChange={(e) => setBgVol(Number(e.target.value) / 100)} /></label>
            <label className="pr__vol">Звуки <input type="range" min={0} max={100} value={Math.round(fxVol * 100)} onChange={(e) => setFxVol(Number(e.target.value) / 100)} /></label>
            {!revealed && <button type="button" className="btn" onClick={skip}>Пропустить</button>}
            {revealed && (
              <button type="button" className="btn btn--primary" onClick={onClose} disabled={continueVisible && !continueReady}>
                {continueVisible && !continueReady ? 'Слушай финал...' : 'В коллекцию'}
              </button>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        .pr { position:fixed; inset:0; z-index:80; display:flex; align-items:center; justify-content:center; padding:18px; }
        .pr__bg { position:absolute; inset:0; background: radial-gradient(60% 50% at 50% 45%, rgba(10,16,24,.6), rgba(2,4,8,.88)); backdrop-filter: blur(8px); }
        .pr__stage { position:relative; z-index:2; width:min(1180px,100%); height:min(760px, calc(100vh - 36px)); border-radius:28px; overflow:hidden; border:1px solid rgba(255,255,255,.08); background: radial-gradient(ellipse 80% 55% at 50% 0%, rgba(84,140,190,.18), transparent 55%), linear-gradient(180deg, #101a28 0%, #070d16 45%, #04080e 100%); box-shadow: 0 40px 120px rgba(0,0,0,.65); }
        .pr__fx,.pr__fx-a,.pr__fx-b,.pr__fx-c{position:absolute;inset:0;pointer-events:none}
        .pr__fx-a{background:radial-gradient(ellipse 60% 30% at 50% 10%, rgba(160,220,255,.12), transparent 60%)}
        .pr__fx-b{background:radial-gradient(ellipse 30% 60% at 15% 50%, rgba(100,180,255,.08), transparent 60%), radial-gradient(ellipse 30% 60% at 85% 50%, rgba(100,180,255,.08), transparent 60%)}
        .pr__fx-c{opacity:0; transition:opacity .8s ease; background:radial-gradient(ellipse 50% 40% at 50% 50%, rgba(255,215,120,.18), transparent 65%)}
        .pr__stage--rarity .pr__fx-c{opacity:1}
        .pr__tunnel{position:absolute; inset:0; perspective:900px; overflow:hidden;}
        .pr__world{position:absolute; inset:0; transform-style:preserve-3d; transition:transform 1.2s cubic-bezier(.2,.8,.2,1); transform:translateZ(0)}
        .pr__stage--open .pr__world{transform:translateZ(220px)}
        .pr__wall,.pr__ceil,.pr__floor,.pr__end{position:absolute;}
        .pr__wall{top:-10%;bottom:-10%;width:36%; background:linear-gradient(90deg, rgba(10,16,26,.95), rgba(20,35,55,.35));}
        .pr__wall--l{left:-8%; transform:rotateY(70deg); transform-origin:left center;}
        .pr__wall--r{right:-8%; transform:rotateY(-70deg); transform-origin:right center; background:linear-gradient(270deg, rgba(10,16,26,.95), rgba(20,35,55,.35));}
        .pr__ceil{left:-10%;right:-10%;top:-20%;height:45%; background:linear-gradient(180deg, rgba(6,10,18,.95), rgba(30,50,75,.25)); transform:rotateX(-70deg); transform-origin:top center;}
        .pr__floor{left:-10%;right:-10%;bottom:-20%;height:45%; background:linear-gradient(0deg, rgba(4,8,14,.98), rgba(30,50,75,.2)); transform:rotateX(70deg); transform-origin:bottom center;}
        .pr__end{left:15%;right:15%;top:12%;bottom:18%; border-radius:40%/20%; background:radial-gradient(ellipse at 50% 40%, rgba(140,210,255,.22), rgba(20,40,70,.15) 35%, rgba(2,4,8,0) 70%); transform:translateZ(-420px);}

        .pr__panel{position:absolute; top:32%; width:min(280px,24vw); padding:16px 18px; border-radius:20px; background:linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.02)), rgba(10,18,28,.42); border:1px solid rgba(170,225,255,.18); box-shadow:0 20px 50px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.12); backdrop-filter:blur(10px); transform:translateY(-50%); transition:all .35s ease; opacity:.9; z-index:5;}
        .pr__panel--l{left:32px} .pr__panel--r{right:32px}
        .pr__panel--rating,.pr__panel--player{top:68%}
        .pr__panel.is-active{opacity:1; border-color:rgba(170,225,255,.42); box-shadow:0 20px 50px rgba(0,0,0,.35), 0 0 40px rgba(140,210,255,.16)}
        .pr__panel.is-locked{opacity:1; border-color:rgba(190,235,255,.72); background:linear-gradient(180deg, rgba(170,225,255,.18), rgba(255,255,255,.04)), rgba(10,20,34,.62); box-shadow:0 20px 50px rgba(0,0,0,.35), 0 0 0 1px rgba(220,245,255,.22) inset, 0 0 34px rgba(140,210,255,.28), 0 0 80px rgba(120,200,255,.12); animation:lockFlash .9s ease-out}
        .pr__panel.is-locked::after{content:''; position:absolute; top:10px; right:12px; width:8px; height:8px; border-radius:50%; background:#b8efff; box-shadow:0 0 10px rgba(184,239,255,.95), 0 0 24px rgba(140,210,255,.65)}
        @keyframes lockFlash{0%{filter:brightness(1);transform:translateY(-50%) scale(1)}15%{filter:brightness(1.7);transform:translateY(-50%) scale(1.03);box-shadow:0 20px 50px rgba(0,0,0,.35),0 0 0 1px rgba(235,250,255,.7) inset,0 0 90px rgba(190,240,255,.75),0 0 180px rgba(140,210,255,.35)}45%{filter:brightness(1.25);transform:translateY(-50%) scale(1.01)}100%{filter:brightness(1);transform:translateY(-50%) scale(1)}}
        .pr__plabel{font-size:11px; letter-spacing:.22em; text-transform:uppercase; color:rgba(180,225,255,.75); margin-bottom:10px}
        .pr__pmedia{display:flex; align-items:center; gap:10px; min-height:64px}
        .pr__pmedia img{width:44px;height:44px;object-fit:contain;flex:0 0 44px;filter:drop-shadow(0 4px 10px rgba(0,0,0,.35))}
        .pr__pmedia .pr__pavatar{object-fit:cover;border-radius:50%;background:rgba(255,255,255,.06)}
        .pr__flag,.pr__iflag{font-size:42px; line-height:1; filter:drop-shadow(0 4px 10px rgba(0,0,0,.35))}
        .pr__pval{font-family:var(--font-display), system-ui, sans-serif; font-size:28px; line-height:.95; letter-spacing:.02em; color:#eef8ff; min-height:64px; display:flex; align-items:center; overflow-wrap:anywhere}
        .pr__pmedia .pr__pval{min-height:0}
        .pr__pval--big{font-size:56px}

        .pr__center{position:absolute; inset:0; display:flex; align-items:center; justify-content:center; z-index:6; pointer-events:none}
        .pr__mysteryCard,.pr__finalCard{pointer-events:auto}
        .pr__mysteryCard{width:min(320px,70vw); aspect-ratio:2/3; border-radius:24px; padding:20px; position:relative; display:flex; flex-direction:column; align-items:center; justify-content:space-between; background:linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.02)), rgba(12,20,32,.55); border:1px solid rgba(170,225,255,.2); box-shadow:0 30px 80px rgba(0,0,0,.45); opacity:0; transform:translateY(20px) scale(.96); transition:all .6s cubic-bezier(.2,.9,.2,1)}
        .pr__center.is-show .pr__mysteryCard{opacity:1; transform:translateY(0) scale(1)}
        .pr__mysteryCard.r-legend{box-shadow:0 30px 80px rgba(0,0,0,.45), 0 0 60px rgba(255,215,120,.25); border-color:rgba(255,215,120,.35)}
        .pr__mysteryCard.r-epic{box-shadow:0 30px 80px rgba(0,0,0,.45), 0 0 50px rgba(200,150,255,.22); border-color:rgba(200,150,255,.35)}
        .pr__mysteryCard.r-rare{box-shadow:0 30px 80px rgba(0,0,0,.45), 0 0 45px rgba(120,200,255,.2); border-color:rgba(120,200,255,.35)}
        .pr__mcTop{width:100%; display:flex; justify-content:space-between; align-items:flex-start; font-family:var(--font-display),sans-serif}
        .pr__mcRating{font-size:52px; line-height:1; color:#fff} .pr__mcPos{font-size:14px; letter-spacing:.12em; color:#dcefff} .pr__mcTeam{font-size:14px; color:#dcefff; text-align:right; max-width:50%}
        .pr__mcPortrait{width:72%; aspect-ratio:3/4; border-radius:18px; background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.08); display:flex; align-items:center; justify-content:center; overflow:hidden; font-family:var(--font-display),sans-serif; font-size:72px; color:rgba(255,255,255,.2)}
        .pr__mcPortrait img{width:100%;height:100%;object-fit:cover}
        .pr__mcName{font-family:var(--font-display),sans-serif; font-size:28px; color:#fff; text-align:center; line-height:1}
        .pr__pill{margin-top:8px; padding:6px 12px; border-radius:999px; font-size:11px; font-weight:800; letter-spacing:.14em; text-transform:uppercase; color:#fff; background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.16)}
        .pr__pill.r-legend{color:#2a1a00;background:linear-gradient(180deg,#ffe7a3,#e1b95a);border-color:rgba(255,231,163,.8)}
        .pr__pill.r-epic{color:#1f0833;background:linear-gradient(180deg,#e9cfff,#b388ff);border-color:rgba(233,207,255,.8)}
        .pr__pill.r-rare{color:#062033;background:linear-gradient(180deg,#cfefff,#7fd0ff);border-color:rgba(207,239,255,.8)}
        .pr__pill.r-common{color:#2a1608;background:linear-gradient(180deg,#ffd8b8,#d08a52);border-color:rgba(255,216,184,.7)}
        .pr__finalCard{display:flex; flex-direction:column; align-items:center; gap:10px; animation:cardIn .7s cubic-bezier(.2,.9,.2,1)}
        @keyframes cardIn{from{opacity:0; transform:scale(.88) translateY(20px)} to{opacity:1; transform:scale(1) translateY(0)}}

        .pr__intro{position:absolute; inset:0; z-index:20; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:18px; padding:28px; opacity:0; pointer-events:none; transform:scale(1.02); background:radial-gradient(ellipse 80% 60% at 50% 45%, rgba(16,30,46,.72), rgba(6,10,18,.88)); transition:opacity .45s ease, transform .45s ease, filter .8s ease}
        .pr__intro.is-show{opacity:1; transform:scale(1)}
        .pr__intro.is-dissolve{opacity:0; transform:scale(1.06); filter:blur(14px) brightness(1.25)}
        .pr__iplaque{position:relative; width:min(560px,78%); border-radius:24px; padding:18px 24px; background:linear-gradient(180deg, rgba(255,255,255,.1), rgba(255,255,255,.03)), rgba(10,18,28,.45); border:1px solid rgba(170,225,255,.28); box-shadow:0 24px 70px rgba(0,0,0,.45), 0 0 60px rgba(120,200,255,.12), inset 0 1px 0 rgba(255,255,255,.18); backdrop-filter:blur(12px)}
        .pr__iplaque.is-locked{animation:lockFlash .9s ease-out; border-color:rgba(220,245,255,.9); box-shadow:0 24px 70px rgba(0,0,0,.45), 0 0 60px rgba(170,235,255,.45), 0 0 120px rgba(120,200,255,.2), inset 0 1px 0 rgba(255,255,255,.18)}
        .pr__iplaque--player{width:min(620px,84%); padding:20px 24px}
        .pr__ilabel{font-size:11px; letter-spacing:.22em; text-transform:uppercase; color:rgba(180,225,255,.8); margin-bottom:10px; text-align:center}
        .pr__ibody{display:flex; align-items:center; justify-content:center; gap:18px; min-height:76px}
        .pr__ibody img{width:76px;height:76px;object-fit:contain;filter:drop-shadow(0 8px 24px rgba(0,0,0,.45));flex:0 0 76px}
        .pr__ibody--player img{width:140px;height:140px;object-fit:cover;border-radius:20px;flex:0 0 140px;background:rgba(255,255,255,.04);box-shadow:0 12px 30px rgba(0,0,0,.35)}
        .pr__iavatar{width:140px;height:140px;border-radius:20px;display:flex;align-items:center;justify-content:center;font-family:var(--font-display),sans-serif;font-size:64px;color:rgba(255,255,255,.25);background:rgba(255,255,255,.04)}
        .pr__ival{font-family:var(--font-display),sans-serif; font-size:clamp(34px,4.8vw,60px); line-height:.92; letter-spacing:.03em; color:#f4fbff; text-shadow:0 0 30px rgba(160,225,255,.2); text-align:center}
        .pr__imeta{display:flex; gap:14px; margin-top:2px}
        .pr__ichip{display:flex; gap:10px; align-items:baseline; padding:10px 16px; border-radius:999px; background:rgba(10,18,28,.42); border:1px solid rgba(170,225,255,.18); backdrop-filter:blur(8px)}
        .pr__ichip span{font-size:10px; letter-spacing:.18em; text-transform:uppercase; color:rgba(180,225,255,.72)}
        .pr__ichip b{font-family:var(--font-display),sans-serif; font-size:28px; line-height:1; color:#eef8ff; min-width:40px; max-width:260px; text-align:center; white-space:nowrap; overflow:hidden; text-overflow:ellipsis}

        .pr__hud{position:absolute; left:18px; right:18px; bottom:18px; z-index:30; display:flex; gap:14px; align-items:flex-end; justify-content:space-between; pointer-events:none}
        .pr__steps,.pr__actions{pointer-events:auto}
        .pr__steps{display:flex; gap:8px; flex-wrap:wrap; max-width:58%}
        .pr__step{font-size:11px; padding:6px 10px; border-radius:999px; color:rgba(255,255,255,.55); background:rgba(10,18,28,.35); border:1px solid rgba(255,255,255,.08)}
        .pr__step.is-on{color:#fff; border-color:rgba(170,225,255,.35); background:rgba(120,200,255,.12)}
        .pr__step.is-done{color:rgba(255,255,255,.85)}
        .pr__actions{display:flex; gap:10px; align-items:center; flex-wrap:wrap; justify-content:flex-end}
        .pr__vol{display:flex; align-items:center; gap:8px; font-size:12px; color:rgba(255,255,255,.78)}
        .pr__vol input{width:120px}

        @media (max-width: 900px) {
          .pr__panel{width:min(220px,34vw); padding:12px}
          .pr__panel--l{left:12px} .pr__panel--r{right:12px}
          .pr__pval{font-size:22px; min-height:52px}
          .pr__pval--big{font-size:44px}
          .pr__hud{flex-direction:column; align-items:stretch}
          .pr__steps{max-width:100%}
          .pr__actions{justify-content:flex-start}
        }
        @media (max-width: 640px) {
          .pr { padding:8px; }
          .pr__stage { height: calc(100vh - 16px); border-radius:20px; }
          .pr__panel{width:44vw; top:auto; bottom:120px; transform:none}
          .pr__panel--l{left:8px} .pr__panel--r{right:8px}
          .pr__panel--rating{bottom:210px; top:auto}
          .pr__panel.is-locked,.pr__panel.is-active{transform:none}
          @keyframes lockFlash{0%{filter:brightness(1);transform:scale(1)}15%{filter:brightness(1.7);transform:scale(1.03)}45%{filter:brightness(1.25);transform:scale(1.01)}100%{filter:brightness(1);transform:scale(1)}}
          .pr__intro{padding:16px; gap:12px}
          .pr__iplaque,.pr__iplaque--player{width:100%; padding:14px}
          .pr__ibody--player img,.pr__iavatar{width:96px;height:96px;flex-basis:96px}
          .pr__ival{font-size:32px}
          .pr__imeta{flex-wrap:wrap; justify-content:center}
          .pr__vol input{width:90px}
        }
        @media (prefers-reduced-motion: reduce) {
          .pr__world,.pr__intro,.pr__mysteryCard,.pr__finalCard,.pr__panel,.pr__fx-c{transition:none; animation:none}
        }
      `}</style>
    </div>
  );
}
