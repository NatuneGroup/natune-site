(() => {
  const switcher = document.querySelector('.view-switch');
  const tiles = [...document.querySelectorAll('[data-preview-device]')];
  const dialog = document.getElementById('preview-dialog');
  const previewImage = document.getElementById('preview-image');
  const original = document.getElementById('preview-original');
  const desktopDetail = document.querySelector('[data-preview-detail]');
  const views = new Set(['home', 'library', 'player']);
  const labels = { home: 'Home', library: 'Library', player: 'Player' };
  const deviceLabels = { desktop: 'desktop', android: 'Android', ios: 'iOS' };
  // Desktop Home and Library are real captures of the packaged N20261103 Linux build, both light, so they carry
  // their own alt text and source set and never follow the light/dark theme. Playback could not be captured, so the
  // desktop Player stays a labelled illustration and keeps its theme pair, as does every iOS view.
  const CAPTURE_SIZES = '(min-width: 1180px) 620px, (min-width: 720px) 56vw, 92vw';
  const desktopCaptures = {
    home: {
      src: '/assets/previews/desktop-home-linux-1440.webp',
      srcset: '/assets/previews/desktop-home-linux-720.webp 720w, /assets/previews/desktop-home-linux-1440.webp 1440w',
      sizes: CAPTURE_SIZES,
      alt: 'Natune Home on Linux, running the N20261103 desktop build: Quick picks and Trending community playlists from the anonymous YouTube Music feed, beside the Home, Search and Library rail',
      detail: 'Linux build N20261103 · real app capture',
    },
    library: {
      src: '/assets/previews/desktop-library-linux-1440.webp',
      srcset: '/assets/previews/desktop-library-linux-720.webp 720w, /assets/previews/desktop-library-linux-1440.webp 1440w',
      sizes: CAPTURE_SIZES,
      alt: 'Natune Library on Linux, running the N20261103 desktop build: the empty light Library with the Library, Playlists, Songs, Artists and Albums filters and the Liked songs, Offline, Cached, Local Files, My top 50 and Uploads tiles',
      detail: 'Linux build N20261103 · real app capture',
    },
  };
  const ILLUSTRATED_DETAIL = 'Windows/Linux/macOS · illustrative preview';
  let current = 'home';
  let lastFocused = null;
  let openDevice = null;

  const illustration = (device) => `/assets/previews/${device}-${current}-${document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'}.svg`;
  const presentationFor = (device) => {
    if (device === 'desktop') {
      return desktopCaptures[current] || {
        src: illustration('desktop'),
        alt: `Illustrative Natune ${labels[current]} on desktop`,
        detail: ILLUSTRATED_DETAIL,
      };
    }
    if (device === 'android') {
      return { src: `/assets/previews/android-${current}.webp`, alt: `Natune ${labels[current]} on Android` };
    }
    return { src: illustration(device), alt: `Illustrative Natune ${labels[current]} on ${deviceLabels[device]}` };
  };
  const applyCapture = (image, source) => {
    // The source set is swapped first: a capture keeps its candidates, an illustration drops them, so the element
    // never re-selects a stale candidate after the `src` changes.
    if (source.srcset) {
      image.setAttribute('srcset', source.srcset);
      image.setAttribute('sizes', source.sizes);
    } else {
      image.removeAttribute('srcset');
      image.removeAttribute('sizes');
    }
    if (image.getAttribute('src') !== source.src) {
      image.classList.add('is-loading');
      image.addEventListener('load', () => image.classList.remove('is-loading'), { once: true });
      image.src = source.src;
    }
    image.alt = source.alt;
  };
  const update = () => {
    switcher?.querySelectorAll('[data-preview-view]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.previewView === current));
    });
    tiles.forEach((tile) => {
      const image = tile.querySelector('img');
      if (!image) return;
      applyCapture(image, presentationFor(tile.dataset.previewDevice));
    });
    if (desktopDetail) desktopDetail.textContent = presentationFor('desktop').detail;
    if (openDevice && dialog?.open) {
      const source = presentationFor(openDevice);
      previewImage.src = source.src;
      previewImage.alt = source.alt;
      original.href = source.src;
    }
  };
  switcher?.addEventListener('click', (event) => {
    const key = event.target.closest('[data-preview-view]')?.dataset.previewView;
    if (!views.has(key)) return;
    current = key;
    update();
  });
  document.addEventListener('natune-theme-change', update);
  update();

  tiles.forEach((tile) => {
    tile.addEventListener('click', () => {
      if (!dialog?.showModal) return;
      lastFocused = tile;
      openDevice = tile.dataset.previewDevice;
      const source = presentationFor(openDevice);
      previewImage.src = source.src;
      previewImage.alt = source.alt;
      original.href = source.src;
      dialog.setAttribute('aria-label', `${deviceLabels[openDevice]} · ${labels[current]} preview`);
      dialog.classList.remove('preview-dialog--desktop', 'preview-dialog--android', 'preview-dialog--ios');
      dialog.classList.add(`preview-dialog--${openDevice}`);
      dialog.showModal();
      document.body.classList.add('preview-open');
    });
  });
  dialog?.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog?.addEventListener('close', () => {
    openDevice = null;
    document.body.classList.remove('preview-open');
    lastFocused?.focus({ preventScroll: true });
  });


  const navLinks = [...document.querySelectorAll('.navbar__links a[href*="#"], .navbar__drawer a[href*="#"]')];
  if ('IntersectionObserver' in window) {
    const visible = new Map();
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => visible.set(entry.target.id, entry.isIntersecting));
      const active = [...visible].find(([, shown]) => shown)?.[0];
      navLinks.forEach((link) => {
        if (active && link.hash === `#${active}`) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    }, { rootMargin: '-96px 0px -45% 0px' });
    ['showcase', 'features', 'platforms', 'faq'].forEach((id) => {
      const section = document.getElementById(id);
      if (section) observer.observe(section);
    });
  }
})();
