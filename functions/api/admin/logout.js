import { json, clearSessionCookie, sameOrigin } from './_shared.js';

// POST /api/admin/logout — mutating request: Origin must match the site origin.
export async function onRequestPost(context) {
  if (!sameOrigin(context)) return json({ error: 'bad origin' }, 403);
  return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });
}

export const onRequest = () => json({ error: 'method not allowed' }, 405);
