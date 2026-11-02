import {
  json, checkPassword, issueSessionCookie,
  rateLimit, recordFailedAttempt, clearAttempts, sameOrigin,
} from './_shared.js';

// POST /api/admin/login { password }
export async function onRequestPost(context) {
  if (!sameOrigin(context)) return json({ error: 'bad origin' }, 403);

  const rl = await rateLimit(context);
  if (rl.limited) {
    return json({ error: 'too many attempts' }, 429, { 'Retry-After': String(rl.retryAfter) });
  }

  let body;
  try { body = await context.request.json(); } catch { return json({ error: 'invalid json' }, 400); }
  if (typeof body.password !== 'string' || body.password.length === 0 || body.password.length > 256) {
    return json({ error: 'password required' }, 400);
  }

  const ok = await checkPassword(context.env, body.password);
  if (!ok) {
    await recordFailedAttempt(context, rl);
    return json({ error: 'invalid credentials' }, 401);
  }

  await clearAttempts(context, rl);
  return json({ ok: true }, 200, { 'Set-Cookie': await issueSessionCookie(context.env) });
}

export const onRequest = () => json({ error: 'method not allowed' }, 405);
