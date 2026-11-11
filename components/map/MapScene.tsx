import { mulberry32 } from '@/lib/game/board';

/**
 * Фоновая сцена карты: зимний футбольный кампус в 2.5D.
 * Это SVG в координатах 4096×2048 — тот же размер, что у всех слоёв,
 * поэтому маркеры и персонажи позиционируются поверх без пересчётов.
 *
 * Арт процедурный: пока нейросетевой фон не готов (docs/03 §6.4),
 * игра выглядит цельно, а не «пусто». Фон меняется одним файлом.
 */

const W = 4096;
const H = 2048;

type Tree = { x: number; y: number; r: number; tone: string };
type SnowPatch = { x: number; y: number; rx: number; ry: number; opacity: number; rotate: number };

function buildTrees(): Tree[] {
  const rnd = mulberry32(20261112);
  const tones = ['#22402f', '#1b3527', '#2a4a36'];
  const trees: Tree[] = [];
  for (let i = 0; i < 66; i++) {
    const edge = i % 3;
    const x = rnd() * W;
    const y = edge === 0 ? 120 + rnd() * 330 : edge === 1 ? 1700 + rnd() * 300 : rnd() * H;
    const onSide = edge === 2;
    const fx = onSide ? (rnd() > 0.5 ? 60 + rnd() * 220 : W - 60 - rnd() * 220) : x;
    trees.push({
      x: fx,
      y,
      r: 26 + rnd() * 44,
      tone: tones[Math.floor(rnd() * tones.length)] ?? '#22402f',
    });
  }
  return trees;
}

/**
 * Дробные атрибуты округляем до сотых. Браузер нормализует `opacity`
 * при разборе, и длинная мантисса даёт ложное расхождение при
 * гидратации SSR-разметки. Округление убирает шум и не видно глазу.
 */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildSnow(): SnowPatch[] {
  const rnd = mulberry32(7788);
  const patches: SnowPatch[] = [];
  for (let i = 0; i < 54; i++) {
    patches.push({
      x: 160 + rnd() * (W - 320),
      y: 180 + rnd() * (H - 360),
      rx: 40 + rnd() * 190,
      ry: 14 + rnd() * 54,
      opacity: round2(0.12 + rnd() * 0.4),
      rotate: rnd() * 40 - 20,
    });
  }
  return patches;
}

const TREES = buildTrees();
const SNOW = buildSnow();

const STARS = Array.from({ length: 90 }, (_, i) => {
  const rnd = mulberry32(1000 + i);
  return { x: rnd() * W, y: rnd() * 620, r: rnd() * 1.9 + 0.5, o: round2(rnd() * 0.6 + 0.2) };
});

function TreeShape({ tree }: { tree: Tree }) {
  return (
    <g transform={`translate(${tree.x} ${tree.y})`}>
      <ellipse cx={0} cy={4} rx={tree.r * 0.9} ry={tree.r * 0.28} fill="#050d12" opacity="0.45" />
      <path
        d={`M 0 ${-tree.r * 1.7} L ${tree.r * 0.62} ${-tree.r * 0.1} L ${-tree.r * 0.62} ${-tree.r * 0.1} Z`}
        fill={tree.tone}
      />
      <path
        d={`M 0 ${-tree.r * 1.35} L ${tree.r * 0.5} ${tree.r * 0.05} L ${-tree.r * 0.5} ${tree.r * 0.05} Z`}
        fill={tree.tone}
        opacity="0.9"
      />
      <path
        d={`M 0 ${-tree.r * 1.7} L ${tree.r * 0.34} ${-tree.r * 0.95} L ${-tree.r * 0.3} ${-tree.r * 0.9} Z`}
        fill="#dfeaf3"
        opacity="0.85"
      />
      <rect x={-2.5} y={-tree.r * 0.08} width="5" height={tree.r * 0.28} fill="#2a2118" />
    </g>
  );
}

function Floodlight({ x, y, flip = 1 }: { x: number; y: number; flip?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip} 1)`}>
      <path d="M -5 0 L -2 -150 L 2 -150 L 5 0 Z" fill="#31404e" />
      <rect x={-26} y={-168} width="52" height="22" rx="5" fill="#3a4b5a" />
      <rect x={-22} y={-165} width="44" height="14" rx="3" fill="#ffe3a8" opacity="0.95" />
      <path d={`M -20 -160 L -230 120 L 250 120 L 20 -160 Z`} fill="url(#lightCone)" opacity="0.5" />
      <circle cx={0} cy={-158} r={34} fill="#ffcf80" opacity="0.22" filter="url(#softGlow)" />
    </g>
  );
}

function PineWoods() {
  return (
    <g opacity="0.55">
      {Array.from({ length: 26 }, (_, i) => {
        const rnd = mulberry32(4000 + i);
        return (
          <path
            key={i}
            d={`M ${rnd() * W} 470 l ${18 + rnd() * 16} 0 l ${-9 - rnd() * 8} ${-52 - rnd() * 40} Z`}
            fill="#14262a"
          />
        );
      })}
    </g>
  );
}

export function MapScene() {
  return (
    <>
      <svg
        className="map-layer map-layer--svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Ночная зимняя карта футбольного городка"
      >
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#081420" />
          <stop offset="42%" stopColor="#102734" />
          <stop offset="72%" stopColor="#17323d" />
          <stop offset="100%" stopColor="#0d1c25" />
        </linearGradient>
        <radialGradient id="moonGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffeec9" stopOpacity="0.55" />
          <stop offset="60%" stopColor="#cfe0ee" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#0b141c" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1d2d38" />
          <stop offset="38%" stopColor="#243744" />
          <stop offset="100%" stopColor="#16242e" />
        </linearGradient>
        <linearGradient id="pitch" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3f6b4a" />
          <stop offset="100%" stopColor="#2c4d37" />
        </linearGradient>
        <linearGradient id="stand" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3c4d5c" />
          <stop offset="100%" stopColor="#232f3a" />
        </linearGradient>
        <linearGradient id="lightCone" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffe2a8" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#ffe2a8" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="warmWindow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffd894" />
          <stop offset="100%" stopColor="#e0a252" />
        </linearGradient>
        <filter id="softGlow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="18" />
        </filter>
        <filter id="hardGlow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <radialGradient id="warmPool" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffc46b" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#ffc46b" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* небо */}
      <rect width={W} height={H} fill="url(#sky)" />
      {STARS.map((star, i) => (
        <circle key={i} cx={star.x} cy={star.y} r={star.r} fill="#dfeaf3" opacity={star.o} />
      ))}
      <circle cx={3320} cy={330} r={230} fill="url(#moonGlow)" />
      <circle cx={3320} cy={330} r={62} fill="#f2eee2" opacity="0.92" />
      <circle cx={3344} cy={316} r={52} fill="#102734" opacity="0.55" />

      {/* дальняя линия леса */}
      <path
        d={`M 0 620 L 240 560 L 460 600 L 700 520 L 980 590 L 1240 520 L 1520 600 L 1820 512 L 2140 590 L 2440 520 L 2740 600 L 3020 530 L 3320 596 L 3620 520 L 3900 590 L ${W} 540 L ${W} 760 L 0 760 Z`}
        fill="#0e1d26"
        opacity="0.9"
      />
      <PineWoods />

      {/* земля */}
      <path
        d={`M 120 760 Q 2048 560 3976 760 L 4096 1560 Q 2048 1980 0 1560 Z`}
        fill="url(#ground)"
      />
      <path
        d={`M 120 760 Q 2048 560 3976 760 L 4096 1560 Q 2048 1980 0 1560 Z`}
        fill="none"
        stroke="#33454f"
        strokeWidth="4"
        opacity="0.5"
      />

      {/* снежные пятна */}
      {SNOW.map((patch, i) => (
        <ellipse
          key={i}
          cx={patch.x}
          cy={patch.y}
          rx={patch.rx}
          ry={patch.ry}
          fill="#dfeaf3"
          opacity={patch.opacity}
          transform={`rotate(${patch.rotate} ${patch.x} ${patch.y})`}
        />
      ))}

      {/* стадион в центре */}
      <g transform="translate(2048 1000)">
        <ellipse cx="0" cy="150" rx="760" ry="250" fill="#060f15" opacity="0.4" />
        <ellipse cx="0" cy="0" rx="740" ry="250" fill="url(#stand)" stroke="#435565" strokeWidth="5" />
        <ellipse cx="0" cy="-6" rx="620" ry="196" fill="#2a3846" />
        <ellipse cx="0" cy="-12" rx="520" ry="156" fill="url(#pitch)" />
        {Array.from({ length: 9 }, (_, i) => (
          <rect
            key={i}
            x={-470 + i * 105}
            y={-140}
            width="52"
            height="272"
            fill="#ffffff"
            opacity="0.035"
          />
        ))}
        <ellipse cx="0" cy="-12" rx="520" ry="156" fill="none" stroke="#e8f0f6" strokeWidth="3" opacity="0.45" />
        <ellipse cx="0" cy="-12" rx="92" ry="28" fill="none" stroke="#e8f0f6" strokeWidth="3" opacity="0.45" />
        <line x1="0" y1="-168" x2="0" y2="144" stroke="#e8f0f6" strokeWidth="3" opacity="0.35" />
        <rect x="-150" y="-52" width="300" height="80" fill="none" stroke="#e8f0f6" strokeWidth="3" opacity="0.3" />

        {/* снег на трибунах */}
        {Array.from({ length: 30 }, (_, i) => {
          const rnd = mulberry32(900 + i);
          const angle = rnd() * Math.PI * 2;
          const rx = 600 + rnd() * 120;
          const ry = 190 + rnd() * 40;
          return (
            <ellipse
              key={i}
              cx={round2(Math.cos(angle) * rx)}
              cy={round2(Math.sin(angle) * ry)}
              rx={round2(16 + rnd() * 22)}
              ry={round2(5 + rnd() * 6)}
              fill="#e8f0f6"
              opacity={round2(0.5 + rnd() * 0.3)}
            />
          );
        })}

        {/* табло */}
        <g transform="translate(0 -286)">
          <rect x="-120" y="-58" width="240" height="96" rx="10" fill="#1a2732" stroke="#3d5062" strokeWidth="4" />
          <rect x="-104" y="-44" width="208" height="68" rx="6" fill="#132029" />
          <rect x="-104" y="-44" width="208" height="20" rx="6" fill="#c8f25a" opacity="0.18" />
          <text x="0" y="-8" textAnchor="middle" fontFamily="monospace" fontSize="24" fill="#c8f25a" opacity="0.85">
            ФУТБОЛЬНАЯ ГОНКА
          </text>
          <rect x="-12" y="38" width="24" height="44" fill="#26343f" />
        </g>

        <Floodlight x={-700} y={-150} />
        <Floodlight x={700} y={-150} flip={-1} />
        <Floodlight x={-560} y={210} />
        <Floodlight x={560} y={210} flip={-1} />
      </g>

      {/* клубный магазин слева */}
      <g transform="translate(430 1500)">
        <ellipse cx="0" cy="86" rx="150" ry="34" fill="#050d12" opacity="0.45" />
        <rect x="-110" y="-40" width="220" height="120" rx="10" fill="#2b3b48" />
        <path d="M -128 -40 L 0 -110 L 128 -40 Z" fill="#e8f0f6" opacity="0.9" />
        <rect x="-84" y="10" width="66" height="70" rx="4" fill="url(#warmWindow)" />
        <rect x="18" y="10" width="66" height="70" rx="4" fill="url(#warmWindow)" opacity="0.8" />
        <rect x="-18" y="-14" width="36" height="24" rx="4" fill="#c8f25a" opacity="0.85" />
        <ellipse cx="0" cy="120" rx="180" ry="46" fill="url(#warmPool)" />
      </g>

      {/* тренировочная база справа сверху */}
      <g transform="translate(3380 720)">
        <ellipse cx="0" cy="110" rx="240" ry="60" fill="#050d12" opacity="0.4" />
        <rect x="-190" y="-10" width="380" height="120" rx="60" fill="#2f6b4a" opacity="0.85" />
        <rect x="-190" y="-10" width="380" height="120" rx="60" fill="none" stroke="#e8f0f6" strokeWidth="4" opacity="0.3" />
        <line x1="0" y1="-6" x2="0" y2="106" stroke="#e8f0f6" strokeWidth="3" opacity="0.25" />
        <circle cx="0" cy="50" r="22" fill="none" stroke="#e8f0f6" strokeWidth="3" opacity="0.25" />
        <rect x="-96" y="-58" width="10" height="46" fill="#cfdae4" opacity="0.8" />
        <rect x="-6" y="-58" width="10" height="46" fill="#cfdae4" opacity="0.8" />
        <rect x="84" y="-58" width="10" height="46" fill="#cfdae4" opacity="0.8" />
        {[-96, -6, 84].map((x) => (
          <circle key={x} cx={x + 5} cy={-66} r="12" fill="#e8f0f6" opacity="0.85" />
        ))}
      </g>

      {/* фан-зона справа снизу */}
      <g transform="translate(3320 1500)">
        <ellipse cx="0" cy="120" rx="300" ry="70" fill="#050d12" opacity="0.4" />
        {[-180, -40, 100].map((x, i) => (
          <g key={i} transform={`translate(${x} ${i === 1 ? 10 : 0})`}>
            <rect x="-52" y="-30" width="104" height="86" rx="6" fill="#3a2d22" />
            <path d="M -64 -30 L 0 -74 L 64 -30 Z" fill="#e4573d" opacity={i === 1 ? 0.85 : 0.7} />
            <path d="M -64 -30 L 0 -74 L 64 -30 Z" fill="none" stroke="#ffe2b8" strokeWidth="3" opacity="0.5" />
            <rect x="-20" y="6" width="40" height="46" rx="4" fill="url(#warmWindow)" />
          </g>
        ))}
        {[-240, -110, 30, 170].map((x) => (
          <circle key={x} cx={x} cy={-96} r="5" fill="#ffc46b" opacity="0.9" filter="url(#hardGlow)" />
        ))}
        <path
          d="M -240 -96 Q -110 -128 30 -96 Q 170 -64 230 -110"
          stroke="#ffc46b"
          strokeWidth="2"
          fill="none"
          opacity="0.6"
        />
      </g>

      {/* колесо обозрения */}
      <g transform="translate(3760 980)" opacity="0.9">
        <circle cx="0" cy="0" r="118" fill="none" stroke="#536b7c" strokeWidth="5" />
        <circle cx="0" cy="0" r="86" fill="none" stroke="#3d5262" strokeWidth="3" />
        {Array.from({ length: 12 }, (_, i) => {
          const angle = (Math.PI * 2 * i) / 12;
          return (
            <line
              key={i}
              x1="0"
              y1="0"
              x2={round2(Math.cos(angle) * 118)}
              y2={round2(Math.sin(angle) * 118)}
              stroke="#3d5262"
              strokeWidth="2.5"
            />
          );
        })}
        {Array.from({ length: 12 }, (_, i) => {
          const angle = (Math.PI * 2 * i) / 12;
          return (
            <circle
              key={i}
              cx={round2(Math.cos(angle) * 118)}
              cy={round2(Math.sin(angle) * 118)}
              r="9"
              fill={i % 3 === 0 ? '#ffc46b' : '#8fa6b8'}
              opacity="0.9"
            />
          );
        })}
        <path d="M -52 130 L 0 0 L 52 130" fill="none" stroke="#3a4b5a" strokeWidth="8" />
      </g>

      {/* пьедестал финиша */}
      <g transform="translate(3860 430)">
        <ellipse cx="0" cy="96" rx="120" ry="34" fill="#050d12" opacity="0.45" />
        <rect x="-80" y="20" width="160" height="70" rx="10" fill="#33424f" />
        <rect x="-56" y="-6" width="112" height="30" rx="6" fill="#3f5162" />
        <path d="M -34 -6 L -34 -48 Q 0 -80 34 -48 L 34 -6 Z" fill="#f2c14e" />
        <path d="M -34 -30 L -66 -22 L -66 -46 L -34 -48 Z" fill="#f2c14e" />
        <path d="M 34 -30 L 66 -22 L 66 -46 L 34 -48 Z" fill="#f2c14e" />
        <rect x="-30" y="-14" width="60" height="10" rx="4" fill="#b98b22" />
        <circle cx="0" cy="-86" r="46" fill="url(#warmPool)" />
        {Array.from({ length: 10 }, (_, i) => {
          const rnd = mulberry32(300 + i);
          const angle = rnd() * Math.PI * 2;
          const dist = 90 + rnd() * 90;
          return (
            <circle
              key={i}
              cx={round2(Math.cos(angle) * dist)}
              cy={round2(Math.sin(angle) * dist * 0.6 - 70)}
              r={round2(2 + rnd() * 3)}
              fill={i % 2 === 0 ? '#ffe08a' : '#c8f25a'}
              opacity="0.9"
            />
          );
        })}
      </g>

      {/* фонари по краям */}
      {[
        { x: 260, y: 1180 },
        { x: 1180, y: 1720 },
        { x: 2860, y: 1760 },
        { x: 3900, y: 1250 },
        { x: 640, y: 860 },
        { x: 2440, y: 700 },
      ].map((lamp, i) => (
        <g key={i} transform={`translate(${lamp.x} ${lamp.y})`}>
          <circle cx="0" cy="0" r="90" fill="url(#warmPool)" />
          <rect x="-4" y="-92" width="8" height="92" fill="#2c3945" />
          <circle cx="0" cy="-96" r="12" fill="#ffd894" />
          <circle cx="0" cy="-96" r="24" fill="#ffc46b" opacity="0.25" filter="url(#hardGlow)" />
        </g>
      ))}

      {/* деревья */}
      {TREES.map((tree, i) => (
        <TreeShape key={i} tree={tree} />
      ))}

      {/* передний снежный вал */}
      <path
        d={`M 0 1660 Q 700 1600 1400 1660 Q 2048 1720 2700 1650 Q 3400 1590 4096 1660 L 4096 2048 L 0 2048 Z`}
        fill="#0a151d"
        opacity="0.85"
      />
      <path
        d={`M 0 1660 Q 700 1600 1400 1660 Q 2048 1720 2700 1650 Q 3400 1590 4096 1660`}
        fill="none"
        stroke="#e8f0f6"
        strokeWidth="5"
        opacity="0.18"
      />
      </svg>
      {/*
        Фон города одной картинкой. Слой лежит поверх процедурной сцены:
        файла нет — слой прозрачный и видна сцена, файл появился — картинка
        заменяет небо, городок и трибуны без правок кода. Дорожка, клетки
        и персонажи рисуются отдельными слоями выше.
      */}
      <div className="map-layer map-art" aria-hidden="true" />
    </>
  );
}
