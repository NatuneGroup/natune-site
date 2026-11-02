// Validate public/api/news/index.json against the app's NewsItem contract
// (moe.rukamori.archivetune.models.NewsItem) and check every content file exists.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = join(root, 'public/api/news/index.json');
const contentDir = join(root, 'public/api/news/content');

const fail = (msg) => { console.error(`news validation: ${msg}`); process.exit(1); };

let items;
try {
  items = JSON.parse(readFileSync(indexPath, 'utf8'));
} catch (e) {
  fail(`index.json is not valid JSON: ${e.message}`);
}
if (!Array.isArray(items)) fail('index.json must be a JSON array');

const ids = new Set();
items.forEach((it, i) => {
  const where = `item ${i} (${it && it.id ? it.id : 'no id'})`;
  if (typeof it !== 'object' || it === null) fail(`${where}: not an object`);
  if (typeof it.id !== 'string' || it.id.length === 0) fail(`${where}: "id" must be a non-empty string`);
  if (!/^[A-Za-z0-9._-]+$/.test(it.id)) fail(`${where}: "id" must be a safe filename (got "${it.id}")`);
  if (ids.has(it.id)) fail(`${where}: duplicate id`);
  ids.add(it.id);
  if (typeof it.Title !== 'string' || it.Title.length === 0) fail(`${where}: "Title" required`);
  if (typeof it.Author !== 'string' || it.Author.length === 0) fail(`${where}: "Author" required`);
  if ('Description' in it && typeof it.Description !== 'string') fail(`${where}: "Description" must be a string`);
  if ('Important' in it && typeof it.Important !== 'boolean') fail(`${where}: "Important" must be a boolean`);
  if (it.ImageURL !== undefined && it.ImageURL !== null) {
    const arr = Array.isArray(it.ImageURL) ? it.ImageURL : [it.ImageURL];
    arr.forEach((u) => {
      if (typeof u !== 'string' || !/^https?:\/\//.test(u)) fail(`${where}: ImageURL entries must be absolute http(s) URLs`);
    });
  }
  // Date: epoch seconds, quoted or unquoted numeric — never a human date.
  const d = it.Date;
  const okDate = (typeof d === 'number' && Number.isFinite(d)) ||
    (typeof d === 'string' && /^\d{9,12}$/.test(d));
  if (!okDate) fail(`${where}: "Date" must be epoch seconds (got ${JSON.stringify(d)})`);
  const contentFile = join(contentDir, it.id);
  if (!existsSync(contentFile)) fail(`${where}: missing content file api/news/content/${it.id}`);
});
console.log(`news validation: OK (${items.length} item${items.length === 1 ? '' : 's'})`);
