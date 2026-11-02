// Natune site chrome: navbar state, mobile drawer, scroll reveal, GitHub meta.
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

  // Progressive enhancement: live stars + latest versions. Fails silently.
  const stars = document.getElementById('hero-stars');
  const ver = document.getElementById('hero-version');
  const stableVer = document.getElementById('stable-ver');
  fetch('https://api.github.com/repos/NatuneGroup/ArchiveTune', { headers: { Accept: 'application/vnd.github+json' } })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => { if (d && stars) stars.textContent = d.stargazers_count.toLocaleString('en-US'); })
    .catch(() => {});
  fetch('https://api.github.com/repos/NatuneGroup/ArchiveTune/releases/latest', { headers: { Accept: 'application/vnd.github+json' } })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (d && d.tag_name) {
        if (ver) ver.textContent = d.tag_name;
        if (stableVer) stableVer.textContent = d.tag_name;
      }
    })
    .catch(() => {});
})();
