'use client';

import { useState, useTransition } from 'react';
import { Notice } from '@/components/ui/Panel';
import {
  runAdvanceAction,
  runExpireAction,
  runSyncAction,
  type AdminRunResult,
} from '@/lib/actions/admin';

type AdminTask = {
  id: string;
  label: string;
  hint: string;
  run: () => Promise<AdminRunResult>;
};

const TASKS: readonly AdminTask[] = [
  {
    id: 'sync',
    label: 'Синхронизировать расписание',
    hint: 'Матчи обычного окна (несколько дней вокруг сегодня) и текущий счёт',
    run: () => runSyncAction(),
  },
  {
    id: 'advance',
    label: 'Закрыть готовые дни',
    hint: 'Переводит статусы дней и резолвит те, где все матчи финальные',
    run: runAdvanceAction,
  },
  {
    id: 'expire',
    label: 'Закрыть брошенные выборы',
    hint: 'Применяет безопасные ветки к ожиданиям старше 24 часов',
    run: runExpireAction,
  },
];

/**
 * Кнопки ручного прогона. Действия — server actions, поэтому браузер
 * не видит секреты и доступ к источникам матчей.
 */
export function AdminActions({ enabled }: { enabled: boolean }) {
  const [pending, startTransition] = useTransition();
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState<AdminRunResult | null>(null);
  const [from, setFrom] = useState('2026-11-12');
  const [to, setTo] = useState('2026-11-17');

  const run = (task: AdminTask) => {
    if (!enabled || pending) return;
    setRunning(task.id);
    setResult(null);
    startTransition(async () => {
      const value = await task.run();
      setResult(value);
      setRunning(null);
    });
  };

  const runPeriod = () => {
    if (!enabled || pending) return;
    setRunning('sync-period');
    setResult(null);
    startTransition(async () => {
      const value = await runSyncAction({ from, to });
      setResult(value);
      setRunning(null);
    });
  };

  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {TASKS.map((task) => (
          <button
            key={task.id}
            type="button"
            className="btn"
            disabled={!enabled || pending}
            title={enabled ? task.hint : 'Включится после подключения базы'}
            onClick={() => run(task)}
          >
            {running === task.id ? 'Выполняем…' : task.label}
          </button>
        ))}
      </div>

      <div className="card" style={{ marginBottom: result ? 12 : 24 }}>
        <h3 className="card__title">Подтянуть матчи за выбранные даты</h3>
        <p className="card__meta" style={{ marginBottom: 8 }}>
          Разовый запуск на нужный период (например, чтобы сразу добавить матчи 13–17 ноября). Даты по игровому дню.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <label className="card__meta">
            С{' '}
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              disabled={!enabled || pending}
            />
          </label>
          <label className="card__meta">
            По{' '}
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              disabled={!enabled || pending}
            />
          </label>
          <button
            type="button"
            className="btn"
            disabled={!enabled || pending}
            onClick={runPeriod}
            title={enabled ? 'Подтянуть матчи за указанный период' : 'Включится после подключения базы'}
          >
            {running === 'sync-period' ? 'Выполняем…' : 'Подтянуть за период'}
          </button>
        </div>
      </div>

      {result && (
        <div style={{ marginBottom: 24 }}>
          <Notice tone="info">{result.message}</Notice>
        </div>
      )}
    </>
  );
}
