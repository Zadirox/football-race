'use client';

import { useEffect, useRef } from 'react';

type Flake = {
  x: number;
  y: number;
  r: number;
  speed: number;
  drift: number;
  phase: number;
  alpha: number;
};

/**
 * Снег: canvas-частицы в экранных координатах (docs/03 §7).
 * Останавливается при неактивной вкладке, уважает prefers-reduced-motion
 * и снижает плотность, если кадры проседают.
 */
export function Snowfall() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;

    let width = 0;
    let height = 0;
    let flakes: Flake[] = [];
    let raf = 0;
    let running = true;
    let last = performance.now();
    let slowFrames = 0;

    const build = (count: number) => {
      flakes = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: 0.7 + Math.random() * 2.1,
        speed: 14 + Math.random() * 42,
        drift: -14 + Math.random() * 28,
        phase: Math.random() * Math.PI * 2,
        alpha: 0.18 + Math.random() * 0.55,
      }));
    };

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build(width < 720 ? 70 : 150);
    };

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      if (dt > 0.033) slowFrames += 1;
      else slowFrames = Math.max(0, slowFrames - 1);
      if (slowFrames > 40 && flakes.length > 60) {
        build(Math.floor(flakes.length / 2));
        slowFrames = 0;
      }

      ctx.clearRect(0, 0, width, height);

      for (const flake of flakes) {
        flake.phase += dt * 0.8;
        flake.y += flake.speed * dt;
        flake.x += (flake.drift + Math.sin(flake.phase) * 9) * dt;

        if (flake.y > height + 6) {
          flake.y = -6;
          flake.x = Math.random() * width;
        }
        if (flake.x < -8) flake.x = width + 8;
        if (flake.x > width + 8) flake.x = -8;

        ctx.beginPath();
        ctx.arc(flake.x, flake.y, flake.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(232, 240, 246, ${flake.alpha})`;
        ctx.fill();
      }

      if (running) raf = requestAnimationFrame(frame);
    };

    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!running) {
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };

    resize();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVisibility);
    raf = requestAnimationFrame(frame);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} className="snow-canvas" aria-hidden="true" />;
}
