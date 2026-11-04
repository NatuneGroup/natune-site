// Landing redesign regressions; deterministic jsdom checks with no network.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const html = read('public/index.html');
const scripts = Object.fromEntries(['site', 'theme', 'landing'].map(name => [name, read(`public/assets/js/${name}.js`)]));
const settle = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
const click = (window, selector) => window.document.querySelector(selector).dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
const asset = (name, tag) => ({ name, browser_download_url: `https://github.com/NatuneGroup/Natune/releases/download/${tag}/${name}` });
const release = (tag, names, prerelease = false) => ({ tag_name: tag, prerelease, assets: names.map(name => asset(name, tag)) });
const fixtures = [
  release('N20261104', ['app-gms-mobile-universal-nightly.apk', 'natune-ios-nightly.ipa'], true),
  release('N20261103', ['natune-desktop-linux-x64-nightly.deb', 'natune-desktop-linux-arm64-nightly.AppImage', 'natune-desktop-macos-arm64-nightly.dmg', 'natune-desktop-windows-x64-nightly.exe', 'app-gms-mobile-universal-older.apk'], true),
];

function makeWindow({ saved, systemLight = false, storageBlocked = false, observer = true, releases = fixtures } = {}) {
  const dom = new JSDOM(html, { url: 'https://natune.pages.dev/', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  const preference = { matches: systemLight, addEventListener: (_, fn) => { preference.change = fn; } };
  window.matchMedia = () => preference;
  if (observer) window.IntersectionObserver = class { observe() {} };
  if (saved) window.localStorage.setItem('natune-theme', saved);
  if (storageBlocked) Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage blocked'); } });
  window.fetch = async (url) => ({ ok: true, json: async () => String(url).includes('/releases') ? await releases : { stargazers_count: 12 } });
  const dialog = window.document.getElementById('preview-dialog');
  dialog.showModal = () => { dialog.setAttribute('open', ''); };
  dialog.close = () => { dialog.removeAttribute('open'); dialog.dispatchEvent(new window.Event('close')); };
  window.eval(scripts.theme);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  window.eval(scripts.site);
  window.eval(scripts.landing);
  return { window, preference, close: () => dom.window.close() };
}

let passed = 0;
async function check(label, action) {
  await action();
  passed++;
  console.log('  PASS', label);
}

console.log('== green landing: assets, themes, previews, releases and focus ==');
await check('all declared image, font, CSS and script assets are self-hosted and present', () => {
  const dom = new JSDOM(html);
  const attributes = [...dom.window.document.querySelectorAll('img[src], script[src], link[rel="preload"], link[rel="stylesheet"]')].map(el => el.getAttribute('src') || el.getAttribute('href'));
  for (const path of attributes) {
    if (!path) continue;
    assert.ok(path.startsWith('/'), `Hotlinked asset: ${path}`);
    assert.ok(existsSync(join(root, 'public', path.slice(1))), `Missing asset: ${path}`);
  }
  assert.ok(!/metrolist/i.test(html));
  assert.ok(!/https?:\/\//.test(read('public/assets/css/landing.css')));
  for (const name of readdirSync(join(root, 'public/assets/previews')).filter(name => name.endsWith('.svg'))) {
    const svg = read(`public/assets/previews/${name}`);
    assert.ok(!/(?:href|src)="https?:|<script|<foreignObject|<image\b/.test(svg), name);
    assert.ok(svg.includes('illustrative Natune UI'), name);
  }
  dom.window.close();
});
await check('system light theme works when storage is blocked', () => {
  const app = makeWindow({ systemLight: true, storageBlocked: true });
  assert.equal(app.window.document.documentElement.dataset.theme, 'light');
  click(app.window, '[data-theme-toggle]');
  assert.equal(app.window.document.documentElement.dataset.theme, 'dark');
  app.close();
});
await check('explicit theme persists and overrides later system changes', () => {
  const app = makeWindow({ saved: 'dark', systemLight: true });
  const { document: d } = app.window;
  assert.equal(d.documentElement.dataset.theme, 'dark');
  click(app.window, '[data-theme-toggle]');
  assert.equal(d.documentElement.dataset.theme, 'light');
  assert.equal(app.window.localStorage.getItem('natune-theme'), 'light');
  assert.equal(d.querySelector('meta[name="theme-color"]').content, '#f6fbef');
  assert.equal(d.querySelector('[data-theme-toggle]').getAttribute('aria-label'), 'Switch to dark theme');
  app.preference.matches = false;
  app.preference.change();
  assert.equal(d.documentElement.dataset.theme, 'light');
  app.close();
});
await check('Home, Library and Player switch every device to a valid local preview', () => {
  const app = makeWindow();
  const d = app.window.document;
  for (const view of ['home', 'library', 'player']) {
    click(app.window, `[data-preview-view="${view}"]`);
    assert.equal(d.querySelectorAll('[data-preview-view][aria-pressed="true"]').length, 1);
    for (const tile of d.querySelectorAll('[data-preview-device]')) {
      const image = tile.querySelector('img');
      assert.ok(image.getAttribute('src').includes(`-${view}`));
      assert.ok(existsSync(join(root, 'public', image.getAttribute('src'))));
      image.dispatchEvent(new app.window.Event('load'));
      assert.ok(!image.classList.contains('is-loading'));
    }
  }
  click(app.window, '[data-theme-toggle]');
  assert.ok(d.querySelector('[data-preview-device="desktop"] img').src.endsWith('desktop-player-light.svg'));
  assert.ok(d.querySelector('[data-preview-device="ios"] img').src.endsWith('ios-player-light.svg'));
  assert.ok(d.querySelector('[data-preview-device="android"] img').src.endsWith('android-player.webp'));
  app.close();
});
await check('device lightbox preserves aspect ratio, full-size source and focus', () => {
  const app = makeWindow();
  const d = app.window.document;
  for (const device of ['desktop', 'android', 'ios']) {
    const selector = `[data-preview-device="${device}"]`;
    click(app.window, selector);
    const dialog = d.getElementById('preview-dialog');
    assert.ok(dialog.open);
    assert.ok(dialog.classList.contains(`preview-dialog--${device}`));
    assert.equal(d.getElementById('preview-image').src, d.querySelector(`${selector} img`).src);
    assert.equal(d.getElementById('preview-original').href, d.getElementById('preview-image').src);
    assert.ok(d.body.classList.contains('preview-open'));
    dialog.close();
    assert.equal(d.activeElement, d.querySelector(selector));
    assert.ok(!d.body.classList.contains('preview-open'));
  }
  app.close();
});
await check('lyrics animation pause/resume exposes the correct accessible state', () => {
  const app = makeWindow();
  const d = app.window.document;
  click(app.window, '.lyrics-toggle');
  assert.ok(d.getElementById('features').classList.contains('is-paused'));
  assert.equal(d.querySelector('.lyrics-toggle').getAttribute('aria-pressed'), 'true');
  assert.equal(d.querySelector('.lyrics-toggle').getAttribute('aria-label'), 'Resume lyrics animation');
  click(app.window, '.lyrics-toggle');
  assert.ok(!d.getElementById('features').classList.contains('is-paused'));
  assert.equal(d.querySelector('.lyrics-toggle').getAttribute('aria-label'), 'Pause lyrics animation');
  app.close();
});
await check('platform shortcuts select the latest matching build including nightlies', async () => {
  const app = makeWindow();
  const d = app.window.document;
  for (const [platform, tag] of Object.entries({ android: 'N20261104', ios: 'N20261104', linux: 'N20261103', macos: 'N20261103', windows: 'N20261103' })) {
    click(app.window, `[data-dl-platform="${platform}"]`);
    await settle();
    assert.equal(d.querySelector('.dlmodal__tab[aria-pressed="true"]').dataset.platform, platform);
    assert.equal(d.querySelectorAll('#dl-steps li').length, 3);
    const links = [...d.querySelectorAll('#dl-links a')];
    assert.ok(links.length > 0);
    assert.ok(links.every(link => link.href.includes(`/download/${tag}/`)));
    assert.ok(d.getElementById('main').inert);
    app.window.document.dispatchEvent(new app.window.KeyboardEvent('keydown', { key: 'Escape' }));
    assert.ok(d.getElementById('dlmodal').hidden);
    assert.ok(!d.getElementById('main').inert);
    assert.equal(d.activeElement, d.querySelector(`[data-dl-platform="${platform}"]`));
  }
  app.close();
});
await check('a slow release response cannot overwrite a newer platform selection', async () => {
  let resolve;
  const releases = new Promise(done => { resolve = done; });
  const app = makeWindow({ releases });
  const d = app.window.document;
  click(app.window, '.hero__actions [data-dl-open]');
  click(app.window, '[data-platform="ios"]');
  click(app.window, '[data-platform="windows"]');
  resolve(fixtures);
  await settle();
  assert.equal(d.querySelector('.dlmodal__tab[aria-pressed="true"]').dataset.platform, 'windows');
  assert.ok([...d.querySelectorAll('#dl-links a')].every(link => link.href.includes('windows')));
  app.close();
});
await check('closing a loading dialog cancels stale rendering and restores prior inert state', async () => {
  let resolve;
  const app = makeWindow({ releases: new Promise(done => { resolve = done; }) });
  const d = app.window.document;
  d.querySelector('.footer').inert = true;
  click(app.window, '.hero__actions [data-dl-open]');
  click(app.window, '.hero__actions [data-dl-open]'); // repeated synthetic opener must not replace saved state
  click(app.window, '.dlmodal__close');
  resolve(fixtures);
  await settle();
  assert.ok(!d.getElementById('main').inert);
  assert.ok(d.querySelector('.footer').inert);
  assert.equal(d.querySelectorAll('#dl-links a').length, 0);
  app.close();
});
await check('mobile download restores focus to the visible menu trigger', async () => {
  const app = makeWindow();
  const d = app.window.document;
  d.getElementById('burger').style.display = 'flex';
  click(app.window, '#burger');
  click(app.window, '.navbar__drawer [data-dl-open]');
  await settle();
  assert.ok(!d.getElementById('drawer').classList.contains('is-open'));
  click(app.window, '.dlmodal__close');
  assert.equal(d.activeElement, d.getElementById('burger'));
  app.close();
});
await check('downloads and previews still work without IntersectionObserver', async () => {
  const app = makeWindow({ observer: false });
  click(app.window, '.hero__actions [data-dl-open]');
  await settle();
  assert.ok(!app.window.document.getElementById('dlmodal').hidden);
  assert.ok(app.window.document.querySelector('#dl-links a'));
  app.close();
});
console.log(`\n${passed} passed, 0 failed`);
