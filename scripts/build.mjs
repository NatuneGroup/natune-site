// Build: validate the news contract, copy public/ -> dist/, then stamp the
// copyright year so the footer is correct without JavaScript.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.env.NATUNE_SITE_OUT ? resolve(process.env.NATUNE_SITE_OUT) : join(root, 'dist');
if (out === root || out === resolve('/')) throw new Error(`build: refusing to write to ${out}`);

execFileSync(process.execPath, [join(root, 'scripts/validate-news.mjs')], { stdio: 'inherit' });

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(root, 'public'), out, { recursive: true });

const year = String(new Date().getFullYear());
for (const page of ['index.html', '404.html', 'news/index.html']) {
  const file = join(out, page);
  const html = readFileSync(file, 'utf8');
  if (!html.includes('{{year}}')) throw new Error(`build: ${page} has no {{year}} placeholder`);
  writeFileSync(file, html.replaceAll('{{year}}', year));
}

for (const required of ['404.html', 'robots.txt', 'sitemap.xml']) {
  if (!existsSync(join(out, required))) throw new Error(`build: ${required} is missing from public/`);
}

console.log(`build: public/ -> ${out} done (© ${year})`);
