// Behaviour tests for public/assets/js/site.js (jsdom, no network):
//   1) download dialog only renders release assets whose browser_download_url
//      is an https: URL on a GitHub-owned host — anything else is skipped, and
//      a release with no usable asset falls back to the releases page.
//   2) the mobile drawer never leaves focus inside a hidden element: when the
//      burger (its only trigger) becomes display:none on resize, the drawer
//      closes and focus lands on a visible element.
//   3) privacy and announcement links target the current public Natune repo.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const html = read('public/index.html');
const siteJs = read('public/assets/js/site.js');

let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name, extra); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeWindow(fetchImpl) {
  const dom = new JSDOM(html, { url: 'https://natune.pages.dev/', runScripts: 'outside-only' });
  const { window } = dom;
  window.IntersectionObserver = window.IntersectionObserver || class { observe() {} unobserve() {} disconnect() {} };
  window.fetch = fetchImpl;
  window.eval(siteJs);
  return window;
}
const ghRelease = (assets) => [{
  tag_name: 'N20261103',
  assets: assets.map(([name, url]) => ({ name, browser_download_url: url })),
}];
const apiFetch = (releases) => (url) => Promise.resolve({
  ok: true,
  json: () => Promise.resolve(String(url).includes('/releases') ? releases : { stargazers_count: 1 }),
});
const openDialog = async (window) => {
  window.document.querySelector('.hero__actions [data-dl-open]')
    .dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await sleep(40);
};

console.log('== public links: current Natune repository ==');

{
  const dom = new JSDOM(html, { url: 'https://natune.pages.dev/' });
  const d = dom.window.document;
  // The public privacy file is on dev; main currently has no PRIVACY.md.
  const privacyUrl = 'https://github.com/NatuneGroup/Natune/blob/dev/PRIVACY.md';
  const faqPrivacy = [...d.querySelectorAll('#faq a[href$="/PRIVACY.md"]')];
  const footerPrivacy = [...d.querySelectorAll('.footer a[href$="/PRIVACY.md"]')];
  ok(faqPrivacy.length === 1 && faqPrivacy[0].href === privacyUrl,
    'FAQ links to the public Natune privacy notice');
  ok(footerPrivacy.length === 1 && footerPrivacy[0].href === privacyUrl,
    'footer links to the same public Natune privacy notice');
  dom.window.close();

  const welcome = read('public/api/news/content/welcome-natune.md');
  ok(welcome.includes('[GitHub releases](https://github.com/NatuneGroup/Natune/releases)'),
    'welcome announcement links to Natune releases');
  ok(welcome.includes('[NatuneGroup/Natune](https://github.com/NatuneGroup/Natune)'),
    'welcome announcement links to the current public source repository');
  ok(!/https:\/\/github\.com\/NatuneGroup\/ArchiveTune(?:-KMP)?(?:[\/)#?\s]|$)/i.test(welcome),
    'welcome announcement has no obsolete app repository URLs');
}

console.log('== download dialog: asset URL allow-list ==');

{
  const window = makeWindow(apiFetch(ghRelease([
    ['app-gms-mobile-universal-nightly.apk', 'https://github.com/NatuneGroup/Natune/releases/download/N20261103/app-gms-mobile-universal-nightly.apk'],
    ['app-foss-mobile-universal-nightly.apk', 'javascript:globalThis.__xss=1'],
    ['app-gms-mobile-arm64-nightly.apk', 'http://github.com/NatuneGroup/Natune/releases/download/N20261103/x.apk'],
    ['app-gms-tv-universal-nightly.apk', 'https://evil.example.com/x.apk'],
  ])));
  const d = window.document;
  await openDialog(window);
  d.querySelector('[data-platform="android"]')
    .dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await sleep(40);
  const hrefs = [...d.querySelectorAll('#dl-links a')].map((a) => a.href);
  ok(hrefs.length === 1, 'only the github.com https asset renders', hrefs.join('; '));
  ok(hrefs[0].startsWith('https://github.com/'), 'kept link is https github.com', hrefs[0]);
  ok(window.__xss !== 1 && window.globalThis.__xss !== 1, 'no side effect from javascript: URL');
}

{
  const window = makeWindow(apiFetch(ghRelease([
    ['app-gms-mobile-universal-nightly.apk', 'https://objects.githubusercontent.com/github-production-release-asset-2e65be/123/abc'],
    ['app-foss-mobile-universal-nightly.apk', 'https://release-assets.githubusercontent.com/github-production-release-asset/abc'],
    ['app-gms-tv-universal-nightly.apk', 'not a url'],
  ])));
  const d = window.document;
  await openDialog(window);
  d.querySelector('[data-platform="android"]')
    .dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await sleep(40);
  const hrefs = [...d.querySelectorAll('#dl-links a')].map((a) => a.href);
  ok(hrefs.length === 2, 'githubusercontent hosts accepted, unparseable skipped', hrefs.join('; '));
}

{
  const window = makeWindow(apiFetch(ghRelease([
    ['app-gms-mobile-universal-nightly.apk', 'https://github.com.evil.example.com/x.apk'],
    ['app-foss-mobile-universal-nightly.apk', 'https://api.github.com/x'],
    ['app-gms-mobile-arm64-nightly.apk', 'data:text/html;base64,PHNjcmlwdD4='],
  ])));
  const d = window.document;
  await openDialog(window);
  d.querySelector('[data-platform="android"]')
    .dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await sleep(40);
  const links = [...d.querySelectorAll('#dl-links a')];
  const fb = d.querySelector('#dl-links a[href="https://github.com/NatuneGroup/Natune/releases"]');
  ok(links.length === 1 && !!fb, 'lookalike hosts rejected -> releases fallback', links.map((a) => a.href).join('; '));
  ok(d.querySelector('#dl-links').textContent.includes('No matching build'), 'fallback message shown');
}

console.log('== mobile drawer: focus never left in a hidden drawer ==');

{
  const window = makeWindow(() => Promise.resolve({ ok: false, json: () => Promise.resolve(null) }));
  const d = window.document;
  const burger = d.getElementById('burger');
  const drawer = d.getElementById('drawer');
  burger.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  ok(drawer.classList.contains('is-open'), 'drawer opens via burger');
  const link = drawer.querySelector('a');
  link.focus();
  ok(d.activeElement === link, 'focus sits inside the open drawer');
  // Simulate the desktop breakpoint: the trigger becomes display:none.
  burger.style.display = 'none';
  window.dispatchEvent(new window.Event('resize'));
  ok(!drawer.classList.contains('is-open'), 'drawer closes when its trigger hides');
  ok(burger.getAttribute('aria-expanded') === 'false', 'aria-expanded reset');
  ok(!drawer.contains(d.activeElement), 'focus moved out of the hidden drawer',
    d.activeElement && d.activeElement.tagName + '#' + (d.activeElement.id || ''));
  ok(d.activeElement === d.getElementById('main') || d.activeElement === d.body,
    'focus lands on a sensible visible element (main/body)',
    d.activeElement && d.activeElement.tagName + '#' + (d.activeElement.id || ''));
}

{
  const window = makeWindow(() => Promise.resolve({ ok: false, json: () => Promise.resolve(null) }));
  const d = window.document;
  const burger = d.getElementById('burger');
  const drawer = d.getElementById('drawer');
  burger.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  const link = drawer.querySelector('a');
  link.focus();
  // Trigger still visible -> resize must not disturb the open drawer.
  burger.style.display = 'flex';
  window.dispatchEvent(new window.Event('resize'));
  ok(drawer.classList.contains('is-open'), 'drawer stays open while trigger visible');
  ok(d.activeElement === link, 'focus undisturbed while trigger visible');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
