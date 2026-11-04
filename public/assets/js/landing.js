(() => {
  const switcher = document.querySelector('.view-switch');
  const tiles = [...document.querySelectorAll('[data-preview-device]')];
  const dialog = document.getElementById('preview-dialog');
  const previewImage = document.getElementById('preview-image');
  const original = document.getElementById('preview-original');
  const views = new Set(['home', 'library', 'player']);
  const labels = { home: 'Home', library: 'Library', player: 'Player' };
  const deviceLabels = { desktop: 'desktop', android: 'Android', ios: 'iOS' };
  let current = 'home';
  let lastFocused = null;
  let openDevice = null;

  const sourceFor = (device) => device === 'android'
    ? `/assets/previews/android-${current}.webp`
    : `/assets/previews/${device}-${current}-${document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'}.svg`;
  const altFor = (device) => `${device === 'android' ? '' : 'Illustrative '}Natune ${labels[current]} on ${deviceLabels[device]}`;
  const update = () => {
    switcher?.querySelectorAll('[data-preview-view]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.previewView === current));
    });
    tiles.forEach((tile) => {
      const image = tile.querySelector('img');
      if (!image) return;
      image.src = sourceFor(tile.dataset.previewDevice);
      image.alt = altFor(tile.dataset.previewDevice);
    });
    if (openDevice && dialog?.open) {
      previewImage.src = sourceFor(openDevice);
      previewImage.alt = altFor(openDevice);
      original.href = sourceFor(openDevice);
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
      previewImage.src = sourceFor(openDevice);
      previewImage.alt = altFor(openDevice);
      original.href = sourceFor(openDevice);
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

  const features = document.getElementById('features');
  const toggle = document.querySelector('.lyrics-toggle');
  toggle?.addEventListener('click', () => {
    const paused = features.classList.toggle('is-paused');
    toggle.setAttribute('aria-pressed', String(paused));
    toggle.setAttribute('aria-label', paused ? 'Resume lyrics animation' : 'Pause lyrics animation');
    toggle.querySelector('span').textContent = paused ? 'play_arrow' : 'pause';
  });
  if (features && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(([entry]) => {
      features.classList.toggle('is-offscreen', !entry.isIntersecting);
    });
    observer.observe(features);
  }

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
