import type { Sql } from 'postgres';
import { makePlayer, moveBy } from '@/lib/game/engine';
import { lockPlayer, logActivity, persistState } from '@/lib/repo/game-tx';

type CoachEventRow = {
  id: string;
  profile_id: string;
  outcome: unknown;
};

function toObj(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export async function evaluateCoachContractsForMatchday(
  matchdayId: string,
  sql: Sql,
  seasonId?: string,
): Promise<void> {
  await sql.begin(async (tx) => {
    let sid = seasonId;
    if (!sid) {
      const [md] = await tx<Array<{ season_id: string }>>`select season_id from matchdays where id = ${matchdayId} limit 1`;
      sid = md?.season_id;
    }
    if (!sid) return;

    const rows = await tx<CoachEventRow[]>`
      select id, profile_id, outcome
        from cell_events
       where season_id = ${sid}
         and mechanic_code = '17'
         and state = 'resolved'
         and coalesce(outcome->>'signed', 'false') = 'true'
         and coalesce(outcome->>'evaluation', '') = 'pending'
         and coalesce(outcome->>'targetMatchdayId', '') = ${matchdayId}
       for update
    `;

    if (rows.length === 0) return;

    const [qStats] = await tx<Array<{ total: string | number }>>`
      select count(*)::int as total
        from questions q
       where q.matchday_id = ${matchdayId}
         and q.is_bonus = false
         and q.status = 'resolved'
    `;
    const ordinaryTotal = Number(qStats?.total ?? 0);

    for (const row of rows) {
      const outcome = toObj(row.outcome);
      if (outcome.evaluation !== 'pending' || outcome.signed !== true) continue;

      if (ordinaryTotal < 6) {
        await tx`
          update cell_events
             set outcome = coalesce(outcome, '{}'::jsonb) || ${tx.json({ evaluation: 'annulled', reason: 'too_few_questions', ordinaryTotal } as any)}::jsonb
           where id = ${row.id}
        `;
        await logActivity(tx, sid, row.profile_id, 'neutral', 'Контракт тренера: аннулирован без последствий (слишком мало обычных вопросов).');
        continue;
      }

      const [stats] = await tx<Array<{ answered: string | number; correct: string | number }>>`
        select
          count(*) filter (where a.question_id is not null)::int as answered,
          count(*) filter (where a.is_correct is true)::int as correct
        from questions q
        left join answers a on a.question_id = q.id and a.profile_id = ${row.profile_id}
       where q.matchday_id = ${matchdayId}
         and q.is_bonus = false
         and q.status = 'resolved'
      `;
      const answered = Number(stats?.answered ?? 0);
      const correct = Number(stats?.correct ?? 0);
      const answeredRatio = ordinaryTotal > 0 ? answered / ordinaryTotal : 0;
      const correctRatio = answered > 0 ? correct / answered : 0;
      const fulfilled = answeredRatio >= 0.8 && correctRatio >= 2 / 3;
      const delta = fulfilled ? 4 : -2;

      const ctx = await lockPlayer(tx, sid, row.profile_id);
      const next = moveBy(makePlayer(ctx.position, ctx.effects), delta);
      await persistState(tx, ctx, next);
      await tx`
        update cell_events
           set outcome = coalesce(outcome, '{}'::jsonb) || ${tx.json({ evaluation: fulfilled ? 'fulfilled' : 'failed', delta, answered, correct, ordinaryTotal } as any)}::jsonb
         where id = ${row.id}
      `;
      await logActivity(tx, sid, row.profile_id, fulfilled ? 'positive' : 'negative', `Контракт тренера: ${fulfilled ? 'выполнен' : 'не выполнен'} (${correct}/${answered} верных, ${answered}/${ordinaryTotal} отвечено). ${delta > 0 ? '+' : ''}${delta} клетки.`);
    }
  });
}
