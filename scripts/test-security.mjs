// Local security validation — no deploy needed.
//   node scripts/test-security.mjs
//
// 1) Renderer path: runs the REAL news.js (plus the vendored marked + DOMPurify)
//    inside jsdom, feeds it malicious article bodies, and inspects the DOM that
//    lands in #na-body for injected elements/attributes.
// 2) Throttle: exercises functions/api/admin/_shared.js rateLimit/clearAttempts/
//    sameOrigin against an in-memory D1 mock implementing the same semantics as
//    RESERVE_SQL (single atomic upsert with RETURNING).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name, extra); }
};

/* ============================== 1. renderer ============================== */

const markedSrc = read('public/assets/vendor/marked.umd.js');
const purifySrc = read('public/assets/vendor/purify.min.js');
const newsSrc = read('public/assets/js/news.js');

// Render one article body through the exact page path:
// fetch index -> renderArticle -> fetch content -> #na-body.innerHTML = md(body)
async function renderArticleBody(markdown) {
  const dom = new JSDOM(`<!doctype html><html><body>
    <div id="news-list-view"><div id="news-list"></div></div>
    <article id="news-article-view" hidden>
      <h1 id="na-title"></h1><div id="na-meta"></div><div id="na-images"></div>
      <div id="na-body"></div>
    </article></body></html>`, {
    url: 'https://natune.pages.dev/news/?id=evil.md',
    runScripts: 'outside-only',
  });
  const { window } = dom;
  const item = { id: 'evil.md', Title: 't', Author: 'a', Date: '1', Important: false, ImageURL: [] };
  window.fetch = (url) => Promise.resolve({
    ok: true,
    json: () => Promise.resolve([item]),
    text: () => Promise.resolve(markdown),
  });
  window.eval(markedSrc);
  window.eval(purifySrc);
  window.eval(newsSrc);
  for (let i = 0; i < 60 && !window.document.getElementById('na-body').innerHTML; i++) {
    await new Promise((r) => setTimeout(r, 5));
  }
  return window;
}

const FORBIDDEN_TAGS = ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button',
  'textarea', 'select', 'style', 'link', 'meta', 'base', 'svg', 'math'];

function scanDom(window) {
  const body = window.document.getElementById('na-body');
  const problems = [];
  for (const el of body.querySelectorAll('*')) {
    const tag = el.tagName.toLowerCase();
    if (FORBIDDEN_TAGS.includes(tag)) problems.push(`forbidden <${tag}>`);
    for (const attr of el.attributes) {
      const name = attr.name.toLowerCase();
      const value = attr.value.replace(/[\s-]+/g, '').toLowerCase();
      if (name.startsWith('on')) problems.push(`handler ${name} on <${tag}>`);
      if ((name === 'href' || name === 'src' || name === 'xlink:href' || name === 'action' || name === 'formaction')
          && /^(javascript|vbscript|data|file):/.test(value)) {
        problems.push(`bad scheme ${name}="${attr.value}" on <${tag}>`);
      }
      if (name === 'style') problems.push(`style attr on <${tag}>`);
    }
  }
  return { html: body.innerHTML, problems };
}

console.log('== renderer path (marked + DOMPurify via news.js) ==');

const payloads = [
  ['P1 PoC', '![a](https://x/[b) c](https://y/onerror=globalThis.__xss=1//)'],
  ['raw <script>', 'hello\n\n<script>globalThis.__xss=1</script>\n\nbye'],
  ['raw <img onerror>', '<img src=x onerror="globalThis.__xss=1">'],
  ['javascript: link', '[click](javascript:globalThis.__xss=1)'],
  ['javascript: image', '![x](javascript:globalThis.__xss=1)'],
  ['data: link', '[click](data:text/html;base64,PHNjcmlwdD4=)'],
  ['vbscript: link', '[click](vbscript:msgbox)'],
  ['file: image', '![x](file:///etc/passwd)'],
  ['mixed-case scheme', '[click](JaVaScRiPt:globalThis.__xss=1)'],
  ['tab in scheme', '[click](java\tscript:globalThis.__xss=1)'],
  ['nested quotes attr', '<a href="x" onclick="globalThis.__xss=1">y</a>'],
  ['svg payload', '<svg onload="globalThis.__xss=1"><circle r="5"/></svg>'],
  ['formaction', '<form><button formaction="javascript:globalThis.__xss=1">x</button></form>'],
  ['link w/ title quote', '[x](https://ok.example "onmouseover="globalThis.__xss=1)'],
  ['details toggle', '<details open ontoggle="globalThis.__xss=1">x</details>'],
];

for (const [name, md] of payloads) {
  const window = await renderArticleBody(md);
  const { html, problems } = scanDom(window);
  ok(problems.length === 0, `payload blocked: ${name}`, problems.join('; ') + ' | html=' + html.slice(0, 160));
  ok(window.__xss !== 1 && window.globalThis.__xss !== 1, `no side effect: ${name}`);
}

// Benign content must still render
{
  const window = await renderArticleBody(
    '# Top\n\n## Whats new\n\n- **bold** item\n- [site](https://example.com/p)\n- [rel](/docs/page)\n\n![pic](https://cdn.example.com/a.png)\n\n`code` and ~~del~~'
  );
  const d = window.document;
  const a = d.querySelector('#na-body a[href="https://example.com/p"]');
  ok(!!d.querySelector('#na-body h2'), 'md h1 -> page h2');
  ok(!!d.querySelector('#na-body h3'), 'md h2 -> page h3');
  ok(!!a && /noopener/.test(a.getAttribute('rel') || '') && /noreferrer/.test(a.getAttribute('rel') || ''),
    'https link kept, rel="noopener noreferrer"', a && a.outerHTML);
  const rel = d.querySelector('#na-body a[href="/docs/page"]');
  ok(!!rel && /noopener/.test(rel.getAttribute('rel') || ''), 'relative link kept', rel && rel.outerHTML);
  ok(!!d.querySelector('#na-body img[src="https://cdn.example.com/a.png"]'), 'https image kept');
  ok(!!d.querySelector('#na-body strong') && !!d.querySelector('#na-body code') && !!d.querySelector('#na-body del'),
    'emphasis/code/del render');
}

/* ============================ 2. throttle (D1) ============================ */

const shared = await import(join(root, 'functions/api/admin/_shared.js'));
const { rateLimit, clearAttempts, sameOrigin } = shared;

// In-memory D1 mock implementing RESERVE_SQL's exact semantics, synchronously
// (like SQLite serializing the single upsert statement).
function mockD1({ throwOnQuery = false } = {}) {
  const table = new Map();
  return {
    table,
    prepare(sql) {
      return {
        args: [],
        bind(...args) { this.args = args; return this; },
        async all() {
          if (throwOnQuery) throw new Error('d1 down');
          const [k1, r1, k2, r2, k3, r3, now] = this.args;
          const out = [];
          for (const [key, reset] of [[k1, r1], [k2, r2], [k3, r3]]) {
            const row = table.get(key);
            if (!row) table.set(key, { key, n: 1, reset_at: reset });
            else if (row.reset_at > now) row.n += 1;
            else { row.n = 1; row.reset_at = reset; }
            out.push({ ...table.get(key) });
          }
          return { results: out, success: true };
        },
        async run() {
          if (throwOnQuery) throw new Error('d1 down');
          const m = sql.match(/WHERE key IN \(([^)]+)\)/);
          if (m) for (const a of this.args) table.delete(a);
          return { success: true };
        },
      };
    },
  };
}

const ctx = (ip, db, origin = 'https://natune.pages.dev') => ({
  env: { ADMIN_DB: db },
  request: {
    url: 'https://natune.pages.dev/api/admin/login',
    headers: { get: (h) => (h === 'CF-Connecting-IP' ? ip : h === 'Origin' ? origin : null) },
  },
});

console.log('== throttle: atomic reservation against mocked D1 ==');

{
  const db = mockD1();
  // 32 concurrent attempts from one IP — the old KV race let all of these in.
  const results = await Promise.all(Array.from({ length: 32 }, () => rateLimit(ctx('1.2.3.4', db))));
  const allowed = results.filter((r) => !r.limited).length;
  const limited = results.filter((r) => r.limited).length;
  ok(allowed === 8, 'exactly LIMIT_IP=8 attempts allowed from one IP', `allowed=${allowed}`);
  ok(limited === 24, 'remaining 24 rejected under concurrency', `limited=${limited}`);
  ok(results[8].retryAfter > 0 && results[8].retryAfter <= 600, 'Retry-After within window', String(results[8].retryAfter));
}

{
  const db = mockD1();
  for (let i = 0; i < 8; i++) await rateLimit(ctx('9.9.9.9', db));
  ok((await rateLimit(ctx('9.9.9.8', db))).limited === false, 'different IPv4 gets its own bucket');
}

{
  const db = mockD1();
  // 25 distinct addresses inside one IPv6 /64: per-IP limit (8) is never hit,
  // but the shared /64 bucket (24) must trip on the 25th.
  let limitedAt = -1;
  for (let i = 1; i <= 25; i++) {
    const rl = await rateLimit(ctx(`2001:db8:abcd:1234::${i.toString(16)}`, db));
    if (rl.limited && limitedAt === -1) limitedAt = i;
  }
  ok(limitedAt === 25, 'IPv6 /64 bucket trips at attempt 25', `limitedAt=${limitedAt}`);
  const rl = await rateLimit(ctx('2001:db8:ffff::9', db));
  ok(rl.limited === false, 'different /64 unaffected');
}

{
  const db = mockD1();
  // 40 attempts from 40 distinct IPs/subnets -> account-wide bucket (40) trips.
  let limitedAt = -1;
  for (let i = 1; i <= 41; i++) {
    const rl = await rateLimit(ctx(`10.${(i >> 8) & 255}.${i & 255}.1`, db));
    if (rl.limited && limitedAt === -1) limitedAt = i;
  }
  ok(limitedAt === 41, 'account-wide bucket trips at attempt 41', `limitedAt=${limitedAt}`);
}

{
  const db = mockD1();
  const c = ctx('5.6.7.8', db);
  for (let i = 0; i < 8; i++) await rateLimit(c);
  ok((await rateLimit(c)).limited === true, 'IP saturated');
  const rl = await rateLimit(c);
  await clearAttempts(c, rl);
  ok((await rateLimit(c)).limited === false, 'clearAttempts resets the IP bucket');
}

{
  const db = mockD1();
  const c = ctx('7.7.7.7', db);
  for (let i = 0; i < 8; i++) await rateLimit(c);
  const realNow = Date.now;
  Date.now = () => realNow() + 601_000; // jump past the 600s window
  try {
    ok((await rateLimit(c)).limited === false, 'counters reset after the window');
  } finally { Date.now = realNow; }
}

{
  ok((await rateLimit(ctx('1.1.1.1', undefined))).unavailable === true, 'missing ADMIN_DB fails closed');
  ok((await rateLimit(ctx('1.1.1.1', mockD1({ throwOnQuery: true })))).unavailable === true,
    'D1 error fails closed');
}

console.log('== origin check ==');
{
  const c = ctx('1.1.1.1', mockD1());
  ok(sameOrigin({ ...c, request: { ...c.request, headers: { get: () => 'https://natune.pages.dev' } } }) === true,
    'exact same origin allowed');
  ok(sameOrigin({ ...c, request: { ...c.request, headers: { get: () => null } } }) === false,
    'missing Origin rejected');
  ok(sameOrigin({ ...c, request: { ...c.request, headers: { get: () => 'https://evil.com' } } }) === false,
    'foreign origin rejected');
  ok(sameOrigin({ ...c, request: { ...c.request, headers: { get: () => 'http://natune.pages.dev' } } }) === false,
    'scheme downgrade (http vs https) rejected');
  ok(sameOrigin({ ...c, request: { ...c.request, headers: { get: () => 'https://natune.pages.dev.evil.com' } } }) === false,
    'suffix-lookalike host rejected');
}

/* ==================== 3. /api/news/* 404 guard ==================== */
// functions/api/news/[[path]].js sits in front of the static news assets. The
// Pages project uses single-page-application not-found handling, which rewrites
// missing paths to index.html (200) — and _headers even re-labels that shell
// as application/json or text/markdown for these paths, so status and
// Content-Type cannot detect it. The guard instead checks the news contract:
// index.json must parse as an array and content/<id> must be a published id;
// anything else that still comes back as the HTML shell becomes a real 404.

const newsGuard = await import(join(root, 'functions/api/news/[[path]].js'));
const INDEX_ITEMS = [{ id: 'welcome-natune.md' }, { id: 'release-2.md' }];
const htmlShell = () => new Response('<!doctype html><title>Natune</title>', {
  status: 200,
  headers: { 'Content-Type': 'text/html; charset=utf-8' },
});
const callNewsGuard = (path, { indexBody = INDEX_ITEMS, next } = {}) =>
  newsGuard.onRequest({
    request: new Request('https://natune.pages.dev' + path),
    env: {
      ASSETS: {
        fetch: async () => new Response(
          typeof indexBody === 'string' ? indexBody : JSON.stringify(indexBody),
          { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } }),
      },
    },
    next: next ?? (async () => new Response('Not Found', { status: 404 })),
  });

console.log('== /api/news/* 404 guard (SPA fallback -> real 404) ==');

{
  const res = await callNewsGuard('/api/news/content/nope.md', { next: htmlShell });
  ok(res.status === 404, 'unlisted content id -> 404', 'status=' + res.status);
  ok((res.headers.get('Content-Type') || '').includes('application/json'),
    '404 body is JSON', res.headers.get('Content-Type'));
  const body = await res.json();
  ok(body && body.error === 'not found', '404 body is {error:"not found"}', JSON.stringify(body));
}

{
  const upstream = new Response('# Hi', {
    status: 200,
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
  const res = await callNewsGuard('/api/news/content/welcome-natune.md', {
    next: async () => upstream,
  });
  ok(res === upstream && res.status === 200, 'published content passes through');
  ok(await res.text() === '# Hi', 'markdown body untouched');
}

{
  const res = await callNewsGuard('/api/news/content/release-2.md', { next: htmlShell });
  ok(res.status === 404, 'published id but missing file (HTML shell) -> 404', 'status=' + res.status);
}

{
  const upstream = new Response(JSON.stringify(INDEX_ITEMS), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
  const res = await callNewsGuard('/api/news/index.json', { next: async () => upstream });
  ok(res === upstream && res.status === 200, 'real index.json passes through');
}

{
  const res = await callNewsGuard('/api/news/index.json', { indexBody: '<!doctype html>' });
  ok(res.status === 404, 'missing index.json (HTML shell in ASSETS) -> 404', 'status=' + res.status);
}

{
  const res = await callNewsGuard('/api/news/index.json', { indexBody: 'not json{{{' });
  ok(res.status === 404, 'unparseable index.json -> 404', 'status=' + res.status);
}

{
  const res = await callNewsGuard('/api/news/nope', { next: htmlShell });
  ok(res.status === 404, 'other missing news path (HTML shell) -> 404', 'status=' + res.status);
}

{
  const upstream = new Response('Not Found', { status: 404 });
  const res = await callNewsGuard('/api/news/nope', { next: async () => upstream });
  ok(res === upstream && res.status === 404, 'upstream 404 stays a 404');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
