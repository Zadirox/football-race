import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/auth/middleware';

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // `/api/cron` не проходит через обновление сессии: у планировщика нет
  // cookie Supabase, а лишний вызов Auth на каждый прогон не нужен.
  matcher: [
    '/((?!api/cron|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
