import type { Metadata } from 'next';
import Link from 'next/link';
import { Panel, Notice } from '@/components/ui/Panel';
import { getInviteByToken } from '@/lib/repo/invites';
import { AcceptInviteForm } from './AcceptInviteForm';

export const metadata: Metadata = {
  title: 'Приглашение · Футбольная гонка',
};

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ token: string }> };

function InviteShell({ children }: { children: React.ReactNode }) {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        background: 'var(--night, #0b141c)',
      }}
    >
      <div style={{ width: '100%', maxWidth: 760 }}>{children}</div>
    </main>
  );
}

export default async function InvitePage({ params }: Props) {
  const { token } = await params;
  const invite = await getInviteByToken(token);

  if (!invite) {
    return (
      <InviteShell>
        <Panel title="Приглашение" subtitle="Ссылка недействительна" size="narrow">
          <Notice tone="danger">Эта ссылка недействительна. Попросите новую у админа сезона.</Notice>
          <div style={{ marginTop: 16 }}>
            <Link href="/login" className="btn btn--primary">
              Ко входу
            </Link>
          </div>
        </Panel>
      </InviteShell>
    );
  }

  if (invite.used) {
    return (
      <InviteShell>
        <Panel title="Приглашение" subtitle="Ссылка уже использована" size="narrow">
          <Notice tone="info">
            Приглашение для <strong>{invite.nickname}</strong> уже активировано. Войдите по нику и паролю.
          </Notice>
          <div style={{ marginTop: 16 }}>
            <Link href="/login" className="btn btn--primary">
              Войти
            </Link>
          </div>
        </Panel>
      </InviteShell>
    );
  }

  if (invite.expired) {
    return (
      <InviteShell>
        <Panel title="Приглашение" subtitle="Срок действия истёк" size="narrow">
          <Notice tone="danger">
            Срок действия приглашения для <strong>{invite.nickname}</strong> истёк. Попросите новую ссылку у админа.
          </Notice>
        </Panel>
      </InviteShell>
    );
  }

  return (
    <InviteShell>
      <Panel
        title="Приглашение в сезон"
        subtitle={`Сезон: ${invite.seasonTitle}`}
        size="narrow"
      >
        <Notice tone="info">
          Тебя пригласили под ником <strong>{invite.nickname}</strong>. Придумай пароль — это нужно сделать один раз. После
          активации ты будешь добавлен в сезон как игрок.
        </Notice>
        <div style={{ marginTop: 16 }}>
          <AcceptInviteForm token={token} nickname={invite.nickname} />
        </div>
      </Panel>
    </InviteShell>
  );
}
