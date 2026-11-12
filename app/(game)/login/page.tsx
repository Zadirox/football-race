import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Panel, Notice } from '@/components/ui/Panel';
import { getViewer } from '@/lib/auth/session';
import { serverEnv } from '@/lib/env';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = {
  title: 'Вход · Футбольная гонка',
};

export const dynamic = 'force-dynamic';

/**
 * Вход в сезон. Пароли хранит Supabase Auth, сайт их не видит.
 * Друзья входят по нику (служебный email под капотом), админ может по почте.
 */
export default async function LoginPage() {
  const env = serverEnv();
  const configured = Boolean(env.supabaseUrl && env.supabaseAnonKey);
  const viewer = configured ? await getViewer() : null;

  if (viewer) redirect('/');

  return (
    <Panel
      title="Вход"
      subtitle="Вход по нику и паролю (по приглашению). Админ может войти по почте. Зрители видят карту, но не бросают кубики."
      size="narrow"
    >
      <LoginForm configured={configured} />

      <div style={{ marginTop: 18 }}>
        <Notice>
          Роли: <strong>admin</strong> играет и управляет днём, <strong>player</strong> играет,{' '}
          <strong>spectator</strong> только смотрит. Роль меняется в админке.
        </Notice>
      </div>
    </Panel>
  );
}
