// Landing redesign regressions; deterministic jsdom checks with no network.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const html = read('public/index.html');
const scripts = Object.fromEntries(['site', 'theme', 'landing', 'lyrics-demo'].map(name => [name, read(`public/assets/js/${name}.js`)]));
const settle = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
const click = (window, selector) => window.document.querySelector(selector).dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
const asset = (name, tag) => ({ name, browser_download_url: `https://github.com/NatuneGroup/Natune/releases/download/${tag}/${name}` });
const release = (tag, names, prerelease = false) => ({ tag_name: tag, prerelease, assets: names.map(name => asset(name, tag)) });
const fixtures = [
  release('N20261104', ['app-gms-mobile-universal-nightly.apk', 'natune-ios-nightly.ipa'], true),
  release('N20261103', ['natune-desktop-linux-x64-nightly.deb', 'natune-desktop-linux-arm64-nightly.AppImage', 'natune-desktop-macos-arm64-nightly.dmg', 'natune-desktop-windows-x64-nightly.exe', 'app-gms-mobile-universal-older.apk'], true),
];

function makeWindow({ saved, systemLight = false, storageBlocked = false, observer = true, releases = fixtures, reduceMotion = false } = {}) {
  const dom = new JSDOM(html, { url: 'https://natune.pages.dev/', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  const preference = { matches: systemLight, addEventListener: (_, fn) => { preference.change = fn; } };
  window.matchMedia = (query) => String(query).includes('reduced-motion')
    ? { matches: reduceMotion, addEventListener() {} }
    : preference;
  if (observer) {
    window.__observers = [];
    window.IntersectionObserver = class {
      constructor(callback) { this.cb = callback; window.__observers.push(this); }
      observe(target) { this.target = target; }
      unobserve() {}
      disconnect() {}
    };
  }
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
  window.eval(scripts['lyrics-demo']);
  const demoRoot = window.document.querySelector('[data-lyrics-demo]');
  return { window, preference, demo: demoRoot && demoRoot.lyricsDemo, demoRoot, close: () => dom.window.close() };
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
await check('enhanced lyrics: sweep, emphasis, lift and glow use the app geometry', () => {
  const app = makeWindow();
  const m = app.demo.math;
  assert.equal(m.progressAt(1000, 2000, 1000), 0, 'a word never lights before its start');
  assert.equal(m.progressAt(1000, 2000, 1500), 0.5, 'sweep follows the provider span');
  assert.equal(m.progressAt(1000, 2000, 2600), 1, 'sweep clamps at its end');
  assert.equal(m.progressAt(1000, 2000, 1500, true), 1, 'reduced motion jumps to lit');
  assert.equal(m.progressAt(1000, 2000, 900, true), 0, 'reduced motion stays unlit before the start');
  assert.equal(m.featherPx(0), 4, 'feather floor');
  assert.equal(m.featherPx(1000), 28, 'feather ceiling');
  assert.equal(m.featherPx(100), 20, 'feather is a fifth of the word');
  assert.equal(m.isEmphasized('light', 1050, 2500), true, 'held short word earns emphasis');
  assert.equal(m.isEmphasized('the', 800, 1050), false, 'quick word earns none');
  assert.equal(m.isEmphasized('abcdefgh', 0, 2000), false, 'longer than seven clusters earns none');
  assert.equal(m.emphasisGain(800, 1050), 0, 'no emphasis gain under one second');
  assert.ok(Math.abs(m.emphasisGain(1050, 2500) - 0.725) < 1e-9, 'emphasis ramps over the next second');
  const bump = (index, position, reduced) => m.bumpAt(1050, 1450, 5, index, position, reduced);
  assert.equal(bump(0, 1050), 0, 'no ripple before the word');
  assert.ok(Math.abs(bump(0, 1050 + 725) - 1) < 1e-9, 'the wave peaks mid-letter');
  assert.equal(bump(0, 2500), 0, 'no ripple at the word end');
  assert.equal(bump(4, 1050 + 100), 0, 'a late letter waits for its stagger');
  assert.equal(bump(2, 1500, true), 0, 'reduced motion stills the wave');
  assert.equal(bump(2, 1500), bump(2, 1500), 'the wave is a pure function of the position');
  assert.equal(m.liftDurationMs(1050, 2500, 2700), 200, 'lift shortens to a tight hand-off');
  assert.equal(m.liftAt(1050, 2500, 2700, 1050), 0, 'a word starts below its seat');
  assert.equal(m.liftAt(1050, 2500, 2700, 2500), 1, 'a word is seated at its end');
  assert.equal(m.liftAt(1050, 2500, 2700, 2000, true), 1, 'reduced motion always seats');
  const drop = m.dropAt(0, 1050, 2500, 2700, 1500) * 2;
  assert.ok(drop > 1.99, `unsung words sit two dp low (${drop})`);
  assert.equal(m.glowIntensity(1050, 2500, 2500), 0, 'glow ends with the word');
  assert.ok(m.glowIntensity(1050, 2500, 1500) >= 0.22, 'held words keep a faint bloom');
  assert.equal(m.depth(null).scale, 1, 'the sung row keeps full size');
  assert.ok(m.depth(2).scale < 1 && m.depth(2).alpha < 1, 'distance softens a row');
  assert.equal(m.depth(2, true).scale, 1, 'reduced motion keeps every row full size');
  app.close();
});
await check('enhanced lyrics: interlude dots light in turn and swell before the next line', () => {
  const app = makeWindow();
  const m = app.demo.math;
  const state = app.demo.state();
  assert.deepEqual({ start: state.interlude.startMs, end: state.interlude.endMs }, { start: 5900, end: 15100 }, 'a nine second silence owns the dots');
  assert.equal(m.interludeVisibility(5900, 15100, 5900), 0, 'dots fade in from the break start');
  assert.equal(m.interludeVisibility(5900, 15100, 7000), 1, 'dots are fully visible inside the break');
  assert.ok(Math.abs(m.interludeVisibility(5900, 15100, 15050) - 0.125) < 1e-9, 'dots fade out before the line');
  assert.equal(m.interludeVisibility(5900, 15100, 15100), 0, 'dots draw nothing after the break');
  assert.equal(m.dotLight(0, 0), 0.25, 'the first dot starts dim');
  assert.equal(m.dotLight(0.5, 0), 1, 'the first dot takes the first third');
  assert.ok(Math.abs(m.dotLight(0.5, 1) - 0.625) < 1e-9, 'the second dot takes the middle third');
  assert.equal(m.dotLight(0.5, 2), 0.25, 'the last dot waits its turn');
  assert.equal(m.dotLight(0.5, 1, true), 1, 'reduced motion lights dots in steps');
  assert.ok(Math.abs(m.breath(0) - 0.92) < 1e-9, 'the breath starts small');
  assert.ok(Math.abs(m.breath(1200) - 1.08) < 1e-9, 'the breath swells on its cycle');
  assert.ok(Math.abs(m.endSwell(5900, 15100, 13600) - 1.1) < 1e-9, 'the swell starts at the last 1.5s');
  assert.ok(m.endSwell(5900, 15100, 15099) > 1.39, 'the swell grows toward the arriving line');
  assert.equal(m.endSwell(5900, 15100, 12000), 0, 'no swell before its window');
  app.close();
});
await check('enhanced lyrics: one clock moves the sweep, rows and dots', () => {
  const app = makeWindow();
  const d = app.window.document;
  const demo = app.demo;
  demo.seek(0);
  assert.equal(demo.state().activeIndex, 0, 'the first line lights first');
  assert.equal(d.querySelectorAll('.lyric-word.is-sung').length, 0, 'nothing is sung at the start');
  demo.seek(1500);
  assert.equal(d.querySelectorAll('.lyric-word.is-sweeping').length, 1, 'one word is mid-sweep');
  const sweeping = d.querySelector('.lyric-word.is-sweeping');
  assert.equal(sweeping.textContent, 'light', 'the word is rendered once, exactly as written');
  assert.equal(sweeping.querySelectorAll('.lyric-letter').length, 5, 'the word is split into letter clusters');
  const edgeB = sweeping.querySelectorAll('.lyric-letter')[0].style.getPropertyValue('--edge-b');
  assert.ok(parseFloat(edgeB) > 0, 'the bright edge follows the clock');
  demo.seek(2600);
  assert.equal(demo.state().activeIndex, 1, 'the activation lead hands over before the next word');
  assert.equal(d.querySelectorAll('.lyric-row').length, 4, 'every row is wired to the clock');
  assert.equal(d.querySelectorAll('.lyric-row.is-passed .lyric-word.is-sung').length, 3, 'the whole first line stays lit');
  assert.ok(parseFloat(d.querySelector('.lyric-row.is-active').style.getPropertyValue('--row-scale')) > 1, 'the sung row pops');
  demo.seek(7000);
  assert.equal(demo.state().activeIndex, 1, 'the second line holds through the break');
  assert.equal(d.querySelector('.lyrics-dots').style.getPropertyValue('--dots-visible'), '1.000', 'the dots show in the break');
  assert.equal(d.querySelector('.lyrics-dots').getAttribute('aria-hidden'), 'false', 'visible dots are announced as decorative only when shown');
  assert.equal(d.querySelector('.lyric-row.is-active').style.getPropertyValue('--row-alpha'), '0.000', 'the current line gives its slot to the interlude dots');
  demo.seek(15000);
  assert.ok(parseFloat(d.querySelector('.lyrics-dots').style.getPropertyValue('--dots-breath')) > 1.1, 'the dots swell at the end of the break');
  demo.seek(15400);
  assert.equal(demo.state().activeIndex, 2, 'the third line lights after the break');
  assert.equal(d.querySelector('.lyrics-dots').style.getPropertyValue('--dots-visible'), '0.000', 'the dots leave with the break');
  assert.equal(d.querySelectorAll('.lyric-row.is-passed').length, 2, 'earlier lines stay softly lit');
  assert.equal(demo.duration(), 20600, 'the loop ends with the last sung word');
  demo.seek(20500);
  assert.equal(demo.state().activeIndex, 3, 'the last line closes the loop');
  demo.seek(20600 + 150);
  assert.equal(demo.state().activeIndex, 0, 'the loop wraps back to the first line');
  assert.equal(d.querySelector('.lyric-row.is-active').textContent.replace(/\s+/g, ' ').trim(), 'Hold the light', 'the wrapped loop starts the first line again');
  app.close();
});
await check('enhanced lyrics: play, pause, hidden and offscreen all stop the clock', async () => {
  const app = makeWindow();
  const d = app.window.document;
  const toggle = d.querySelector('[data-lyrics-toggle]');
  assert.equal(toggle.getAttribute('aria-pressed'), 'false');
  assert.equal(toggle.getAttribute('aria-label'), 'Pause lyrics preview');
  app.demo.seek(1000);
  click(app.window, '[data-lyrics-toggle]');
  assert.equal(toggle.getAttribute('aria-pressed'), 'true', 'the toggle reports paused');
  assert.equal(toggle.getAttribute('aria-label'), 'Play lyrics preview', 'the label flips');
  assert.equal(app.demo.state().running, false, 'the clock stops when paused');
  const frozen = app.demo.position();
  app.demo.tick(0);
  assert.equal(app.demo.position(), frozen, 'a paused clock does not advance');
  assert.equal(app.demo.tick(500), frozen + 500, 'an explicit tick advances the same clock');
  click(app.window, '[data-lyrics-toggle]');
  assert.equal(app.demo.state().userPaused, false, 'the toggle resumes');
  Object.defineProperty(d, 'hidden', { configurable: true, get: () => true });
  d.dispatchEvent(new app.window.Event('visibilitychange'));
  assert.equal(app.demo.state().running, false, 'a hidden page stops the clock');
  Object.defineProperty(d, 'hidden', { configurable: true, get: () => false });
  d.dispatchEvent(new app.window.Event('visibilitychange'));
  assert.equal(app.demo.state().running, true, 'visibility restores the clock');
  const viewportObserver = app.window.__observers.find((observer) => observer.target && observer.target.classList.contains('lyrics-viewport'));
  assert.ok(viewportObserver, 'the demo observes its viewport');
  viewportObserver.cb([{ isIntersecting: false, target: viewportObserver.target }]);
  assert.equal(app.demo.state().running, false, 'an offscreen demo stops the clock');
  viewportObserver.cb([{ isIntersecting: true, target: viewportObserver.target }]);
  assert.equal(app.demo.state().running, true, 'scrolling back resumes it');
  app.close();
});
await check('enhanced lyrics: reduced motion settles words, dots and rows', () => {
  const app = makeWindow({ reduceMotion: true });
  const d = app.window.document;
  assert.equal(app.demo.state().reduceMotion, true, 'the demo sees the preference');
  app.demo.seek(1500);
  assert.equal(d.querySelectorAll('.lyric-word.is-sweeping').length, 0, 'no partial sweep under reduced motion');
  assert.equal(d.querySelectorAll('.lyric-letter[style*="--edge-a: 100.00%"]').length, 12, 'every letter of a started word snaps lit, never mid-sweep');
  assert.equal(d.querySelector('.lyrics-dots').style.getPropertyValue('--dots-breath'), '1.000', 'the dots do not breathe');
  assert.equal(app.demo.math.bumpAt(1050, 1450, 5, 2, 1500, true), 0, 'no letter ripple');
  assert.equal([...d.querySelectorAll('.lyric-word')].every((word) => parseFloat(word.style.getPropertyValue('--glow')) === 0), true, 'no glow under reduced motion');
  assert.equal(d.querySelector('.lyric-row').style.getPropertyValue('--settle-y'), '0.00px', 'rows do not glide between lines');
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
await check('desktop download restores focus to its visible opener on Escape', async () => {
  const app = makeWindow();
  const d = app.window.document;
  const opener = d.querySelector('.navbar__links [data-dl-open]');
  d.getElementById('burger').style.display = 'none';
  opener.focus();
  click(app.window, '.navbar__links [data-dl-open]');
  await settle();
  assert.ok(d.getElementById('dlmodal').contains(d.activeElement));
  d.dispatchEvent(new app.window.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.ok(d.getElementById('dlmodal').hidden);
  assert.equal(d.activeElement, opener);
  app.close();
});
await check('desktop-to-mobile resize during download restores focus to the visible burger', async () => {
  const app = makeWindow();
  const d = app.window.document;
  const nav = d.querySelector('.navbar__links');
  const burger = d.getElementById('burger');
  nav.style.display = 'flex';
  burger.style.display = 'none';
  click(app.window, '.navbar__links [data-dl-open]');
  await settle();
  assert.ok(d.getElementById('dlmodal').contains(d.activeElement));
  // jsdom has no media-query layout; hide the opener's ancestor at the breakpoint.
  nav.style.display = 'none';
  burger.style.display = 'inline-flex';
  app.window.dispatchEvent(new app.window.Event('resize'));
  d.dispatchEvent(new app.window.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.ok(d.getElementById('dlmodal').hidden);
  assert.ok(!d.getElementById('navbar').inert);
  assert.equal(d.activeElement, burger);
  app.close();
});
await check('download falls back to main when neither opener nor burger can take focus', async () => {
  for (const unavailable of ['hidden', 'disabled', 'inert']) {
    const app = makeWindow();
    const d = app.window.document;
    const nav = d.querySelector('.navbar__links');
    const burger = d.getElementById('burger');
    const main = d.getElementById('main');
    main.removeAttribute('tabindex');
    click(app.window, '.navbar__links [data-dl-open]');
    await settle();
    nav.style.display = 'none';
    if (unavailable === 'hidden') burger.style.visibility = 'hidden';
    if (unavailable === 'disabled') burger.disabled = true;
    if (unavailable === 'inert') burger.inert = true;
    d.dispatchEvent(new app.window.KeyboardEvent('keydown', { key: 'Escape' }));
    assert.ok(d.getElementById('dlmodal').hidden);
    assert.equal(main.getAttribute('tabindex'), '-1');
    assert.equal(d.activeElement, main, unavailable);
    app.close();
  }
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
