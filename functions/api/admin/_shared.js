// Shared helpers for /api/admin/* Pages Functions.
// Auth model: salted password hash (HMAC-SHA256, ADMIN_SESSION_SECRET as pepper)
// -> signed HttpOnly session cookie. Login attempts are rate-limited via a D1
// database using a single atomic upsert per attempt (see rateLimit below).

const enc = new TextEncoder();
const dec = new TextDecoder();

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers },
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

// ---- login rate limit (D1, atomic) ----
// Every login request atomically RESERVES one attempt in each bucket via a
// single upsert BEFORE the password is verified. The old KV flow did a
// check-then-increment that concurrent requests could race (parallel
// attempts all passed the check before any of them wrote); here the counter
// increment and the limit check are one SQLite statement, so the
// (limit+1)th request is always rejected. D1 serializes writes per database.
//
// Buckets (all three reserved on every attempt):
//   login:ip:<addr>    exact client IP                     -> LIMIT_IP
//   login:net:<prefix> IPv6 /64 prefix (full IP for IPv4)  -> LIMIT_PREFIX
//   login:acct:admin   account-wide backstop               -> LIMIT_ACCOUNT
// If ADMIN_DB is missing or errors, login fails closed (503).
const WINDOW_S = 600;
const LIMIT_IP = 8;       // per exact client IP per 10 min
const LIMIT_PREFIX = 24;  // per IPv6 /64 (full IP for IPv4) per 10 min
const LIMIT_ACCOUNT = 40; // global, per 10 min

// Bucket prefix for an address: /64 for IPv6, the full address otherwise.
function ipPrefixKey(ip) {
  const v4mapped = ip.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (v4mapped) return v4mapped[1];
  if (!ip.includes(':')) return ip; // IPv4 or unparseable -> full IP is the bucket
  const dbl = ip.indexOf('::');
  let groups;
  if (dbl === -1) {
    groups = ip.split(':');
  } else {
    const head = ip.slice(0, dbl).split(':').filter(Boolean);
    const tail = ip.slice(dbl + 2).split(':').filter(Boolean);
    groups = [...head, ...Array(Math.max(8 - head.length - tail.length, 0)).fill('0'), ...tail];
  }
  return groups.slice(0, 4).map((g) => g || '0').join(':') + '::/64';
}

// Reserves one attempt per bucket in a single statement and returns the
// resulting counters. An expired window (reset_at <= now) starts a fresh one.
const RESERVE_SQL = `
  INSERT INTO login_attempts (key, n, reset_at)
  VALUES (?, 1, ?), (?, 1, ?), (?, 1, ?)
  ON CONFLICT (key) DO UPDATE SET
    n        = CASE WHEN reset_at > ? THEN n + 1 ELSE 1 END,
    reset_at = CASE WHEN reset_at > ? THEN reset_at ELSE excluded.reset_at END
  RETURNING key, n, reset_at`;

export async function rateLimit(context) {
  const db = context.env.ADMIN_DB;
  if (!db) return { limited: true, unavailable: true }; // fail closed

  const ip = (context.request.headers.get('CF-Connecting-IP') || 'unknown').toLowerCase();
  const now = Math.floor(Date.now() / 1000);
  const reset = now + WINDOW_S;
  const buckets = [
    { key: `login:ip:${ip}`, limit: LIMIT_IP },
    { key: `login:net:${ipPrefixKey(ip)}`, limit: LIMIT_PREFIX },
    { key: 'login:acct:admin', limit: LIMIT_ACCOUNT },
  ];

  let rows;
  try {
    const res = await db
      .prepare(RESERVE_SQL)
      .bind(buckets[0].key, reset, buckets[1].key, reset, buckets[2].key, reset, now, now)
      .all();
    rows = res.results;
  } catch (e) {
    console.error('login rate-limit store error:', e);
    return { limited: true, unavailable: true }; // fail closed
  }
  if (!Array.isArray(rows) || rows.length < buckets.length) {
    return { limited: true, unavailable: true }; // unexpected result: fail closed
  }

  const byKey = new Map(rows.map((r) => [r.key, r]));
  let retryAfter = 0;
  for (const b of buckets) {
    const row = byKey.get(b.key);
    if (row && Number(row.n) > b.limit) {
      retryAfter = Math.max(retryAfter, Number(row.reset_at) - now);
    }
  }
  return {
    limited: retryAfter > 0,
    retryAfter: Math.max(retryAfter, 1),
    keys: buckets.map((b) => b.key),
  };
}

// Successful login: drop the reserved counters for these buckets.
export async function clearAttempts(context, rl) {
  const db = context.env.ADMIN_DB;
  if (!db || !rl.keys || !rl.keys.length) return;
  try {
    await db
      .prepare(`DELETE FROM login_attempts WHERE key IN (${rl.keys.map(() => '?').join(',')})`)
      .bind(...rl.keys)
      .run();
  } catch { /* stale counters expire on their own window; nothing to do */ }
}

// ---- origin check for mutations (CSRF hardening on top of SameSite cookie) ----
// Mutating admin requests must carry an Origin header that exactly equals this
// site's origin (scheme + host). The admin UI always sends Origin on
// POST/PUT/DELETE, so a missing Origin is rejected too — this stops
// cross-site form posts and non-browser replay in one check.
export function sameOrigin(context) {
  const origin = context.request.headers.get('Origin');
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(context.request.url).origin; } catch { return false; }
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
