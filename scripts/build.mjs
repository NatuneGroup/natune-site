// Build: validate the news contract, then copy public/ -> dist/.
import { cpSync, rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

execFileSync(process.execPath, [join(root, 'scripts/validate-news.mjs')], { stdio: 'inherit' });

const dist = join(root, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(join(root, 'public'), dist, { recursive: true });
console.log('build: public/ -> dist/ done');
