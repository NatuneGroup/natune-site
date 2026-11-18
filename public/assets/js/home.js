// Homepage live data: the opt-in listener count and the newest news posts. Both are optional: on any
// failure the static text in index.html stays. Text is set with textContent only.
(() => {
  'use strict';

  const LISTENERS_URL = 'https://status.natune.app/api/listeners/active';
  const NEWS_URL = '/api/news/index.json';

  const count = document.getElementById('live-count');
  const label = document.getElementById('live-label');
  const where = document.getElementById('live-where');
  fetch(LISTENERS_URL, { headers: { Accept: 'application/json' } })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (!d || !Number.isFinite(d.activeListeners) || !count) return;
      const n = Math.max(0, Math.floor(d.activeListeners));
      count.textContent = n.toLocaleString('en-US');
      label.textContent = n === 1 ? 'person listening now' : 'people listening now';
      const countries = Array.isArray(d.countries) ? d.countries.length : 0;
      if (where && countries > 0) {
        const more = d.otherCountryListeners > 0;
        where.textContent = `in ${countries}${more ? '+' : ''} ${countries === 1 && !more ? 'country' : 'countries'} · map`;
      }
    })
    .catch(() => {});

  const list = document.getElementById('home-news');
  const latest = document.getElementById('live-news-title');
  const safeId = (id) => typeof id === 'string' && /^[A-Za-z0-9._-]+$/.test(id);
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  };
  fetch(NEWS_URL)
    .then((r) => (r.ok ? r.json() : null))
    .then((items) => {
      if (!Array.isArray(items) || !list) return;
      const posts = items
        .filter((it) => it && safeId(it.id) && typeof it.Title === 'string')
        .map((it) => ({ ...it, when: Number(it.Date) * 1000 }))
        .sort((a, b) => (b.when || 0) - (a.when || 0))
        .slice(0, 3);
      if (!posts.length) return;
      if (latest) latest.textContent = posts[0].Title;
      const linkTo = (it) => `/news/?id=${encodeURIComponent(it.id)}`;
      const top = document.getElementById('live-news');
      if (top) top.href = linkTo(posts[0]);
      list.replaceChildren(...posts.map((it) => {
        const li = el('li');
        const a = el('a');
        a.href = linkTo(it);
        if (it.Important === true) a.append(el('span', 'h-news__pin', 'Important'));
        if (Number.isFinite(it.when) && it.when > 0) {
          const t = el('time', null, new Date(it.when).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }));
          t.dateTime = new Date(it.when).toISOString();
          a.append(t);
        }
        a.append(el('b', null, it.Title));
        if (typeof it.Description === 'string' && it.Description) a.append(el('p', null, it.Description));
        li.append(a);
        return li;
      }));
    })
    .catch(() => {});
})();
