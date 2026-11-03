// Natune site chrome: navbar state, mobile drawer, scroll reveal, GitHub meta,
// and the multi-platform download dialog.
(() => {
  const nav = document.getElementById('navbar');
  const onScroll = () => nav && nav.classList.toggle('is-scrolled', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  const burger = document.getElementById('burger');
  const drawer = document.getElementById('drawer');
  if (burger && drawer) {
    burger.addEventListener('click', () => {
      const open = drawer.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', String(open));
      burger.querySelector('use').setAttribute('href', open ? '#i-close' : '#i-menu');
    });
    drawer.addEventListener('click', (e) => {
      if (e.target.closest('a')) {
        drawer.classList.remove('is-open');
        burger.setAttribute('aria-expanded', 'false');
        burger.querySelector('use').setAttribute('href', '#i-menu');
      }
    });
  }

  const io = new IntersectionObserver(
    (entries) => entries.forEach((en) => en.isIntersecting && en.target.classList.add('is-visible')),
    { threshold: 0.12 }
  );
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

  const year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());

  // ---------- GitHub data (progressive enhancement; fails silently) ----------
  const GH_REPO = 'NatuneGroup/Natune';
  const RELEASES_URL = `https://github.com/${GH_REPO}/releases`;
  const GH_API = `https://api.github.com/repos/${GH_REPO}`;
  const GH_HEADERS = { Accept: 'application/vnd.github+json' };

  // The newest release INCLUDING prereleases: nightlies are tagged like
  // N20261103 and /releases/latest would skip them. Shared by the hero badge
  // and the download dialog so we only burn one API request.
  let releasesPromise = null;
  const loadReleases = () => {
    if (!releasesPromise) {
      releasesPromise = fetch(`${GH_API}/releases?per_page=15`, { headers: GH_HEADERS })
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => (Array.isArray(d) ? d : []))
        .catch(() => []);
    }
    return releasesPromise;
  };
  const isAppAsset = (name) => /\.(apk|ipa|dmg|deb|msi|exe|zip|appimage)$/i.test(name);
  const newestAppRelease = (list) =>
    list.find((rel) => Array.isArray(rel.assets) && rel.assets.some((a) => isAppAsset(a.name || ''))) || null;

  const stars = document.getElementById('hero-stars');
  const ver = document.getElementById('hero-version');
  const latestTag = document.getElementById('dl-latest');
  fetch(GH_API, { headers: GH_HEADERS })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => { if (d && stars) stars.textContent = d.stargazers_count.toLocaleString('en-US'); })
    .catch(() => {});
  loadReleases().then((list) => {
    const rel = newestAppRelease(list);
    if (rel && rel.tag_name) {
      if (ver) ver.textContent = rel.tag_name;
      if (latestTag) latestTag.textContent = rel.tag_name;
    }
  });

  // ---------- download dialog ----------
  const modal = document.getElementById('dlmodal');
  if (!modal) return;
  const panel = modal.querySelector('.dlmodal__panel');
  const tabs = [...modal.querySelectorAll('.dlmodal__tab')];
  const stepsEl = document.getElementById('dl-steps');
  const linksEl = document.getElementById('dl-links');
  const hintEl = document.getElementById('dl-hint');
  const subEl = document.getElementById('dlmodal-sub');
  const SUB_DEFAULT = subEl ? subEl.textContent : '';

  // Install steps + asset matching per platform. Regexes map the real asset
  // names published on NatuneGroup/Natune releases (nightly tags).
  const PLATFORMS = {
    android: {
      steps: [
        'Download the universal APK below — it suits most phones.',
        'Open the file and allow installs from your browser if Android asks.',
        'Newer builds install the same way, right over the top.',
      ],
      hint: 'The universal GMS build suits most phones — every CPU architecture, Google services included. Pick FOSS for a Google-free install, arm64 to save space, or the TV build for Android TV. Other ABIs are on the releases page.',
      assets: [
        { label: 'Universal APK — best for most phones', re: /^app-gms-mobile-universal.*\.apk$/i },
        { label: 'FOSS APK — no Google libraries', re: /^app-foss-mobile-universal.*\.apk$/i },
        { label: 'APK — arm64 phones', re: /^app-gms-mobile-arm64.*\.apk$/i },
        { label: 'APK — Android TV', re: /^app-gms-tv-universal.*\.apk$/i },
      ],
    },
    ios: {
      steps: [
        'Download the IPA below — note that it is unsigned.',
        'Sideload it with AltStore or SideStore (or your own signing tool).',
        'Re-sign or refresh the app when the certificate expires.',
      ],
      hint: 'The IPA is unsigned — installing it needs a sideloading tool such as AltStore or SideStore.',
      assets: [
        { label: 'iOS app — unsigned IPA', re: /^natune-ios-.*\.ipa$/i },
      ],
    },
    linux: {
      steps: [
        'Download the .deb (Debian/Ubuntu) or the AppImage (any distro) for your CPU.',
        '.deb: install it with your package manager. AppImage: make it executable and run it.',
        'x64 and arm64 builds are published together.',
      ],
      hint: 'Most PCs want the x64 build; arm64 covers ARM machines. The AppImage runs without installing.',
      assets: [
        { label: '.deb package — x64', re: /^natune-desktop-linux-x64-.*\.deb$/i },
        { label: 'AppImage — x64', re: /^natune-desktop-linux-x64-.*\.appimage$/i },
        { label: '.deb package — arm64', re: /^natune-desktop-linux-arm64-.*\.deb$/i },
        { label: 'AppImage — arm64', re: /^natune-desktop-linux-arm64-.*\.appimage$/i },
      ],
    },
    macos: {
      steps: [
        'Download the DMG for your Mac — Apple silicon (arm64) or Intel (x64).',
        'Open it and drag Natune into Applications.',
        'If Gatekeeper flags the unsigned build, right-click the app and choose Open.',
      ],
      hint: 'Apple silicon Macs (M1 and newer) use the arm64 DMG; older Intel Macs use x64.',
      assets: [
        { label: 'DMG — Apple silicon', re: /^natune-desktop-macos-arm64-.*\.dmg$/i },
        { label: 'DMG — Intel', re: /^natune-desktop-macos-x64-.*\.dmg$/i },
      ],
    },
    windows: {
      steps: [
        'Download the installer (.exe or .msi) — or the portable .zip.',
        'Run the installer, or unzip and start Natune.',
        'If SmartScreen warns about the unsigned build, choose "More info" → "Run anyway".',
      ],
      hint: 'The .exe and .msi both install Natune; the .zip is a portable build that needs no installer.',
      assets: [
        { label: 'Installer — .exe', re: /^natune-desktop-windows-x64-.*\.exe$/i },
        { label: 'Installer — .msi', re: /^natune-desktop-windows-x64-.*\.msi$/i },
        { label: 'Portable — .zip', re: /^natune-desktop-windows-x64-.*\.zip$/i },
      ],
    },
  };

  const detectPlatform = () => {
    const ua = navigator.userAgent || '';
    if (/android/i.test(ua)) return 'android';
    if (/iPad|iPhone|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
    if (/windows/i.test(ua)) return 'windows';
    if (/mac os|macintosh/i.test(ua)) return 'macos';
    if (/linux|x11|cros/i.test(ua)) return 'linux';
    return 'android';
  };

  // Newest release (scanning the list, which arrives newest-first) that ships
  // at least one matching asset for this platform; all links then come from
  // that one tag.
  const resolvePlatform = (list, key) => {
    for (const rel of list) {
      const assets = Array.isArray(rel.assets) ? rel.assets : [];
      const found = PLATFORMS[key].assets
        .map((d) => {
          const a = assets.find((x) => d.re.test(x.name || ''));
          return a ? { label: d.label, name: a.name, url: a.browser_download_url } : null;
        })
        .filter(Boolean);
      if (found.length) return { tag: rel.tag_name, found };
    }
    return null;
  };

  const renderSteps = (key) => {
    stepsEl.textContent = '';
    for (const s of PLATFORMS[key].steps) {
      const li = document.createElement('li');
      li.textContent = s;
      stepsEl.appendChild(li);
    }
  };

  const fallbackLink = (el) => {
    el.textContent = '';
    const p = document.createElement('p');
    p.className = 'dlmodal__hint';
    p.textContent = 'No matching build was found in the newest release. ';
    const a = document.createElement('a');
    a.href = RELEASES_URL;
    a.rel = 'noopener';
    a.textContent = 'Browse release files';
    p.appendChild(a);
    p.appendChild(document.createTextNode('.'));
    el.appendChild(p);
  };

  const renderLinks = async (key) => {
    linksEl.innerHTML = '<p class="dlmodal__hint">Loading the newest build…</p>';
    const list = await loadReleases();
    const resolved = resolvePlatform(list, key);
    linksEl.textContent = '';
    if (!resolved) {
      fallbackLink(linksEl);
      if (subEl) subEl.textContent = SUB_DEFAULT;
      return;
    }
    if (subEl) subEl.textContent = `Latest build ${resolved.tag} — pick an asset or browse all releases.`;
    for (const f of resolved.found) {
      const a = document.createElement('a');
      a.className = 'dlmodal__link';
      a.href = f.url;
      a.rel = 'noopener';
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      icon.setAttribute('class', 'icon');
      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', '#i-download');
      icon.appendChild(use);
      const textWrap = document.createElement('span');
      const b = document.createElement('b');
      b.textContent = f.label;
      const small = document.createElement('small');
      small.textContent = f.name;
      textWrap.appendChild(b);
      textWrap.appendChild(small);
      a.appendChild(icon);
      a.appendChild(textWrap);
      linksEl.appendChild(a);
    }
  };

  let current = detectPlatform();
  const selectPlatform = (key, { focus = false } = {}) => {
    current = key;
    tabs.forEach((t) => t.setAttribute('aria-pressed', String(t.dataset.platform === key)));
    renderSteps(key);
    if (hintEl) hintEl.textContent = PLATFORMS[key].hint;
    renderLinks(key);
    if (focus) {
      const active = tabs.find((t) => t.dataset.platform === key);
      if (active) active.focus();
    }
  };

  let lastFocused = null;
  const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const openDl = () => {
    lastFocused = document.activeElement;
    modal.hidden = false;
    document.body.classList.add('dl-open');
    selectPlatform(current, { focus: true });
  };
  const closeDl = () => {
    modal.hidden = true;
    document.body.classList.remove('dl-open');
    if (subEl) subEl.textContent = SUB_DEFAULT;
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  };

  document.querySelectorAll('[data-dl-open]').forEach((el) =>
    el.addEventListener('click', (e) => {
      e.preventDefault();
      openDl();
    })
  );
  modal.addEventListener('click', (e) => {
    if (e.target.closest('[data-dl-close]')) closeDl();
  });
  tabs.forEach((t) =>
    t.addEventListener('click', () => selectPlatform(t.dataset.platform))
  );
  document.addEventListener('keydown', (e) => {
    if (modal.hidden) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeDl();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = [...panel.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
})();
