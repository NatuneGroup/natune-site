# natune-site

Public website for **Natune** — <https://natune.pages.dev> — hosted on Cloudflare Pages.

## What's here

| Path | What |
| --- | --- |
| `public/` | Fully static site — landing page, `/news/`, `/admin/`, assets |
| `public/api/news/` | The app's announcements feed: `index.json` + `content/<id>.md` |
| `functions/api/admin/` | Pages Functions (the only dynamic part): login + news CRUD |
| `scripts/` | `build.mjs` (public → dist) and `validate-news.mjs` (contract check) |
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
Reads are plain static file serves — no Functions are invoked for `/api/news/*`.

## Admin

`/admin/` — password login (HttpOnly session cookie, KV rate limiting) then create/edit/delete
announcements. Publishing commits `index.json` + `content/<id>` to this repo via the GitHub API,
which triggers the deploy workflow.

### Secrets (Pages project settings)

| Name | Value |
| --- | --- |
| `ADMIN_PASSWORD_HASH` | `hmac1$<salt_hex>$<hmac_sha256_hex>` — HMAC keyed by `ADMIN_SESSION_SECRET` over `salt:password` |
| `ADMIN_SESSION_SECRET` | Random 32+ byte secret (also the HMAC key/pepper and session signing key) |
| `GITHUB_NEWS_TOKEN` | GitHub PAT with `contents:write` on this repo |
| `ADMIN_KV` | **KV namespace binding** (not a secret): login-attempt rate limiting |

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
npm run deploy   # build + wrangler pages deploy
```
