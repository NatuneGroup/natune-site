(() => {
  const root = document.documentElement;
  const preference = window.matchMedia?.('(prefers-color-scheme: light)');
  let saved = null;
  try {
    const value = localStorage.getItem('natune-theme');
    if (value === 'light' || value === 'dark') saved = value;
  } catch {}

  const applyTheme = (theme) => {
    root.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'light' ? '#f6fbef' : '#0d140e';
    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      const label = `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`;
      button.setAttribute('aria-label', label);
      button.title = label;
      button.querySelector('use')?.setAttribute('href', theme === 'dark' ? '#i-light' : '#i-dark');
    });
    document.dispatchEvent(new Event('natune-theme-change'));
  };
  const systemTheme = () => preference?.matches ? 'light' : 'dark';
  applyTheme(saved || systemTheme());
  preference?.addEventListener('change', () => {
    if (!saved) applyTheme(systemTheme());
  });
  const bind = () => {
    applyTheme(root.dataset.theme);
    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        saved = root.dataset.theme === 'dark' ? 'light' : 'dark';
        try { localStorage.setItem('natune-theme', saved); } catch {}
        applyTheme(saved);
      });
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();
})();
