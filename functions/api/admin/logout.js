import { json, clearSessionCookie } from './_shared.js';

// POST /api/admin/logout
export async function onRequestPost() {
  return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });
}

export const onRequest = () => json({ error: 'method not allowed' }, 405);
