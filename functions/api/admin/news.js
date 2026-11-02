import {
  json, isAuthenticated, sameOrigin, ghReadFile, ghCommit,
  validateNewsPayload, slugify,
} from './_shared.js';

const INDEX_PATH = 'public/api/news/index.json';
const CONTENT_DIR = 'public/api/news/content/';

async function readIndex(env) {
  const text = await ghReadFile(env, INDEX_PATH);
  const items = JSON.parse(text);
  if (!Array.isArray(items)) throw new Error('index.json is not an array');
  return items;
}

const sortDesc = (items) => items.slice().sort((a, b) => Number(b.Date) - Number(a.Date));
const toIndexJson = (items) => JSON.stringify(sortDesc(items), null, 2) + '\n';
const safeId = (id) => /^[A-Za-z0-9._-]{1,120}$/.test(id || '');

// GET /api/admin/news -> item stubs (session required)
export async function onRequestGet(context) {
  if (!(await isAuthenticated(context))) return json({ error: 'unauthorized' }, 401);
  try {
    return json({ items: sortDesc(await readIndex(context.env)) });
  } catch (e) {
    return json({ error: 'could not read index: ' + e.message }, 502);
  }
}

// POST /api/admin/news -> create { title, description, author, imageUrls, important, body }
export async function onRequestPost(context) {
  if (!(await isAuthenticated(context))) return json({ error: 'unauthorized' }, 401);
  if (!sameOrigin(context)) return json({ error: 'bad origin' }, 403);

  let payload;
  try { payload = validateNewsPayload(await context.request.json()); }
  catch (e) { return json({ error: e.message }, e.status || 400); }

  let items;
  try { items = await readIndex(context.env); }
  catch (e) { return json({ error: 'could not read index: ' + e.message }, 502); }

  const epoch = Math.floor(Date.now() / 1000);
  let base = `${slugify(payload.title)}.md`;
  let id = base;
  for (let i = 2; items.some((it) => it.id === id); i++) id = base.replace(/\.md$/, `-${i}.md`);

  const item = {
    id,
    Title: payload.title,
    Description: payload.description,
    ImageURL: payload.imageUrls,
    Important: payload.important,
    Author: payload.author,
    Date: String(epoch),
  };
  const sha = await ghCommit(
    context.env,
    [
      { path: `${CONTENT_DIR}${id}`, content: payload.body },
      { path: INDEX_PATH, content: toIndexJson([...items, item]) },
    ],
    `news: publish "${payload.title}"`
  );
  return json({ ok: true, id, commit: sha }, 201);
}

// PUT /api/admin/news?id=<id> -> update (keeps original Date)
export async function onRequestPut(context) {
  if (!(await isAuthenticated(context))) return json({ error: 'unauthorized' }, 401);
  if (!sameOrigin(context)) return json({ error: 'bad origin' }, 403);

  const id = new URL(context.request.url).searchParams.get('id') || '';
  if (!safeId(id)) return json({ error: 'bad id' }, 400);

  let payload;
  try { payload = validateNewsPayload(await context.request.json()); }
  catch (e) { return json({ error: e.message }, e.status || 400); }

  let items;
  try { items = await readIndex(context.env); }
  catch (e) { return json({ error: 'could not read index: ' + e.message }, 502); }

  const idx = items.findIndex((it) => it.id === id);
  if (idx === -1) return json({ error: 'not found' }, 404);

  items[idx] = {
    ...items[idx],
    Title: payload.title,
    Description: payload.description,
    ImageURL: payload.imageUrls,
    Important: payload.important,
    Author: payload.author,
  };
  const sha = await ghCommit(
    context.env,
    [
      { path: `${CONTENT_DIR}${id}`, content: payload.body },
      { path: INDEX_PATH, content: toIndexJson(items) },
    ],
    `news: update "${payload.title}"`
  );
  return json({ ok: true, id, commit: sha });
}

// DELETE /api/admin/news?id=<id>
export async function onRequestDelete(context) {
  if (!(await isAuthenticated(context))) return json({ error: 'unauthorized' }, 401);
  if (!sameOrigin(context)) return json({ error: 'bad origin' }, 403);

  const id = new URL(context.request.url).searchParams.get('id') || '';
  if (!safeId(id)) return json({ error: 'bad id' }, 400);

  let items;
  try { items = await readIndex(context.env); }
  catch (e) { return json({ error: 'could not read index: ' + e.message }, 502); }

  if (!items.some((it) => it.id === id)) return json({ error: 'not found' }, 404);
  const remaining = items.filter((it) => it.id !== id);

  const sha = await ghCommit(
    context.env,
    [
      { path: `${CONTENT_DIR}${id}`, content: null },
      { path: INDEX_PATH, content: toIndexJson(remaining) },
    ],
    `news: delete ${id}`
  );
  return json({ ok: true, id, commit: sha });
}

export const onRequest = () => json({ error: 'method not allowed' }, 405);
