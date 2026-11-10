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
    hint: 'Один запрос к провайдеру: матчи окна −1…+4 игровых дня и счёт',
    run: runSyncAction,
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
    hint: 'Применяет безопасные ветки к ожиданиям старше 24 часов (D7)',
    run: runExpireAction,
  },
];

/**
 * Кнопки ручного прогона. Действия — server actions, поэтому браузер
 * не видит ни `CRON_SECRET`, ни доступа к провайдеру.
 */
export function AdminActions({ enabled }: { enabled: boolean }) {
  const [pending, startTransition] = useTransition();
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState<AdminRunResult | null>(null);

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

  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: result ? 12 : 24 }}>
        {TASKS.map((task) => (
          <button
            key={task.id}
            type="button"
            className="btn"
            disabled={!enabled || pending}
            title={enabled ? task.hint : 'Включится после подключения БД'}
            onClick={() => run(task)}
          >
            {running === task.id ? 'Выполняем…' : task.label}
          </button>
        ))}
      </div>

      {result && (
        <div style={{ marginBottom: 24 }}>
          <Notice tone="info">{result.message}</Notice>
        </div>
      )}
    </>
  );
}
