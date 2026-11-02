-- 0001: atomic login-attempt counters for /api/admin/login.
-- One row per rate-limit bucket key; reset_at is the epoch second the
-- current window ends. Rows are rewritten in place by the upsert in
-- functions/api/admin/_shared.js (RESERVE_SQL); expired rows are reset on
-- the next attempt and may be pruned opportunistically with:
--   DELETE FROM login_attempts WHERE reset_at < unixepoch('now') - 86400;
CREATE TABLE IF NOT EXISTS login_attempts (
  key      TEXT PRIMARY KEY,
  n        INTEGER NOT NULL DEFAULT 0,
  reset_at INTEGER NOT NULL
);
