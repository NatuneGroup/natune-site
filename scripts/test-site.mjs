// Behaviour tests for public/assets/js/site.js (jsdom, no network):
//   1) download dialog only renders release assets whose browser_download_url
//      is an https: URL on a GitHub-owned host — anything else is skipped, and
//      a release with no usable asset falls back to the releases page.
//   2) a GitHub outage is reported as an outage, not as an empty release, and
//      Retry recovers once the API answers again.
//   3) the mobile drawer never leaves focus inside a hidden element: when the
//      burger (its only trigger) becomes display:none on resize, the drawer
//      closes and focus lands on a visible element.
//   4) pages without a GitHub-backed element make no api.github.com request.
//   5) the 404 page, robots.txt, sitemap.xml, social metadata, cache policy and
//      build-time year stamp exist and say what the site promises.
//   6) /news/ renders its list and article view from the static JSON, with
//      localized dates and no third-party requests.
//   7) privacy and announcement links target the current public Natune repo.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const html = read('public/index.html');
const newsHtml = read('public/news/index.html');
const adminHtml = read('public/admin/index.html');
const notFoundHtml = read('public/404.html');
const siteJs = read('public/assets/js/site.js');
const newsJs = read('public/assets/js/news.js');
const adminJs = read('public/assets/js/admin.js');

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

console.log('== download dialog: GitHub outage is not an empty release ==');

{
  let mode = 'down';
  const window = makeWindow(() => mode === 'down'
    ? Promise.reject(new TypeError('Failed to fetch'))
    : Promise.resolve({ ok: true, json: () => Promise.resolve(ghRelease([
      ['app-gms-mobile-universal-nightly.apk', 'https://github.com/NatuneGroup/Natune/releases/download/N20261103/app-gms-mobile-universal-nightly.apk'],
    ])) }));
  const d = window.document;
  await openDialog(window);
  d.querySelector('[data-platform="android"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await sleep(40);
  const box = d.getElementById('dl-links');
  ok(/Could not reach GitHub/.test(box.textContent), 'a transport failure is reported as unreachable', box.textContent);
  ok(!/No matching build/.test(box.textContent), 'an outage is not misreported as an empty release');
  ok(!!box.querySelector('.dlmodal__retry'), 'a retry control is offered');
  mode = 'up';
  box.querySelector('.dlmodal__retry').dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await sleep(40);
  const links = [...box.querySelectorAll('a.dlmodal__link')];
  ok(links.length === 1 && links[0].href.includes('app-gms-mobile-universal'), 'retry renders the build list once GitHub answers', links.map((a) => a.href).join('; '));
}

{
  const window = makeWindow(() => Promise.resolve({ ok: false, status: 429, json: () => Promise.resolve(null) }));
  await openDialog(window);
  await sleep(40);
  const text = window.document.getElementById('dl-links').textContent;
  ok(/Could not reach GitHub/.test(text) && !/No matching build/.test(text), 'HTTP 429 is reported as unreachable, not as no build');
}

{
  const window = makeWindow(apiFetch([]));
  await openDialog(window);
  await sleep(40);
  const text = window.document.getElementById('dl-links').textContent;
  ok(/No matching build/.test(text) && !/Could not reach GitHub/.test(text), 'an empty release list stays an empty release');
}

console.log('== news and admin: no GitHub API traffic without a GitHub element ==');

for (const [name, markup] of [['news', newsHtml], ['admin', adminHtml]]) {
  const dom = new JSDOM(markup, { url: `https://natune.pages.dev/${name}/`, runScripts: 'outside-only' });
  const { window } = dom;
  const calls = [];
  window.fetch = (url) => {
    calls.push(String(url));
    const body = String(url).includes('index.json') ? [] : '';
    return Promise.resolve({ ok: true, json: () => Promise.resolve(body), text: () => Promise.resolve(body) });
  };
  window.eval(siteJs);
  if (name === 'news') window.eval(newsJs);
  await sleep(30);
  ok(calls.every((url) => !url.includes('api.github.com')), `${name} makes no GitHub API request`, calls.join('; '));
  if (name === 'admin') ok(calls.length === 0, 'admin makes no request at all', calls.join('; '));
  ok(!window.document.getElementById('dlmodal'), `${name} has no download dialog`);
  dom.window.close();
}

console.log('== 404, robots, sitemap, social metadata, cache policy and dead weight ==');

{
  ok(existsSync(join(root, 'public/404.html')), 'public/404.html exists');
  ok(notFoundHtml.includes('<meta name="robots" content="noindex'), 'the 404 page is noindex');
  ok(!/rel="canonical"/.test(notFoundHtml), 'the 404 page carries no canonical');
  ok(notFoundHtml.includes('href="/news/"') && notFoundHtml.includes('href="/#download"'), 'the 404 page links to News and Download');
  ok(!/data-dl-open/.test(notFoundHtml), 'the 404 page never depends on the download dialog');

  const robots = read('public/robots.txt');
  ok(/^User-agent: \*/m.test(robots), 'robots.txt names the user agent');
  ok(/^Disallow: \/admin\/$/m.test(robots), 'robots.txt keeps /admin/ out of search');
  ok(robots.includes('Sitemap: https://natune.pages.dev/sitemap.xml'), 'robots.txt points at the sitemap');
  ok(!/</.test(robots), 'robots.txt is not an HTML page');

  const sitemap = read('public/sitemap.xml');
  ok(sitemap.includes('<loc>https://natune.pages.dev/</loc>') && sitemap.includes('<loc>https://natune.pages.dev/news/</loc>'), 'the sitemap lists the landing page and news');
  ok(!sitemap.includes('/admin/'), 'the sitemap omits the admin page');
  ok(sitemap.trimEnd().endsWith('</urlset>'), 'the sitemap is a complete urlset');

  const headers = read('public/_headers');
  const block = (path) => {
    const start = headers.indexOf(`${path}\n`);
    if (start === -1) return '';
    const next = headers.indexOf('\n/', start + 1);
    return headers.slice(start, next === -1 ? undefined : next);
  };
  ok(/max-age=300/.test(block('/assets/css/*')), 'CSS gets a short max-age', block('/assets/css/*'));
  ok(/max-age=300/.test(block('/assets/js/*')), 'JS gets a short max-age', block('/assets/js/*'));
  ok(/max-age=86400/.test(block('/assets/previews/*')), 'previews get a cache policy');
  ok(/max-age=86400/.test(block('/assets/icons/*')), 'icons get a cache policy');
  ok(block('/assets/fonts/*') !== '' && !/immutable/.test(block('/assets/fonts/*')), 'fonts are not immutable before their names are hashed');
  ok(!headers.includes('/assets/screenshots/'), 'the cache policy no longer covers deleted screenshots');
  ok(/Content-Security-Policy:/.test(headers), 'the CSP is still served');

  const manifest = JSON.parse(read('public/site.webmanifest'));
  ok(/Kotlin Multiplatform/.test(manifest.description), 'the manifest describes the multiplatform app', manifest.description);
  ok(manifest.theme_color === '#0d140e' && manifest.background_color === '#0d140e', 'the manifest uses the redesign green');

  ok(/property="og:image" content="https:\/\/natune\.pages\.dev\/assets\/img\/og-card\.jpg"/.test(html), 'og:image points at the 1200x630 card');
  ok(/property="og:image:width" content="1200"/.test(html) && /property="og:image:height" content="630"/.test(html), 'og:image declares its size');
  ok(/property="og:url" content="https:\/\/natune\.pages\.dev\/"/.test(html) && /property="og:site_name"/.test(html) && /property="og:locale"/.test(html), 'the landing page has complete Open Graph metadata');
  ok(/name="twitter:card" content="summary_large_image"/.test(html), 'the landing page asks for a large social card');
  ok(/property="og:title"/.test(newsHtml) && /property="og:description"/.test(newsHtml), 'the news page has its own Open Graph title and description');
  ok(/rel="canonical" href="https:\/\/natune\.pages\.dev\/news\/"/.test(newsHtml), 'the news page is canonical');

  ok(!existsSync(join(root, 'public/assets/css/site.css')), 'the retired second stylesheet is gone');
  ok(!existsSync(join(root, 'public/assets/css/noscript.css')), 'the unused noscript stylesheet is gone');
  ok(!existsSync(join(root, 'public/assets/screenshots')), 'the unreferenced screenshots are gone');
  ok(!/site\.css/.test(newsHtml + adminHtml), 'no page loads the retired stylesheet');
  ok(!/class="[^"]*reveal/.test(html) && !siteJs.includes('IntersectionObserver'), 'the dead scroll-reveal path is gone');
  ok(!siteJs.includes('dl-latest'), 'the non-existent #dl-latest lookup is gone');
  ok(/logo-128\.png/.test(html), 'the nav and footer use the 128 px logo');
  ok(statSync(join(root, 'public/assets/img/logo-128.png')).size * 4 < statSync(join(root, 'public/assets/img/logo.png')).size, 'the 128 px logo is far smaller than the 512 px master');
  ok(html.includes('{{year}}'), 'the source keeps the build-time year placeholder');
  ok(/<noscript>/.test(newsHtml) && /JavaScript/.test(newsHtml), 'the news page tells no-script visitors what is happening');
  ok(/<noscript>/.test(adminHtml) && /JavaScript/.test(adminHtml), 'the admin page tells no-script visitors what is happening');

  const landingCss = read('public/assets/css/landing.css');
  ok(/\.md-table\s*\{[^}]*max-width:\s*100%[^}]*overflow-x:\s*auto/.test(landingCss), 'markdown tables get a constrained horizontal scroll container');
  ok(/\.md-table:focus-visible/.test(landingCss), 'the table scroll container has a keyboard focus affordance');
  ok(/body\s*\{[^}]*overflow-x:\s*hidden/.test(landingCss), 'the landing overflow policy is unchanged');
  ok(!/class="[^"]*reveal/.test(notFoundHtml), 'the 404 page has no dead reveal markup');

  // The vendored Material Symbols file is a subset: a name it does not draw
  // renders as literal text ("article", "light_mode"). Only use verified names.
  const drawnGlyphs = new Set(['add', 'arrow_outward', 'block', 'check', 'close', 'code', 'desktop_windows', 'devices', 'download', 'download_for_offline', 'groups', 'help', 'home', 'lyrics', 'menu', 'pause', 'play_arrow', 'tune']);
  for (const [name, markup] of [['landing', html], ['news', newsHtml], ['admin', adminHtml], ['404', notFoundHtml]]) {
    const glyphs = [...markup.matchAll(/class="[^"]*material-symbols-rounded[^"]*"[^>]*>([^<]+)</g)].map((match) => match[1].trim());
    const missing = [...new Set(glyphs)].filter((glyph) => !drawnGlyphs.has(glyph));
    ok(missing.length === 0, `${name} only uses glyphs the vendored font draws`, missing.join(','));
    const toggle = markup.match(/<button[^>]*data-theme-toggle[^>]*>[\s\S]*?<\/button>/);
    ok(!!toggle && /href="#i-light"/.test(toggle[0]), `${name} theme toggle uses the SVG sprite`);
  }
}

console.log('== build stamps the year and ships the not-found contract ==');

{
  const out = mkdtempSync(join(tmpdir(), 'natune-build-'));
  execFileSync(process.execPath, [join(root, 'scripts/build.mjs')], {
    env: { ...process.env, NATUNE_SITE_OUT: out },
    stdio: 'pipe',
  });
  const year = String(new Date().getFullYear());
  const builtIndex = readFileSync(join(out, 'index.html'), 'utf8');
  ok(builtIndex.includes(`>${year}<`) && !builtIndex.includes('{{year}}'), 'the footer year is stamped in the built landing page');
  ok(readFileSync(join(out, '404.html'), 'utf8').includes(`>${year}<`), 'the built 404 page carries the year too');
  for (const file of ['404.html', 'robots.txt', 'sitemap.xml', 'admin/index.html', 'news/index.html', 'assets/css/landing.css', 'assets/js/site.js', 'assets/img/og-card.jpg', 'assets/img/logo-128.png', 'assets/previews/android-home-540.webp']) {
    ok(existsSync(join(out, file)), `the build ships ${file}`);
  }
  ok(!existsSync(join(out, 'assets/css/site.css')), 'the build does not resurrect the retired stylesheet');
  rmSync(out, { recursive: true, force: true });
}

console.log('== /news/: list, localized dates and article view ==');

const newsItems = [
  { id: 'older.md', Title: 'Older', Description: 'Old news', Author: 'Team', Date: '1793625600', Important: false, ImageURL: [] },
  { id: 'newer.md', Title: 'Newer', Description: 'New news', Author: 'Team', Date: '1793700000', Important: true, ImageURL: [] },
  { id: 'broken.md', Title: 'No date', Description: '', Author: 'Team', Date: 'not-a-date', ImageURL: [] },
];
const newsDate = (sec) => new Date(Number(sec) * 1000).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' });
const makeNewsWindow = (items, url = 'https://natune.pages.dev/news/') => {
  const dom = new JSDOM(newsHtml, { url, runScripts: 'outside-only' });
  const { window } = dom;
  window.fetch = (target) => {
    const href = String(target);
    if (href.includes('/api/news/content/')) return Promise.resolve({ ok: true, text: () => Promise.resolve('# Body\n\nText') });
    return Promise.resolve({ ok: true, json: () => Promise.resolve(items) });
  };
  window.eval(siteJs);
  window.eval(newsJs);
  return window;
};

{
  const window = makeNewsWindow(newsItems);
  await sleep(30);
  const d = window.document;
  const cards = [...d.querySelectorAll('#news-list .news-card')];
  ok(cards.length === 3, 'every announcement renders a card', String(cards.length));
  ok(cards[0].querySelector('h2').textContent.includes('Newer'), 'the list is newest first');
  ok(cards[0].querySelector('.meta').textContent.includes(newsDate(1793700000)), 'the date follows the page language', cards[0].querySelector('.meta').textContent);
  ok(cards[2].querySelector('.meta').textContent.includes('Unknown date'), 'an invalid Date is labelled, never "Invalid Date"', cards[2].querySelector('.meta').textContent);
  ok(!!cards[0].querySelector('.badge-important'), 'the important badge survives the redesign');
  ok(d.querySelector('#news-list-view h1').textContent.trim() === 'Announcements', 'the list view owns an h1');
  window.close();
}

{
  const window = makeNewsWindow(newsItems, 'https://natune.pages.dev/news/?id=older.md');
  await sleep(40);
  const d = window.document;
  ok(d.getElementById('news-list-view').hidden, 'opening an article hides the list view');
  ok(!d.getElementById('news-article-view').hidden, 'the article view shows');
  ok(d.getElementById('na-title').tagName === 'H1', 'the article title is the visible h1');
  ok(d.querySelector('#news-list-view h1').closest('[hidden]') !== null, 'the hidden list h1 leaves the accessibility tree');
  ok(d.getElementById('na-title').textContent.trim() === 'Older', 'the title is rendered');
  ok(d.title === 'Older · Natune News', 'the document title names the article', d.title);
  ok(d.getElementById('na-body').innerHTML.includes('Body'), 'the markdown body renders');
  window.close();
}

{
  const window = makeNewsWindow(newsItems, 'https://natune.pages.dev/news/?id=missing.md');
  await sleep(30);
  const d = window.document;
  ok(!d.getElementById('news-list-view').hidden && /Article not found/.test(d.getElementById('news-list').textContent), 'a missing id returns to the list with a notice');
  window.close();
}

console.log('== admin: one heading per visible view and the same design system ==');

{
  const dom = new JSDOM(adminHtml);
  const d = dom.window.document;
  ok(d.querySelectorAll('#login-view h1').length === 1, 'the login view owns an h1');
  ok(d.querySelectorAll('#editor-view h1').length === 1, 'the editor view owns an h1');
  ok(d.getElementById('login-view').hidden && d.getElementById('editor-view').hidden, 'both views start hidden until the session check');
  ok(!!d.getElementById('news-form') && !!d.getElementById('f-title') && !!d.getElementById('f-body') && !!d.getElementById('login-form'), 'the admin form ids are intact');
  ok(!/btn-outline\b/.test(adminHtml + adminJs), 'the retired button class is gone');
  ok(!/site\.css/.test(adminHtml), 'the admin page uses the redesign stylesheet');
  ok(/name="robots" content="noindex,nofollow"/.test(adminHtml), 'the admin page stays out of search');
  dom.window.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
