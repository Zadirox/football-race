'use client';

import { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, Float, RoundedBox, Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import type { CardRarity } from '@/lib/game/cards';

type Props = {
  rarity: CardRarity;
  /** 0 = intro/pack, 1..3 = suspense steps, 4 = full reveal */
  step: number;
  /** 0..1, overall reveal progress for smooth transitions */
  progress: number;
  /** When false, keep visuals in mystery state until rarity is known (e.g. after rating). */
  rarityRevealed?: boolean;
};

const RARITY_THEME: Record<CardRarity, { color: string; emissive: string; accent: string; spark: string; intensity: number; sparkCount: number }> = {
  common: { color: '#a85d2a', emissive: '#3d1f0d', accent: '#e8ba84', spark: '#ffd2a0', intensity: 1.35, sparkCount: 120 },
  rare: { color: '#4fc3ff', emissive: '#123f66', accent: '#e6f8ff', spark: '#bfeaff', intensity: 2.0, sparkCount: 220 },
  epic: { color: '#b06cff', emissive: '#3e1f6a', accent: '#f6e6ff', spark: '#e2bfff', intensity: 2.7, sparkCount: 320 },
  legend: { color: '#ffc94a', emissive: '#6b450b', accent: '#fff6d6', spark: '#ffe6a3', intensity: 3.6, sparkCount: 480 },
};

const MYSTERY_THEME = { color: '#7fd4ff', emissive: '#163246', accent: '#eaf7ff', spark: '#cfefff', intensity: 0.9, sparkCount: 70 };

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
}
function clamp01(v: number) {
  return Math.min(1, Math.max(0, v));
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function makeLabelTexture(accent: string) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 768;
  const g = c.getContext('2d');
  if (!g) return null;
  g.clearRect(0, 0, c.width, c.height);
  const grad = g.createLinearGradient(0, 0, 0, c.height);
  grad.addColorStop(0, 'rgba(255,255,255,0.18)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.02)');
  grad.addColorStop(1, 'rgba(0,0,0,0.25)');
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.lineWidth = 10;
  g.strokeRect(26, 26, c.width - 52, c.height - 52);
  g.strokeStyle = accent;
  g.globalAlpha = 0.55;
  g.lineWidth = 4;
  g.strokeRect(48, 48, c.width - 96, c.height - 96);
  g.globalAlpha = 1;
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.textAlign = 'center';
  g.font = '700 34px system-ui, sans-serif';
  g.fillText('FOOTBALL RACE', c.width / 2, 150);
  g.font = '800 72px system-ui, sans-serif';
  g.fillStyle = accent;
  g.fillText('СБОРНЫЕ', c.width / 2, 250);
  g.font = '700 30px system-ui, sans-serif';
  g.fillStyle = 'rgba(255,255,255,0.8)';
  g.fillText('NATIONAL PACK', c.width / 2, 305);
  g.beginPath();
  g.arc(c.width / 2, 430, 78, 0, Math.PI * 2);
  g.strokeStyle = 'rgba(255,255,255,0.5)';
  g.lineWidth = 5;
  g.stroke();
  g.font = '700 64px system-ui, sans-serif';
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.fillText('⚽', c.width / 2, 452);
  g.font = '600 26px system-ui, sans-serif';
  g.fillStyle = 'rgba(255,255,255,0.7)';
  g.fillText('1 КАРТОЧКА', c.width / 2, 620);
  g.fillText('БЕЗ ДУБЛЕЙ', c.width / 2, 660);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function PackObject({ theme, step, progress }: { theme: (typeof RARITY_THEME)[CardRarity]; step: number; progress: number }) {
  const group = useRef<THREE.Group>(null);
  const flap = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const card = useRef<THREE.Group>(null);
  const burstLight = useRef<THREE.PointLight>(null);
  const innerGlow = useRef<THREE.Mesh>(null);

  const labelTex = useMemo(() => makeLabelTexture(theme.accent), [theme.accent]);

  const suspense = clamp01(step / 3); // 0..1 over steps 0-3
  const openT = easeOutCubic(clamp01((progress - 0.62) / 0.28)); // tear/open
  const cardT = easeOutCubic(clamp01((progress - 0.7) / 0.3));
  const burst = clamp01((progress - 0.6) / 0.15) * (1 - clamp01((progress - 0.9) / 0.1));

  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();
    const shake = (step >= 1 && step <= 3 ? (0.006 + suspense * 0.012) : 0.003) * (1 - openT * 0.8);
    const shakeSpeed = 10 + suspense * 18;

    if (group.current) {
      group.current.position.y = Math.sin(t * 1.2) * 0.05 + openT * 0.05;
      group.current.rotation.y = Math.sin(t * 0.5) * 0.12 + Math.sin(t * 1.7) * shake * 8;
      group.current.rotation.z = Math.sin(t * 0.7) * 0.03 + Math.sin(t * shakeSpeed) * shake * 6;
      group.current.rotation.x = Math.sin(t * 0.4) * 0.04 - 0.05;
      group.current.position.x = Math.sin(t * shakeSpeed * 0.9) * shake * 10;
    }

    if (flap.current) {
      // idle slight flutter, then tear open upwards/back
      const idle = Math.sin(t * 2.2) * 0.03;
      const target = -idle - openT * 2.35;
      flap.current.rotation.x += (target - flap.current.rotation.x) * Math.min(1, delta * 6);
      flap.current.position.y += ((0.98 + openT * 0.18) - flap.current.position.y) * Math.min(1, delta * 5);
      flap.current.position.z += ((-0.02 - openT * 0.25) - flap.current.position.z) * Math.min(1, delta * 5);
    }

    if (body.current) {
      // slight split as it opens
      body.current.position.y += ((-openT * 0.05) - body.current.position.y) * Math.min(1, delta * 4);
    }

    if (card.current) {
      const targetY = -0.2 + cardT * 1.25;
      const targetZ = -0.05 + cardT * 0.55;
      const targetScale = 0.15 + cardT * 1.0;
      card.current.visible = progress > 0.62;
      card.current.position.y += (targetY - card.current.position.y) * Math.min(1, delta * 3.5);
      card.current.position.z += (targetZ - card.current.position.z) * Math.min(1, delta * 3.5);
      const sc = card.current.scale.x + (targetScale - card.current.scale.x) * Math.min(1, delta * 4);
      card.current.scale.setScalar(sc);
      const targetRotY = Math.sin(t * 1.4) * 0.08 * cardT + (1 - cardT) * 0.2;
      card.current.rotation.y += (targetRotY - card.current.rotation.y) * Math.min(1, delta * 4);
      card.current.rotation.x = Math.sin(t * 0.9) * 0.05 * cardT - 0.04;
    }

    if (burstLight.current) {
      burstLight.current.intensity = theme.intensity * (8 + suspense * 10 + burst * 60);
      burstLight.current.distance = 6 + burst * 4;
    }
    if (innerGlow.current) {
      const m = innerGlow.current.material as THREE.MeshBasicMaterial;
      m.opacity = 0.05 + suspense * 0.12 + burst * 0.65;
      innerGlow.current.scale.setScalar(1 + burst * 0.6);
    }
  });

  const packW = 1.35;
  const packH = 1.95;
  const packD = 0.18;
  const bodyH = 1.7;
  const flapH = 0.32;

  return (
    <group ref={group}>
      <group ref={body}>
        {/* main pack body */}
        <RoundedBox args={[packW, bodyH, packD]} radius={0.06} smoothness={4} position={[0, -0.12, 0]}>
          <meshPhysicalMaterial
            color={theme.color}
            emissive={theme.emissive}
            emissiveIntensity={theme.intensity * (0.35 + suspense * 0.25)}
            metalness={0.92}
            roughness={0.22}
            clearcoat={0.35}
            clearcoatRoughness={0.25}
            reflectivity={0.9}
          />
        </RoundedBox>

        {/* front face label */}
        <mesh position={[0, -0.12, packD / 2 + 0.006]}>
          <planeGeometry args={[packW - 0.12, bodyH - 0.12]} />
          <meshStandardMaterial
            map={labelTex ?? undefined}
            color="#ffffff"
            metalness={0.35}
            roughness={0.35}
            transparent
            opacity={0.98}
          />
        </mesh>

        {/* foil sheen stripes */}
        <mesh position={[0, -0.12, -packD / 2 - 0.004]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[packW - 0.16, bodyH - 0.16]} />
          <meshStandardMaterial color={theme.accent} metalness={0.8} roughness={0.25} emissive={theme.emissive} emissiveIntensity={0.15} transparent opacity={0.5} />
        </mesh>

        {/* side glow */}
        <mesh position={[0, -0.12, 0]}>
          <boxGeometry args={[packW + 0.04, bodyH + 0.04, packD + 0.02]} />
          <meshBasicMaterial color={theme.accent} transparent opacity={0.06} />
        </mesh>

        {/* inner glow / light leak */}
        <mesh ref={innerGlow} position={[0, 0.55, 0.02]}>
          <planeGeometry args={[packW - 0.2, 0.5]} />
          <meshBasicMaterial color={theme.spark} transparent opacity={0.05} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      </group>

      {/* top flap (sealed edge) */}
      <group ref={flap} position={[0, 0.98, -0.02]}>
        {/* hinge at bottom of flap */}
        <group position={[0, flapH / 2, 0]}>
          <RoundedBox args={[packW, flapH, packD]} radius={0.05} smoothness={4}>
            <meshPhysicalMaterial
              color={theme.accent}
              emissive={theme.color}
              emissiveIntensity={theme.intensity * 0.25}
              metalness={0.95}
              roughness={0.18}
              clearcoat={0.4}
            />
          </RoundedBox>
          <mesh position={[0, 0, packD / 2 + 0.006]}>
            <planeGeometry args={[packW - 0.16, flapH - 0.06]} />
            <meshStandardMaterial color={theme.spark} metalness={0.7} roughness={0.2} emissive={theme.color} emissiveIntensity={0.2} transparent opacity={0.7} />
          </mesh>
          {/* tear notch */}
          <mesh position={[packW / 2 - 0.12, -flapH / 2 + 0.02, packD / 2 + 0.01]}>
            <circleGeometry args={[0.06, 24]} />
            <meshBasicMaterial color="#0b0f14" />
          </mesh>
        </group>
      </group>

      {/* seal strip */}
      <mesh position={[0, 0.72, packD / 2 + 0.01]}>
        <boxGeometry args={[packW - 0.08, 0.05, 0.01]} />
        <meshStandardMaterial color={theme.spark} emissive={theme.accent} emissiveIntensity={theme.intensity * 0.5} metalness={0.6} roughness={0.3} />
      </mesh>

      {/* card emerging */}
      <group ref={card} position={[0, -0.2, 0.1]} scale={0.01} visible={false}>
        <Float speed={2.4} rotationIntensity={0.2} floatIntensity={0.3}>
          <RoundedBox args={[1.05, 1.55, 0.06]} radius={0.04} smoothness={3}>
            <meshStandardMaterial color={theme.color} emissive={theme.emissive} emissiveIntensity={theme.intensity * 0.55} metalness={0.85} roughness={0.18} />
          </RoundedBox>
          <mesh position={[0, 0, 0.034]}>
            <planeGeometry args={[0.93, 1.42]} />
            <meshStandardMaterial color={theme.accent} emissive={theme.accent} emissiveIntensity={0.16} transparent opacity={0.22} metalness={0.2} roughness={0.4} />
          </mesh>
        </Float>
      </group>

      <pointLight ref={burstLight} position={[0, 0.6, 0.4]} intensity={theme.intensity * 10} distance={6} color={theme.accent} />
      <pointLight position={[1.8, 1.2, 2.2]} intensity={5} distance={8} color="#ffffff" />
      <pointLight position={[-1.8, -0.8, 1.8]} intensity={3.5} distance={8} color={theme.color} />
      <Sparkles count={theme.sparkCount} scale={[5.5, 5.5, 4]} size={2.4} speed={0.35 + suspense * 0.2} opacity={0.85} color={theme.spark} />
      <Sparkles count={Math.floor(theme.sparkCount * 0.5)} scale={[3, 3.5, 3]} size={4} speed={0.25} opacity={0.55} color={theme.accent} />
    </group>
  );
}

function CameraRig({ step, progress }: { step: number; progress: number }) {
  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    const openT = clamp01((progress - 0.6) / 0.4);
    const targetZ = lerp(4.9 - step * 0.06, 4.15, openT);
    const targetY = lerp(0.05 + Math.sin(t * 0.35) * 0.03, 0.25, openT);
    const targetX = Math.sin(t * 0.22) * lerp(0.22, 0.12, openT);
    state.camera.position.x += (targetX - state.camera.position.x) * 0.035;
    state.camera.position.y += (targetY - state.camera.position.y) * 0.035;
    state.camera.position.z += (targetZ - state.camera.position.z) * 0.035;
    state.camera.lookAt(0, lerp(0, 0.15, openT), 0);
  });
  return null;
}

export function PackRevealScene({ rarity, step, progress, rarityRevealed = true }: Props) {
  const base = rarityRevealed ? RARITY_THEME[rarity] : MYSTERY_THEME;
  // when rarity becomes known, boost intensity for a more dramatic reveal
  const boost = rarityRevealed ? (rarity === 'legend' ? 1.6 : rarity === 'epic' ? 1.35 : rarity === 'rare' ? 1.18 : 1.05) : 0.8;
  const theme = {
    ...base,
    intensity: base.intensity * boost,
    sparkCount: Math.floor(base.sparkCount * (rarityRevealed ? boost : 0.75)),
  };
  const burst = clamp01((progress - 0.58) / 0.16) * (1 - clamp01((progress - 0.94) / 0.06));
  const charge = rarityRevealed ? 1 : 0.4;
  const epicness = rarityRevealed ? (rarity === 'legend' ? 1 : rarity === 'epic' ? 0.78 : rarity === 'rare' ? 0.55 : 0.35) : 0.25;

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} aria-hidden="true">
      <Canvas
        dpr={[1, 1.9]}
        camera={{ position: [0, 0.05, 5.0], fov: 40 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      >
        <color attach="background" args={['#03050a']} />
        <fog attach="fog" args={['#03050a', 6.0, 12.5]} />
        <ambientLight intensity={0.35 + charge * 0.18 + epicness * 0.08} />
        <directionalLight position={[3, 5, 4]} intensity={1.1 + charge * 0.35 + epicness * 0.25} color="#ffffff" />
        <directionalLight position={[-3, -1, 2]} intensity={0.45 + charge * 0.35} color={theme.color} />
        <pointLight position={[0, 1.2, 1.2]} intensity={2 + epicness * 6 + burst * 10} distance={8} color={theme.accent} />
        <Suspense fallback={null}>
          <PackObject theme={theme} step={step} progress={progress} />
          <Environment preset="city" />
        </Suspense>
        <CameraRig step={step} progress={progress} />
      </Canvas>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(55% 45% at 50% 45%, ${theme.color}${rarityRevealed ? '66' : '22'}, transparent 62%), radial-gradient(120% 90% at 50% 50%, transparent 28%, rgba(0,0,0,0.72) 100%)`,
          mixBlendMode: 'screen',
          opacity: 0.55 + charge * 0.3 + burst * 0.35 + epicness * 0.1,
          transition: 'background 700ms ease, opacity 500ms ease',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(45% 38% at 50% 42%, ${theme.accent}88, transparent 72%)`,
          mixBlendMode: 'screen',
          opacity: burst * 1.05 + (rarityRevealed && step >= 3 ? 0.12 + epicness * 0.12 : 0),
          transition: 'opacity 180ms linear, background 700ms ease',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `conic-gradient(from 210deg at 50% 42%, transparent 0deg, ${theme.spark}22 40deg, transparent 80deg, ${theme.accent}18 140deg, transparent 180deg, ${theme.spark}22 240deg, transparent 280deg, ${theme.accent}18 330deg, transparent 360deg)`,
          mixBlendMode: 'screen',
          opacity: (rarityRevealed ? 0.18 + epicness * 0.28 : 0.06) + burst * 0.25,
          filter: 'blur(18px)',
          transition: 'opacity 600ms ease, background 700ms ease',
        }}
      />
      {burst > 0.01 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `radial-gradient(60% 45% at 50% 42%, ${theme.accent}${Math.round(40 + epicness * 50).toString(16)}, transparent 70%)`,
            mixBlendMode: 'screen',
            opacity: burst * (0.35 + epicness * 0.45),
          }}
        />
      )}
    </div>
  );
}
