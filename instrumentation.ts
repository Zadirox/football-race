export async function onRequestError(
  err: { digest: string; message: string } & Error,
  _request: { path: string; method: string; headers: { [key: string]: string } },
  _context: { routerKind: string; routePath: string; routeType: string; renderSource: string },
) {
  // Stale client tabs after deploy send old Server Action ids; Next.js logs this as
  // a noisy warning/error in Vercel. Ignore only this exact benign case.
  if (err?.message?.includes('Failed to find Server Action')) return;
  console.error('[onRequestError]', err);
}