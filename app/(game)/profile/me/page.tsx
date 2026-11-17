import { redirect } from 'next/navigation';
import { getViewer } from '@/lib/auth/session';

export default async function MeProfilePage() {
  const viewer = await getViewer();
  if (!viewer?.profileId) {
    redirect('/login');
  }
  redirect(`/profile/${viewer.profileId}`);
}
