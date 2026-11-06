// Natune news page: list view + article view driven by /api/news static files.
// Contract mirrors the app's NewsItem model (id, Title, Description, ImageURL,
// Important, Author, Date epoch seconds).
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Markdown renderer: marked parses, DOMPurify sanitizes the generated HTML.
  // Both are vendored under /assets/vendor/ (see that README for versions/licenses).
  // Raw HTML in the source is escaped, never emitted; links and images only
  // allow http(s) and relative URLs; links get rel="noopener noreferrer".
  const isSafeUrl = (href) => {
    if (typeof href !== 'string') return false;
    // Browsers ignore ASCII whitespace/control chars inside URLs; strip them
    // before the scheme check so "java\tscript:" can't slip through.
    const clean = href.trim().replace(/[\s\x00-\x1f]+/g, '');
    if (!clean) return false;
    if (clean.startsWith('//')) return true; // scheme-relative resolves to http(s)
    const scheme = clean.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
    if (!scheme) return true; // relative URL (path, query or fragment only)
    return scheme[1].toLowerCase() === 'http' || scheme[1].toLowerCase() === 'https';
  };

  if (typeof marked !== 'undefined') {
    marked.use({
      gfm: true,
      breaks: false,
      renderer: {
        heading({ tokens, depth }) {
          const text = this.parser.parseInline(tokens);
          const lvl = Math.min(depth + 1, 6); // md h1 -> page h2 (page h1 is the title)
          return `<h${lvl}>${text}</h${lvl}>\n`;
        },
        link({ href, title, tokens }) {
          const text = this.parser.parseInline(tokens);
          if (!isSafeUrl(href)) return text;
          const t = title ? ` title="${esc(title)}"` : '';
          return `<a href="${esc(href)}"${t} rel="noopener noreferrer">${text}</a>`;
        },
        image({ href, title, text }) {
          if (!isSafeUrl(href)) return esc(text || '');
          const t = title ? ` title="${esc(title)}"` : '';
          return `<img src="${esc(href)}" alt="${esc(text || '')}"${t} loading="lazy">`;
        },
        // Raw HTML is disabled: render it as visible source text instead.
        html({ text }) { return esc(text); },
      },
    });
  }
  if (typeof DOMPurify !== 'undefined') {
    // Belt and suspenders: any <a> that survives sanitization keeps the rel.
    DOMPurify.addHook('afterSanitizeAttributes', (node) => {
      if (node.tagName === 'A') node.setAttribute('rel', 'noopener noreferrer');
    });
  }
  const sanitize = (html) =>
    DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ['style', 'form', 'input', 'textarea', 'select', 'option', 'button', 'iframe', 'object', 'embed', 'link', 'meta', 'base'],
      FORBID_ATTR: ['style'],
    });
  // Sanitized markdown can contain a table wider than the article column. The
  // wrapper is added after sanitization (trusted markup), is scrollable and
  // takes focus so keyboard users can reach every column.
  const scrollableTables = (html) => {
    const template = document.createElement('template');
    template.innerHTML = html;
    template.content.querySelectorAll('table').forEach((table) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'md-table';
      wrapper.tabIndex = 0;
      wrapper.setAttribute('role', 'region');
      wrapper.setAttribute('aria-label', 'Table, scroll sideways to see every column');
      table.replaceWith(wrapper);
      wrapper.appendChild(table);
    });
    return template.innerHTML;
  };
  const md = (src) => {
    if (typeof marked === 'undefined' || typeof DOMPurify === 'undefined') {
      // Vendor scripts blocked/missing: text-only fallback, never unsanitized HTML.
      return '<p>' + esc(String(src)).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>') + '</p>';
    }
    return scrollableTables(sanitize(marked.parse(String(src))));
  };

  const dateLocale = document.documentElement.lang || 'en-GB';
  const fmtDate = (value) => {
    const sec = typeof value === 'string' ? Number(value) : value;
    if (!Number.isFinite(sec) || sec <= 0) return 'Unknown date';
    return new Date(sec * 1000).toLocaleDateString(dateLocale, { day: 'numeric', month: 'short', year: 'numeric' });
  };
  const imgArr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
  const timestamp = (item) => {
    const sec = Number(item.Date);
    return Number.isFinite(sec) && sec > 0 ? sec : 0;
  };

  const listView = $('news-list-view');
  const articleView = $('news-article-view');

  fetch('/api/news/index.json', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
    .then((items) => {
      items = (Array.isArray(items) ? items : []).slice().sort((a, b) => timestamp(b) - timestamp(a));
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
          <h2>${esc(it.Title)}${it.Important ? ' <span class="badge-important">Important</span>' : ''}</h2>
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
      .filter(isSafeUrl)
      .map((u) => `<img src="${esc(u)}" alt="" loading="lazy">`)
      .join('');
    fetch('/api/news/content/' + encodeURIComponent(item.id), { cache: 'no-store' })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error('HTTP ' + r.status))))
      .then((text) => { $('na-body').innerHTML = md(text); })
      .catch(() => { $('na-body').innerHTML = '<p>Could not load this article.</p>'; });
  }
})();
