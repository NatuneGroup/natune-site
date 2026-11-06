// Deterministic, original Natune UI illustrations. No remote assets are used.
// Android previews are real app captures and so are the desktop Home and Library previews
// (see docs/previews.md). The desktop Player and every iOS preview stay labelled UI mocks.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const output = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets', 'previews');
mkdirSync(output, { recursive: true });
const palettes = {
  dark: { bg: '#0d140e', low: '#151d16', card: '#1b231c', high: '#29352b', ink: '#dfe5dc', muted: '#bfcabb', primary: '#9ad69b', container: '#155223', onContainer: '#b6f2b6' },
  light: { bg: '#f6fbef', low: '#f0f5e9', card: '#e4eadc', high: '#dfe5d7', ink: '#171e16', muted: '#414b3d', primary: '#326b3b', container: '#b6f2b6', onContainer: '#003911' },
};
const albums = [
  ['Greenlight', 'Natune Studio'], ['Open skies', 'Sample collection'],
  ['Night garden', 'Natune Studio'], ['Soft focus', 'Sample collection'],
  ['First light', 'Natune Studio'], ['After the rain', 'Sample collection'],
  ['Slow mornings', 'Natune Studio'], ['New horizons', 'Sample collection'],
  ['Evergreen', 'Natune Studio'], ['Quiet hours', 'Sample collection'],
  ['On the move', 'Natune Studio'], ['Room to breathe', 'Sample collection'],
];
const escape = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const rect = (x, y, w, h, r, fill, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${extra}/>`;
const text = (x, y, value, size, fill, weight = 500, extra = '') => `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" font-weight="${weight}" ${extra}>${escape(value)}</text>`;
const icon = (name, x, y, size, fill) => `<use href="#${name}" x="${x}" y="${y}" width="${size}" height="${size}" fill="${fill}"/>`;
const cover = (index, x, y, size) => `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 180 180"><use href="#art-${index % albums.length}"/></svg>`;
const definitions = () => {
  const colors = [['#426b45', '#bed799'], ['#275e65', '#b3e0cd'], ['#34424c', '#85ab82'], ['#737548', '#e2d5a1'], ['#965a39', '#f3c57e'], ['#275a48', '#a2cbb2']];
  return `<defs>
    <symbol id="note" viewBox="0 0 24 24"><path d="M10 3v12.3a3.7 3.7 0 1 0 2 3.3V7l7-2v8.3a3.7 3.7 0 1 0 2 3.3V1Z"/></symbol>
    <symbol id="home" viewBox="0 0 24 24"><path d="m12 2 10 9h-3v10h-5v-7h-4v7H5V11H2Z"/></symbol>
    <symbol id="search" viewBox="0 0 24 24"><path d="M10 3a7 7 0 1 0 4.7 12.2L21 21l1-1-6.4-6.2A7 7 0 0 0 10 3Zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z"/></symbol>
    <symbol id="library" viewBox="0 0 24 24"><path d="M3 4h2v17H3Zm4-2h2v19H7Zm4 3h10v16H11Zm2 2v12h6V7Z"/></symbol>
    <symbol id="play" viewBox="0 0 24 24"><path d="m7 3 14 9L7 21Z"/></symbol>
    <symbol id="pause" viewBox="0 0 24 24"><path d="M6 3h4v18H6Zm8 0h4v18h-4Z"/></symbol>
    <symbol id="next" viewBox="0 0 24 24"><path d="m4 4 13 8-13 8Zm14 0h3v16h-3Z"/></symbol>
    <symbol id="heart" viewBox="0 0 24 24"><path d="M12 21 3 12C-3 4 7-2 12 5 17-2 27 4 21 12Z"/></symbol>
    <symbol id="download" viewBox="0 0 24 24"><path d="M11 2h2v11l4-4 2 2-7 7-7-7 2-2 4 4ZM3 20h18v2H3Z"/></symbol>
    <symbol id="settings" viewBox="0 0 24 24"><path d="M2 5h20v2H2Zm0 6h20v2H2Zm0 6h20v2H2Z"/><circle cx="8" cy="6" r="3"/><circle cx="16" cy="12" r="3"/><circle cx="8" cy="18" r="3"/></symbol>
    <symbol id="back" viewBox="0 0 24 24"><path d="m15 3-9 9 9 9 2-2-7-7 7-7Z"/></symbol>
    ${albums.map((album, i) => {
      const [a, b] = colors[i % colors.length];
      const art = i % 3 === 0
        ? `<circle cx="90" cy="85" r="58" fill="${b}"/><path d="M0 144Q60 45 120 125T240 100V180H0Z" fill="${a}"/><path d="M0 162Q72 86 145 143T240 145V180H0Z" fill="${b}" opacity=".55"/>`
        : i % 3 === 1
          ? `<path d="M0 40 180 140M0 90 180 190M0-10 180 90" stroke="${b}" stroke-width="26" opacity=".6"/><circle cx="124" cy="52" r="31" fill="${b}"/>`
          : `<path d="M90 8 164 90 90 172 16 90Z" fill="${b}"/><circle cx="90" cy="90" r="36" fill="${a}"/><circle cx="90" cy="90" r="14" fill="${b}"/>`;
      return `<symbol id="art-${i}" viewBox="0 0 180 180">${rect(0, 0, 180, 180, 14, a)}${art}${text(14, 166, album[0].toUpperCase(), 11, '#fff', 650)}</symbol>`;
    }).join('')}
  </defs>`;
};
const svg = (width, height, label, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title"><title id="title">${escape(label)} — illustrative Natune UI, not an app screenshot</title>${definitions()}<g font-family="Arial, sans-serif">${body}</g></svg>\n`;

function desktop(view, p) {
  const nav = ['Home', 'Search', 'Library', 'Downloads', 'Settings'];
  let body = rect(0, 0, 2000, 1091, 16, p.bg) + rect(0, 0, 2000, 42, 0, p.low);
  body += icon('note', 20, 11, 21, p.primary) + text(53, 29, 'Natune', 18, p.ink, 650);
  body += text(1760, 28, '—    □    ×', 22, p.muted);
  body += rect(0, 42, 240, 940, 0, p.low);
  nav.forEach((label, i) => {
    const active = view === label.toLowerCase();
    if (active) body += rect(14, 92 + i * 62, 211, 52, 26, p.container);
    body += icon(['home', 'search', 'library', 'download', 'settings'][i], 35, 106 + i * 62, 24, active ? p.onContainer : p.muted);
    body += text(78, 126 + i * 62, label, 22, active ? p.onContainer : p.muted, active ? 650 : 500);
  });
  body += text(34, 470, 'YOUR PLAYLISTS', 14, p.muted, 650);
  ['Everyday favorites', 'Late-night focus', 'On repeat', 'Offline essentials'].forEach((label, i) => { body += text(35, 519 + i * 45, label, 18, p.muted); });
  body += rect(286, 67, 1140, 58, 29, p.card) + icon('search', 310, 84, 23, p.muted) + text(354, 104, 'Search your music and providers', 21, p.muted);
  body += rect(1850, 66, 56, 56, 28, p.container) + text(1866, 103, 'N', 25, p.onContainer, 700);
  if (view === 'player') {
    body += cover(0, 350, 209, 560) + text(1010, 265, 'NOW PLAYING', 17, p.primary, 700);
    body += text(1010, 346, 'Greenlight', 68, p.ink, 700) + text(1010, 394, 'Natune Studio · Sample collection', 25, p.muted);
    ['Every source, one player', 'Find your own rhythm', 'Take the music with you'].forEach((line, i) => { body += text(1010, 522 + i * 84, line, i === 1 ? 40 : 33, i === 1 ? p.primary : p.muted, 650); });
    body += rect(350, 829, 560, 8, 4, p.high) + rect(350, 829, 233, 8, 4, p.primary);
    body += text(350, 868, '1:42', 18, p.muted) + text(860, 868, '4:08', 18, p.muted);
    body += icon('back', 491, 887, 32, p.ink) + rect(588, 878, 70, 70, 25, p.container) + icon('pause', 609, 899, 28, p.onContainer) + icon('next', 724, 892, 28, p.ink);
  } else {
    const title = view === 'home' ? 'Made for your next listen' : 'Your library';
    body += text(286, 199, title, 44, p.ink, 700);
    const chips = view === 'home' ? ['For you', 'Discover', 'New releases', 'Moods', 'Providers'] : ['Songs', 'Albums', 'Artists', 'Playlists', 'Downloads'];
    chips.forEach((label, i) => {
      body += rect(286 + i * 175, 226, 155, 42, 21, i ? p.card : p.container) + text(310 + i * 175, 254, label, 18, i ? p.muted : p.onContainer, 600);
    });
    for (let row = 0; row < 2; row++) {
      body += text(286, 320 + row * 326, row === 0 ? (view === 'home' ? 'Your daily mix' : 'Recently added') : 'Keep listening', 27, p.ink, 650);
      for (let col = 0; col < 6; col++) {
        const i = row * 6 + col, x = 286 + col * 279, y = 345 + row * 326;
        body += cover(i, x, y, 236) + text(x, y + 266, albums[i][0], 23, p.ink, 600) + text(x, y + 295, albums[i][1], 17, p.muted);
      }
    }
  }
  body += rect(0, 986, 2000, 105, 0, p.low) + cover(0, 20, 1002, 72) + text(109, 1029, 'Greenlight', 21, p.ink, 650) + text(109, 1057, 'Natune Studio', 17, p.muted);
  body += icon('heart', 405, 1024, 23, p.primary) + icon('back', 797, 1025, 26, p.ink) + rect(887, 1004, 65, 65, 24, p.container) + icon('pause', 906, 1023, 27, p.onContainer) + icon('next', 1014, 1025, 26, p.ink);
  body += rect(1120, 1035, 550, 6, 3, p.high) + rect(1120, 1035, 226, 6, 3, p.primary) + text(1720, 1047, '1:42 / 4:08', 18, p.muted);
  return body;
}

function mobile(view, p) {
  let body = rect(46, 4, 1228, 2860, 170, '#080b08', 'stroke="#53624f" stroke-width="10"');
  body += rect(75, 30, 1170, 2804, 148, p.bg) + rect(493, 51, 334, 70, 35, '#080b08');
  body += text(161, 107, '9:41', 46, p.ink, 650) + text(1010, 107, '••• ▰', 40, p.ink);
  if (view === 'player') {
    body += icon('back', 135, 195, 60, p.ink) + text(470, 243, 'NOW PLAYING', 40, p.muted, 600);
    body += cover(0, 155, 403, 1010) + text(160, 1549, 'Greenlight', 84, p.ink, 700) + text(160, 1626, 'Natune Studio', 50, p.muted);
    body += icon('heart', 1086, 1501, 63, p.primary);
    body += rect(157, 1763, 1009, 14, 7, p.high) + rect(157, 1763, 416, 14, 7, p.primary);
    body += text(158, 1840, '1:42', 40, p.muted) + text(1064, 1840, '4:08', 40, p.muted);
    body += icon('back', 273, 1980, 86, p.ink) + rect(529, 1925, 264, 218, 68, p.container) + icon('pause', 610, 1982, 102, p.onContainer) + icon('next', 978, 1980, 86, p.ink);
    body += rect(129, 2250, 1062, 311, 62, p.card) + text(190, 2347, 'Find your own rhythm', 53, p.primary, 650) + text(190, 2436, 'Take the music with you', 47, p.muted, 600);
  } else {
    body += text(132, 279, view === 'home' ? 'Home' : 'Library', 93, p.ink, 700) + rect(1072, 206, 110, 110, 55, p.container) + text(1101, 280, 'N', 60, p.onContainer, 700);
    const chips = view === 'home' ? ['For you', 'Discover', 'Moods'] : ['Songs', 'Albums', 'Playlists'];
    chips.forEach((label, i) => { body += rect(130 + i * 355, 366, 325, 106, 53, i ? p.card : p.container) + text(176 + i * 355, 437, label, 46, i ? p.muted : p.onContainer, 600); });
    body += text(132, 610, view === 'home' ? 'Your daily mix' : 'Recently added', 65, p.ink, 700);
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 2; col++) {
        const i = row * 2 + col, x = 130 + col * 559, y = 670 + row * 655;
        body += cover(i, x, y, 500) + text(x, y + 559, albums[i][0], 47, p.ink, 650) + text(x, y + 617, albums[i][1], 34, p.muted);
      }
    }
    body += text(132, 2082, 'Pick up where you left off', 55, p.ink, 650) + cover(4, 132, 2134, 162) + text(326, 2194, 'First light', 47, p.ink, 650) + text(326, 2256, 'Natune Studio', 37, p.muted);
    body += rect(113, 2355, 1094, 152, 52, p.high) + cover(0, 132, 2376, 110) + text(274, 2413, 'Greenlight', 41, p.ink, 650) + text(274, 2468, 'Natune Studio', 32, p.muted) + icon('pause', 1040, 2401, 58, p.primary);
  }
  body += rect(112, 2578, 1098, 168, 62, p.low);
  ['home', 'search', 'library'].forEach((name, i) => {
    const active = name === view;
    if (active) body += rect(164 + i * 356, 2597, 228, 90, 45, p.container);
    body += icon(name, 248 + i * 356, 2611, 61, active ? p.onContainer : p.muted) + text(218 + i * 356, 2720, name[0].toUpperCase() + name.slice(1), 35, active ? p.primary : p.muted, 600);
  });
  body += rect(472, 2786, 376, 14, 7, p.ink);
  return body;
}

// The desktop Home and Library tiles show real 1440x900 Linux captures, so only the Player is drawn here.
// It is sketched in the old 2000x1091 space and fitted into that capture frame, so one aspect ratio covers
// every desktop view and the lightbox never jumps between them.
const DESKTOP_WIDTH = 1440;
const DESKTOP_HEIGHT = 900;
const DESKTOP_SKETCH_WIDTH = 2000;
const DESKTOP_SKETCH_HEIGHT = 1091;

function desktopIllustration(view, palette) {
  const scale = DESKTOP_WIDTH / DESKTOP_SKETCH_WIDTH;
  const offsetY = (DESKTOP_HEIGHT - DESKTOP_SKETCH_HEIGHT * scale) / 2;
  return rect(0, 0, DESKTOP_WIDTH, DESKTOP_HEIGHT, 0, palette.bg) +
    `<g transform="translate(0 ${offsetY.toFixed(3)}) scale(${scale})">${desktop(view, palette)}</g>`;
}

for (const [theme, palette] of Object.entries(palettes)) {
  for (const view of ['home', 'library', 'player']) {
    for (const device of ['desktop', 'ios']) {
      if (device === 'desktop' && view !== 'player') continue;
      const width = device === 'desktop' ? DESKTOP_WIDTH : 1320;
      const height = device === 'desktop' ? DESKTOP_HEIGHT : 2868;
      const body = device === 'desktop' ? desktopIllustration(view, palette) : mobile(view, palette);
      writeFileSync(join(output, `${device}-${view}-${theme}.svg`), svg(width, height, `Natune ${view} on ${device} (${theme})`, body));
    }
  }
}
console.log('previews: generated 8 self-contained Natune desktop/iOS illustrations');
