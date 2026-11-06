# natune-site

Public website for **Natune** — <https://natune.pages.dev> — hosted on Cloudflare Pages.

## What's here

| Path | What |
| --- | --- |
| `public/` | Fully static site — landing page, `/news/`, `/admin/`, assets |
| `public/api/news/` | The app's announcements feed: `index.json` + `content/<id>.md` |
| `functions/api/` | Pages Functions (the only dynamic part): `/admin/` login + news CRUD, `/news/` 404 guard |
| `migrations/` | D1 schema for the atomic login-attempt throttle |
| `scripts/` | `build.mjs` (public → dist), `validate-news.mjs` (contract check), `test-security.mjs` (renderer XSS + throttle tests) |
| `docs/previews.md` | Which app previews are real captures, which are labelled illustrations, and the capture provenance |
| `.github/workflows/deploy.yml` | push to `main` → build → `wrangler pages deploy` |

## News contract (consumed by the app)

`GET /api/news/index.json` — JSON array of items:

```json
{
  "id": "welcome-natune.md",
  "Title": "Welcome to Natune",
  "Description": "short plain-text preview",
  "ImageURL": ["https://…"],
  "Important": true,
  "Author": "Natune Team",
  "Date": "1793625600"
}
```

`GET /api/news/content/<id>` — raw Markdown body (Markwon-rendered in-app).

Rules: `id` must be a safe filename and match a file under `content/`; `Title`/`Author` required;
`Date` is epoch **seconds** (quoted or bare number — never a human date); `ImageURL` accepts an
array, a bare string, or null. `npm run validate` enforces this in CI before every deploy.
Reads are plain static file serves. The only Function on this path is a thin catch-all (`functions/api/news/[[path]].js`) that turns the site's single-page-application fallback back into a real 404 when a news asset is missing; existing `index.json`/`content/<id>` files pass through untouched.

## Admin

`/admin/` — password login (HttpOnly session cookie, D1 atomic rate limiting) then create/edit/delete
announcements. Publishing commits `index.json` + `content/<id>` to this repo via the GitHub API,
which triggers the deploy workflow.

### Secrets (Pages project settings)

| Name | Value |
| --- | --- |
| `ADMIN_PASSWORD_HASH` | `hmac1$<salt_hex>$<hmac_sha256_hex>` — HMAC keyed by `ADMIN_SESSION_SECRET` over `salt:password` |
| `ADMIN_SESSION_SECRET` | Random 32+ byte secret (also the HMAC key/pepper and session signing key) |
| `GITHUB_NEWS_TOKEN` | GitHub PAT with `contents:write` on this repo |
| `ADMIN_DB` | **D1 binding** (not a secret): atomic login-attempt rate limiting — database `natune-login-throttle`, bound via `wrangler.toml` on deploy |

D1 setup (already created; only needed to recreate or inspect):

```bash
npx wrangler d1 create natune-login-throttle
npx wrangler d1 execute natune-login-throttle --remote --file migrations/0001_login_attempts.sql   # prod schema
npx wrangler d1 execute natune-login-throttle --local  --file migrations/0001_login_attempts.sql   # local dev schema
```

### Secrets (GitHub Actions)

| Name | Value |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with `Cloudflare Pages:Edit` on this account |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |

## Develop

```bash
npm install
npm run dev      # build + wrangler pages dev
npm run build    # validate news JSON + copy public/ to dist/
npm test         # XSS payloads through the real renderer + throttle tests vs a mocked D1
npm run deploy   # build + wrangler pages deploy
```
