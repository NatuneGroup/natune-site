import { json, isAuthenticated, ghReadFile } from './_shared.js';

// GET /api/admin/content?id=<id> -> raw markdown body (session required)
export async function onRequestGet(context) {
  if (!(await isAuthenticated(context))) return json({ error: 'unauthorized' }, 401);
  const id = new URL(context.request.url).searchParams.get('id') || '';
  if (!/^[A-Za-z0-9._-]{1,120}$/.test(id)) return json({ error: 'bad id' }, 400);
  try {
    const body = await ghReadFile(context.env, `public/api/news/content/${id}`);
    return json({ id, body });
  } catch (e) {
    return json({ error: 'not found: ' + e.message }, 404);
  }
}

export const onRequest = () => json({ error: 'method not allowed' }, 405);
