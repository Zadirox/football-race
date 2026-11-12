'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Панорамирование и зум карты (docs/03 §8).
 * Трансформация живёт в ref и применяется напрямую к DOM —
 * так драг не вызывает ререндер React на каждом кадре.
 */

export type PanZoomOptions = {
  worldWidth?: number;
  worldHeight?: number;
  /** Точка фокуса в координатах мира (обычно клетка игрока). */
  focus?: { x: number; y: number };
};

export function usePanZoom({ worldWidth = 4096, worldHeight = 2048, focus }: PanZoomOptions = {}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const transform = useRef({ x: 0, y: 0, scale: 1 });
  const [scale, setScale] = useState(1);
  const dragState = useRef({ active: false, moved: 0, lastX: 0, lastY: 0, vx: 0, vy: 0 });
  const inertiaFrame = useRef<number | null>(null);
  const didDrag = useRef(false);

  const limits = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return { min: 0.3, max: 2 };
    const fitW = viewport.clientWidth / worldWidth;
    const fitH = viewport.clientHeight / worldHeight;
    const contain = Math.min(fitW, fitH);
    const cover = Math.max(fitW, fitH);
    return { min: Math.max(0.18, contain), max: Math.max(1.2, cover * 3.6) };
  }, [worldHeight, worldWidth]);

  const apply = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { x, y, scale: s } = transform.current;
    canvas.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${s})`;
    canvas.style.setProperty('--inv-scale', String(1 / s));
    canvas.style.visibility = 'visible';
  }, []);

  const clamp = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const { scale: s } = transform.current;
    const w = worldWidth * s;
    const h = worldHeight * s;

    if (w <= vw) {
      transform.current.x = (vw - w) / 2;
    } else {
      // Карта больше экрана — не даём увести её край внутрь окна.
      transform.current.x = Math.min(0, Math.max(vw - w, transform.current.x));
    }
    if (h <= vh) {
      transform.current.y = (vh - h) / 2;
    } else {
      transform.current.y = Math.min(0, Math.max(vh - h, transform.current.y));
    }
  }, [worldHeight, worldWidth]);

  const centerOn = useCallback(
    (point: { x: number; y: number }, targetScale?: number) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const { min, max } = limits();
      const s = Math.min(max, Math.max(min, targetScale ?? transform.current.scale));
      const vw = viewport.clientWidth;
      const vh = viewport.clientHeight;
      transform.current = {
        scale: s,
        x: vw / 2 - point.x * s,
        y: vh / 2 - point.y * s,
      };
      clamp();
      apply();
      setScale(s);
    },
    [apply, clamp, limits],
  );

  const reset = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const { min } = limits();
    // Стартовый вид — «обложка»: карта заполняет экран целиком,
    // без тёмных полос сверху и снизу.
    const cover = Math.max(viewport.clientWidth / worldWidth, viewport.clientHeight / worldHeight);
    const startScale = Math.min(1.15, Math.max(min, cover));
    centerOn(focus ?? { x: worldWidth / 2, y: worldHeight / 2 }, startScale);
  }, [centerOn, focus, limits, worldHeight, worldWidth]);

  const zoomBy = useCallback(
    (factor: number, originX?: number, originY?: number) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const rect = viewport.getBoundingClientRect();
      const px = originX ?? rect.width / 2;
      const py = originY ?? rect.height / 2;
      const { min, max } = limits();
      const next = Math.min(max, Math.max(min, transform.current.scale * factor));
      const wx = (px - transform.current.x) / transform.current.scale;
      const wy = (py - transform.current.y) / transform.current.scale;
      transform.current.scale = next;
      transform.current.x = px - wx * next;
      transform.current.y = py - wy * next;
      clamp();
      apply();
      setScale(next);
    },
    [apply, clamp, limits],
  );

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    reset();
    const onResize = () => {
      clamp();
      apply();
    };
    window.addEventListener('resize', onResize);

    const stopInertia = () => {
      if (inertiaFrame.current !== null) {
        cancelAnimationFrame(inertiaFrame.current);
        inertiaFrame.current = null;
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      stopInertia();
      didDrag.current = false;
      dragState.current = {
        active: true,
        moved: 0,
        lastX: event.clientX,
        lastY: event.clientY,
        vx: 0,
        vy: 0,
      };
      viewport.setPointerCapture(event.pointerId);
      viewport.dataset.dragging = 'true';
    };

    const onPointerMove = (event: PointerEvent) => {
      const drag = dragState.current;
      if (!drag.active) return;
      const dx = event.clientX - drag.lastX;
      const dy = event.clientY - drag.lastY;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      drag.vx = dx;
      drag.vy = dy;
      transform.current.x += dx;
      transform.current.y += dy;
      clamp();
      apply();
      if (drag.moved > 6) didDrag.current = true;
    };

    const onPointerUp = (event: PointerEvent) => {
      const drag = dragState.current;
      if (!drag.active) return;
      drag.active = false;
      viewport.dataset.dragging = 'false';
      if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);

      let vx = drag.vx;
      let vy = drag.vy;
      if (Math.abs(vx) < 0.6 && Math.abs(vy) < 0.6) return;

      const tick = () => {
        vx *= 0.92;
        vy *= 0.92;
        transform.current.x += vx;
        transform.current.y += vy;
        clamp();
        apply();
        if (Math.abs(vx) > 0.4 || Math.abs(vy) > 0.4) {
          inertiaFrame.current = requestAnimationFrame(tick);
        } else {
          inertiaFrame.current = null;
        }
      };
      inertiaFrame.current = requestAnimationFrame(tick);
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const factor = event.deltaY > 0 ? 0.92 : 1.08;
      zoomBy(factor, event.clientX - rect.left, event.clientY - rect.top);
    };

    const onDoubleClick = (event: MouseEvent) => {
      const rect = viewport.getBoundingClientRect();
      const zoomedIn = transform.current.scale > (limits().min + limits().max) / 2;
      zoomBy(zoomedIn ? 0.7 : 1.4, event.clientX - rect.left, event.clientY - rect.top);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const step = 120;
      const map: Record<string, [number, number]> = {
        ArrowLeft: [step, 0],
        ArrowRight: [-step, 0],
        ArrowUp: [0, step],
        ArrowDown: [0, -step],
      };
      const delta = map[event.key];
      if (!delta) return;
      event.preventDefault();
      transform.current.x += delta[0];
      transform.current.y += delta[1];
      clamp();
      apply();
    };

    viewport.addEventListener('pointerdown', onPointerDown);
    viewport.addEventListener('pointermove', onPointerMove);
    viewport.addEventListener('pointerup', onPointerUp);
    viewport.addEventListener('pointercancel', onPointerUp);
    viewport.addEventListener('wheel', onWheel, { passive: false });
    viewport.addEventListener('dblclick', onDoubleClick);
    viewport.addEventListener('keydown', onKeyDown);

    return () => {
      stopInertia();
      window.removeEventListener('resize', onResize);
      viewport.removeEventListener('pointerdown', onPointerDown);
      viewport.removeEventListener('pointermove', onPointerMove);
      viewport.removeEventListener('pointerup', onPointerUp);
      viewport.removeEventListener('pointercancel', onPointerUp);
      viewport.removeEventListener('wheel', onWheel);
      viewport.removeEventListener('dblclick', onDoubleClick);
      viewport.removeEventListener('keydown', onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    viewportRef,
    canvasRef,
    scale,
    reset,
    zoomBy,
    wasDrag: () => didDrag.current,
  };
}
