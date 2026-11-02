// Shared helpers for /api/admin/* Pages Functions.
// Auth model: salted password hash (HMAC-SHA256, ADMIN_SESSION_SECRET as pepper)
// -> signed HttpOnly session cookie. Login attempts are rate-limited via KV.

const enc = new TextEncoder();
const dec = new TextDecoder();

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });

const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (h) => new Uint8Array(h.match(/.{2}/g).map((b) => parseInt(b, 16)));

async function hmacHex(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toHex(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}

const timingSafeEq = (a, b) => {
  const x = enc.encode(a), y = enc.encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
};

// ---- password ----
// Stored format in ADMIN_PASSWORD_HASH: "hmac1$<salt_hex>$<hmac_hex>"
// where hmac = HMAC-SHA256(key=ADMIN_SESSION_SECRET, msg=salt + ':' + password)
export async function checkPassword(env, password) {
  const stored = env.ADMIN_PASSWORD_HASH || '';
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'hmac1' || !env.ADMIN_SESSION_SECRET) return false;
  const [, salt, expected] = parts;
  const actual = await hmacHex(env.ADMIN_SESSION_SECRET, `${salt}:${password}`);
  return timingSafeEq(actual, expected);
}

// ---- session cookie ----
const COOKIE = 'natune_admin';
const SESSION_TTL_S = 12 * 3600;

export async function issueSessionCookie(env) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_S;
  const sig = await hmacHex(env.ADMIN_SESSION_SECRET, `sess.${exp}`);
  return `${COOKIE}=${exp}.${sig}; HttpOnly; Secure; SameSite=Strict; Path=/api/admin; Max-Age=${SESSION_TTL_S}`;
}

export const clearSessionCookie = () =>
  `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/api/admin; Max-Age=0`;

export async function isAuthenticated(context) {
  const secret = context.env.ADMIN_SESSION_SECRET;
  if (!secret) return false;
  const cookie = context.request.headers.get('Cookie') || '';
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return false;
  const [expStr, sig] = m[1].split('.');
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now() / 1000 || !sig) return false;
  const expected = await hmacHex(secret, `sess.${expStr}`);
  return timingSafeEq(expected, sig);
}

// ---- login rate limit (KV) ----
const WINDOW_S = 600;
const MAX_ATTEMPTS = 8;

export async function rateLimit(context) {
  const kv = context.env.ADMIN_KV;
  if (!kv) return { limited: false }; // fail-open only if binding missing
  const ip = context.request.headers.get('CF-Connecting-IP') || 'unknown';
  const key = `login:${ip}`;
  const now = Math.floor(Date.now() / 1000);
  let rec = null;
  try { rec = await kv.get(key, { type: 'json' }); } catch { /* treat as no record */ }
  if (rec && rec.reset > now && rec.n >= MAX_ATTEMPTS) {
    return { limited: true, retryAfter: rec.reset - now };
  }
  return { limited: false, key, now };
}

export async function recordFailedAttempt(context, rl) {
  const kv = context.env.ADMIN_KV;
  if (!kv || !rl.key) return;
  let rec = null;
  try { rec = await kv.get(rl.key, { type: 'json' }); } catch { /* none */ }
  const rec2 = rec && rec.reset > rl.now ? { n: rec.n + 1, reset: rec.reset } : { n: 1, reset: rl.now + WINDOW_S };
  await kv.put(rl.key, JSON.stringify(rec2), { expirationTtl: WINDOW_S + 60 });
}

export async function clearAttempts(context, rl) {
  const kv = context.env.ADMIN_KV;
  if (kv && rl.key) await kv.delete(rl.key);
}

// ---- origin check for mutations (CSRF hardening on top of SameSite cookie) ----
export function sameOrigin(context) {
  const origin = context.request.headers.get('Origin');
  if (!origin) return true; // non-browser clients have no Origin; cookie is still required
  try { return new URL(origin).host === new URL(context.request.url).host; } catch { return false; }
}

// ---- GitHub publish (single commit via Git Data API) ----
const REPO = 'NatuneGroup/natune-site';
const BRANCH = 'main';

const ghHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'natune-site-admin',
  'X-GitHub-Api-Version': '2022-11-28',
});

async function gh(env, path, opts = {}) {
  const r = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...opts,
    headers: ghHeaders(env.GITHUB_NEWS_TOKEN),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`GitHub ${opts.method || 'GET'} ${path} -> ${r.status} ${body.slice(0, 200)}`);
  }
  return r.json();
}

export async function ghReadFile(env, repoPath) {
  const d = await gh(env, `/contents/${repoPath}?ref=${BRANCH}`);
  if (d.type !== 'file') throw new Error(`not a file: ${repoPath}`);
  return dec.decode(Uint8Array.from(atob(d.content.replace(/\n/g, '')), (c) => c.charCodeAt(0)));
}

// files: [{ path, content }] create/update; [{ path, content: null }] delete.
// Returns the new commit SHA. Retries once on ref-update races.
export async function ghCommit(env, files, message) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const ref = await gh(env, `/git/ref/heads/${BRANCH}`);
    const baseSha = ref.object.sha;
    const base = await gh(env, `/git/commits/${baseSha}`);
    const tree = [];
    for (const f of files) {
      if (f.content === null) {
        tree.push({ path: f.path, mode: '100644', type: 'blob', sha: null });
        continue;
      }
      const blob = await gh(env, '/git/blobs', {
        method: 'POST',
        body: JSON.stringify({ content: f.content, encoding: 'utf-8' }),
      });
      tree.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
    }
    const newTree = await gh(env, '/git/trees', {
      method: 'POST',
      body: JSON.stringify({ base_tree: base.tree.sha, tree }),
    });
    const newCommit = await gh(env, '/git/commits', {
      method: 'POST',
      body: JSON.stringify({ message, tree: newTree.sha, parents: [baseSha] }),
    });
    try {
      await gh(env, `/git/refs/heads/${BRANCH}`, {
        method: 'PATCH',
        body: JSON.stringify({ sha: newCommit.sha }),
      });
      return newCommit.sha;
    } catch (e) {
      if (attempt === 1) throw e; // someone else pushed; retry once then give up
    }
  }
}

// ---- news payload validation (mirrors scripts/validate-news.mjs) ----
export function validateNewsPayload(p) {
  const err = (m) => { const e = new Error(m); e.status = 400; return e; };
  if (typeof p !== 'object' || p === null) throw err('body must be an object');
  if (typeof p.title !== 'string' || !p.title.trim() || p.title.length > 200) throw err('title required (<=200 chars)');
  if (p.description !== undefined && (typeof p.description !== 'string' || p.description.length > 300)) throw err('description must be a string <=300 chars');
  if (typeof p.author !== 'string' || !p.author.trim() || p.author.length > 80) throw err('author required (<=80 chars)');
  if (typeof p.body !== 'string' || !p.body.trim()) throw err('body (markdown) required');
  if (p.important !== undefined && typeof p.important !== 'boolean') throw err('important must be boolean');
  if (p.imageUrls !== undefined) {
    if (!Array.isArray(p.imageUrls)) throw err('imageUrls must be an array');
    for (const u of p.imageUrls) if (typeof u !== 'string' || !/^https?:\/\//.test(u)) throw err('imageUrls entries must be absolute http(s) URLs');
  }
  return {
    title: p.title.trim(),
    description: (p.description || '').trim(),
    author: p.author.trim(),
    body: p.body,
    important: !!p.important,
    imageUrls: p.imageUrls || [],
  };
}

export const slugify = (title) =>
  title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'post';
