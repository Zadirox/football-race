import Link from 'next/link';
import { Panel, Notice, SectionTitle } from '@/components/ui/Panel';
import { serverEnv } from '@/lib/env';
import { listInvites } from '@/lib/repo/invites';
import { listPendingForAdmin } from '@/lib/repo/admin-tools';
import { loadSeasonSnapshot } from '@/lib/repo/season';
import { AdminActions } from './AdminActions';
import { AdminTools } from './AdminTools';
import { InvitesAdmin } from './InvitesAdmin';

function timeMsk(iso: string | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Moscow',
  });
}

export default async function AdminPage() {
  const snapshot = await loadSeasonSnapshot();
  const [pending, invites] = await Promise.all([listPendingForAdmin(), listInvites()]);
  const env = serverEnv();
  const checks: Array<[string, boolean, string]> = [
    ['DATABASE_URL', env.databaseUrl !== null, 'подключение к Postgres'],
    ['SUPABASE_URL', env.supabaseUrl !== null, 'адрес проекта'],
    ['SUPABASE_ANON_KEY', env.supabaseAnonKey !== null, 'клиентский ключ'],
    ['SUPABASE_SERVICE_ROLE_KEY', env.supabaseServiceKey !== null, 'серверный ключ для cron'],
    ['FOOTBALL_DATA_TOKEN', env.footballDataToken !== null, 'синк матчей (основной источник)'],
    ['SSTATS_API_KEY', env.sstatsApiKey !== null, 'доп. источник матчей (необязательно)'],
    ['RAPIDAPI_KEY', env.rapidApiKey !== null, 'логотипы и обложки'],
    ['CRON_SECRET', env.cronSecret !== null, 'cron: синк, закрытие дня, ожидания'],
  ];

  return (
    <Panel
      title="Админка"
      subtitle="Сборка дня, синк расписания, правки и пересчёт. Раздел виден только админу сезона."
      size="wide"
      actions={
        <Link href="/" className="btn btn--sm">
          На карту
        </Link>
      }
    >
      <div style={{ marginBottom: 20 }}>
        {snapshot.demo ? (
          <Notice>
            Сейчас работает демо-режим: база не подключена, поэтому кнопки управления днём отключены. Играть можно — карта,
            кубики, события и предикты считаются тем же движком.
          </Notice>
        ) : (
          <Notice tone="info">
            База подключена. Ручные прогоны идут от твоей роли <strong>admin</strong> и не требуют{' '}
            <code>CRON_SECRET</code> в браузере. Те же действия cron вызывает по расписанию.
          </Notice>
        )}
      </div>

      <SectionTitle>Сезон</SectionTitle>
      <div className="grid grid--two" style={{ marginBottom: 22 }}>
        <div className="card">
          <h3 className="card__title">{snapshot.season.title}</h3>
          <p className="card__meta">
            {snapshot.season.startsOn} — {snapshot.season.endsOn} · статус: {snapshot.season.status}
          </p>
          <p className="card__text">
            Слаг: <code>{snapshot.season.slug}</code>. Участников: {snapshot.players.length}.
          </p>
        </div>
        <div className="card">
          <h3 className="card__title">Игровой день</h3>
          <p className="card__meta">
            {snapshot.matchday?.gameDate ?? '—'} · {snapshot.matchday?.status ?? 'не собран'}
          </p>
          <p className="card__text">
            Открыт: {timeMsk(snapshot.matchday?.opensAt)} МСК
            <br />
            Закрыт: {timeMsk(snapshot.matchday?.closesAt)} МСК
            <br />
            Матчей: {snapshot.matches.length} · вопросов: {snapshot.matchday?.qTotal ?? 0}
          </p>
        </div>
      </div>

      <SectionTitle>Действия</SectionTitle>
      <AdminActions enabled={!snapshot.demo} />

      <InvitesAdmin enabled={!snapshot.demo} invites={invites} />

      <AdminTools
        enabled={!snapshot.demo}
        players={snapshot.players}
        matches={snapshot.matches.slice(0, 20)}
        pending={pending}
      />

      <SectionTitle>Окружение</SectionTitle>
      <div className="list" style={{ marginBottom: 24 }}>
        {checks.map(([name, ready, hint]) => (
          <div key={name} className="list-row">
            <span className={ready ? 'chip chip--positive' : 'chip chip--muted'}>{ready ? '✓' : '—'}</span>
            <span className="list-row__main">
              <span className="list-row__title">{name}</span>
              <span className="list-row__meta">{hint}</span>
            </span>
            <span className="card__meta">{ready ? 'задан' : 'не задан'}</span>
          </div>
        ))}
      </div>

      <SectionTitle>Участники</SectionTitle>
      <table className="table table--cards">
        <thead>
          <tr>
            <th>Имя</th>
            <th>Роль</th>
            <th>Клетка</th>
            <th>Очки</th>
            <th>Ответов</th>
          </tr>
        </thead>
        <tbody>
          {snapshot.players.map((player) => (
            <tr key={player.profileId} data-me={player.isMe}>
              <td data-label="Имя">{player.nickname}</td>
              <td className="card__meta" data-label="Роль">
                {player.role}
              </td>
              <td data-label="Клетка">{player.position}</td>
              <td data-label="Очки">{player.points}</td>
              <td data-label="Ответов">
                {player.answered} · верно {player.correct}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="card__meta" style={{ marginTop: 18 }}>
        Порядок подключения базы описан в README: применить миграции, заполнить окружение, засидить сезон. После этого
        эта страница включит действия без изменения кода.
      </p>
    </Panel>
  );
}
