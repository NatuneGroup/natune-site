// Natune news page: list view + article view driven by /api/news static files.
// Contract mirrors the app's NewsItem model (id, Title, Description, ImageURL,
// Important, Author, Date epoch seconds).
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Minimal markdown renderer (headings, emphasis, links, lists, code, quotes).
  // Input is admin-authored; output escapes all raw HTML first.
  const md = (src) => {
    let html = esc(src);
    const blocks = html.split(/\n{2,}/);
    const out = [];
    for (let b of blocks) {
      b = b.trimEnd();
      if (!b) continue;
      if (/^```/.test(b)) {
        out.push('<pre><code>' + b.replace(/^```\w*\n?/, '').replace(/```\s*$/, '') + '</code></pre>');
        continue;
      }
      const lines = b.split('\n');
      if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
        out.push('<ul>' + lines.map((l) => '<li>' + inline(l.replace(/^\s*[-*]\s+/, '')) + '</li>').join('') + '</ul>');
        continue;
      }
      if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
        out.push('<ol>' + lines.map((l) => '<li>' + inline(l.replace(/^\s*\d+[.)]\s+/, '')) + '</li>').join('') + '</ol>');
        continue;
      }
      const h = b.match(/^(#{1,6})\s+(.*)$/s);
      if (h) {
        const lvl = Math.min(h[1].length + 1, 6); // md h1 -> page h2 (page h1 is the title)
        out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`);
        continue;
      }
      if (/^&gt;\s?/m.test(b)) {
        out.push('<blockquote>' + b.split('\n').map((l) => inline(l.replace(/^&gt;\s?/, ''))).join('<br>') + '</blockquote>');
        continue;
      }
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(b.trim())) { out.push('<hr>'); continue; }
      out.push('<p>' + inline(b).replace(/\n/g, '<br>') + '</p>');
    }
    return out.join('\n');
  };
  const inline = (s) =>
    s
      .replace(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, '<img alt="$1" src="$2" loading="lazy">')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noopener nofollow">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/~~([^~]+)~~/g, '<del>$1</del>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');

  const fmtDate = (d) => {
    const sec = typeof d === 'string' ? Number(d) : d;
    return new Date(sec * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };
  const imgArr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

  const listView = $('news-list-view');
  const articleView = $('news-article-view');

  fetch('/api/news/index.json', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
    .then((items) => {
      items = (Array.isArray(items) ? items : []).slice().sort((a, b) => Number(b.Date) - Number(a.Date));
      const params = new URLSearchParams(location.search);
      const id = params.get('id');
      if (id) {
        const item = items.find((it) => it.id === id);
        if (!item) return renderList(items, 'Article not found.');
        return renderArticle(item);
      }
      renderList(items);
    })
    .catch(() => {
      $('news-list').innerHTML = '<p class="news-state">Could not load announcements. <a href="/news/">Retry</a></p>';
    });

  function renderList(items, notice) {
    const list = $('news-list');
    if (!items.length) {
      list.innerHTML = '<p class="news-state">' + (notice || 'No announcements yet — check back soon.') + '</p>';
      return;
    }
    list.innerHTML = items
      .map(
        (it) => `<a class="news-card" href="/news/?id=${encodeURIComponent(it.id)}">
          <h3>${esc(it.Title)}${it.Important ? ' <span class="badge-important">Important</span>' : ''}</h3>
          <div class="meta">${esc(it.Author)} · ${fmtDate(it.Date)}</div>
          ${it.Description ? `<p>${esc(it.Description)}</p>` : ''}
        </a>`
      )
      .join('');
    if (notice) list.insertAdjacentHTML('afterbegin', `<p class="news-state">${esc(notice)}</p>`);
  }

  function renderArticle(item) {
    listView.hidden = true;
    articleView.hidden = false;
    document.title = item.Title + ' · Natune News';
    $('na-title').innerHTML =
      esc(item.Title) + (item.Important ? ' <span class="badge-important">Important</span>' : '');
    $('na-meta').textContent = `${item.Author} · ${fmtDate(item.Date)}`;
    $('na-images').innerHTML = imgArr(item.ImageURL)
      .map((u) => `<img src="${esc(u)}" alt="" loading="lazy">`)
      .join('');
    fetch('/api/news/content/' + encodeURIComponent(item.id), { cache: 'no-store' })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error('HTTP ' + r.status))))
      .then((text) => { $('na-body').innerHTML = md(text); })
      .catch(() => { $('na-body').innerHTML = '<p>Could not load this article.</p>'; });
  }
})();
