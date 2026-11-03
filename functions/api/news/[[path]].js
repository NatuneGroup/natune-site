// Catch-all for the static news API (/api/news/*).
//
// The Pages project serves unmatched paths as index.html with a 200
// (single-page-application not-found handling) so client-side routes work.
// That fallback is wrong here: when index.json or content/<id> is missing,
// the app receives the HTML shell and tries to parse it as JSON/Markdown.
// The _headers file even re-labels the fallback as application/json /
// text/markdown for these paths, so Content-Type cannot tell a real asset
// from the shell — and neither can status (both are 200).
//
// Instead this function checks the news contract itself:
//   /api/news/index.json      exists iff the served body parses as an array
//   /api/news/content/<id>    exists iff <id> is a published id in index.json
//   anything else             passes through, but a 200 whose body is the HTML
//                             shell is remapped to a real 404
// Published id or not, a pass-through that still comes back as the HTML shell
// (e.g. index lists the id but the file is gone) is also a 404.
//
// Admin API functions live under /api/admin/* and are unaffected.

const INDEX_PATH = '/api/news/index.json';
const CONTENT_PREFIX = '/api/news/content/';

const notFound = () =>
  new Response(JSON.stringify({ error: 'not found' }), {
    status: 404,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });

// The SPA shell is the only HTML-doctype body ever served under /api/news/*.
async function isShellResponse(res) {
  if (res.status !== 200) return false;
  const head = (await res.clone().text()).slice(0, 512).trimStart().toLowerCase();
  return head.startsWith('<!doctype') || head.startsWith('<html');
}

// index.json straight from the asset store (not context.next — that would run
// the rest of the chain, not a second pass through this catch-all). Returns the
// item array, or null when it is missing/not parseable JSON.
async function newsItems(context) {
  try {
    const res = await context.env.ASSETS.fetch(new URL(INDEX_PATH, context.request.url));
    if (res.status !== 200) return null;
    const items = await res.json();
    return Array.isArray(items) ? items : null;
  } catch {
    return null;
  }
}

export async function onRequest(context) {
  const { pathname } = new URL(context.request.url);

  if (pathname.startsWith(CONTENT_PREFIX) && pathname.length > CONTENT_PREFIX.length) {
    const id = pathname.slice(CONTENT_PREFIX.length);
    const items = await newsItems(context);
    if (!items || !items.some((it) => it && it.id === id)) return notFound();
    const res = await context.next();
    return (await isShellResponse(res)) ? notFound() : res;
  }

  if (pathname === INDEX_PATH) {
    return (await newsItems(context)) ? context.next() : notFound();
  }

  const res = await context.next();
  return (await isShellResponse(res)) ? notFound() : res;
}
