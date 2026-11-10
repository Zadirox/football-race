'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/**
 * Первый заход (docs/07 §2): три шага вместо простыни правил.
 *
 * Показываем один раз на браузер — отметка в `localStorage`. Вернуть обучение
 * можно ссылкой `/?intro=1` из правил, она срабатывает поверх отметки.
 */
const STORAGE_KEY = 'fg.onboarded.v1';

type Step = {
  title: string;
  text: string;
};

const STEPS: Step[] = [
  {
    title: 'Бросай кубик',
    text: 'Кубиков столько, сколько заслужил ответами. Бросок двигает тебя по карте — чем выше тир, тем дальше шаг.',
  },
  {
    title: 'Иди по карте',
    text: 'Клетки срабатывают сразу: контратака тащит вперёд, офсайд откатывает назад, VAR решает исход.',
  },
  {
    title: 'Отвечай на предикты',
    text: 'Вопросы по реальным матчам. Точность даёт кубики и толкает вверх в трёх рейтингах.',
  },
];

export function Onboarding({ forceOpen = false }: { forceOpen?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const nextRef = useRef<HTMLButtonElement | null>(null);

  const finish = useCallback(
    (navigate: boolean) => {
      setOpen(false);
      try {
        window.localStorage.setItem(STORAGE_KEY, '1');
      } catch {
        // Приватный режим: обучение просто покажется ещё раз.
      }
      if (new URLSearchParams(window.location.search).has('intro')) {
        // `router.replace` вместо `history.replaceState`: Next держит свою копию
        // адреса и иначе возвращает `?intro=1` назад при следующем рендере.
        router.replace(window.location.pathname);
      }
      if (navigate && window.location.pathname === '/') router.push('/predictions');
    },
    [router],
  );

  useEffect(() => {
    let seen = false;
    try {
      seen = window.localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      seen = false;
    }
    const fromLink = new URLSearchParams(window.location.search).get('intro') === '1';
    setMounted(true);
    if (forceOpen || fromLink || !seen) setOpen(true);
  }, [forceOpen]);

  // Ссылка «Показать обучение» меняет только query: layout не перемонтируется,
  // поэтому реагируем на параметр отдельно.
  useEffect(() => {
    if (searchParams.get('intro') !== '1') return;
    setMounted(true);
    setStep(0);
    setOpen(true);
  }, [searchParams]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finish, open]);

  useEffect(() => {
    if (open) nextRef.current?.focus();
  }, [open, step]);

  if (!mounted || !open) return null;

  const current = STEPS[step];
  if (!current) return null;
  const isLast = step === STEPS.length - 1;

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Как играть">
      <div className="modal__card onboarding">
        <p className="modal__eyebrow">
          Как играть · шаг {step + 1} из {STEPS.length}
        </p>
        <h2 className="modal__title">{current.title}</h2>
        <p className="modal__text">{current.text}</p>

        <div className="onboarding__dots" aria-hidden="true">
          {STEPS.map((item, index) => (
            <span key={item.title} className="onboarding__dot" data-active={index === step} />
          ))}
        </div>

        <div className="modal__actions onboarding__actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => (step === 0 ? finish(false) : setStep((value) => value - 1))}
          >
            {step === 0 ? 'Пропустить' : 'Назад'}
          </button>
          <button
            ref={nextRef}
            type="button"
            className="btn btn--primary"
            onClick={() => (isLast ? finish(true) : setStep((value) => value + 1))}
          >
            {isLast ? 'Поехали' : 'Дальше'}
          </button>
        </div>
      </div>
    </div>
  );
}
