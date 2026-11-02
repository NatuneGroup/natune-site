// Natune news admin client. Talks to /api/admin/* Pages Functions.
// Session is an HttpOnly cookie; no credentials are stored client-side.
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const msg = (el, text, ok) => { el.textContent = text || ''; el.className = 'admin-msg' + (text ? (ok ? ' is-ok' : ' is-error') : ''); };
  const api = (path, opts) =>
    fetch('/api/admin/' + path, { credentials: 'same-origin', ...opts })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw Object.assign(new Error(body.error || 'HTTP ' + r.status), { status: r.status });
        return body;
      });

  const loginView = $('login-view');
  const editorView = $('editor-view');
  let items = [];

  const show = (which) => {
    loginView.hidden = which !== 'login';
    editorView.hidden = which !== 'editor';
  };

  // ---- session check ----
  api('news').then((d) => { items = d.items || []; show('editor'); renderList(); })
    .catch(() => show('login'));

  // ---- login ----
  $('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    msg($('login-msg'), 'Signing in…', true);
    api('login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: $('pw').value }),
    })
      .then(() => api('news'))
      .then((d) => { items = d.items || []; msg($('login-msg'), ''); show('editor'); renderList(); })
      .catch((err) => {
        msg($('login-msg'), err.status === 429
          ? 'Too many attempts — try again later.'
          : (err.status === 401 ? 'Wrong password.' : 'Sign-in failed: ' + err.message));
      });
  });

  $('btn-logout').addEventListener('click', () => {
    api('logout', { method: 'POST' }).finally(() => { show('login'); $('pw').value = ''; });
  });
  $('btn-refresh').addEventListener('click', loadItems);

  function loadItems() {
    api('news').then((d) => { items = d.items || []; renderList(); msg($('editor-msg'), ''); })
      .catch((e) => msg($('editor-msg'), 'Load failed: ' + e.message));
  }

  const fmtDate = (d) => new Date(Number(d) * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  function renderList() {
    const el = $('items');
    if (!items.length) { el.innerHTML = '<p class="muted">No announcements yet.</p>'; return; }
    el.innerHTML = items.map((it) => `
      <div class="admin-item">
        <b>${esc(it.Title)} ${it.Important ? '<span class="badge-important">Important</span>' : ''}</b>
        <span class="meta">${esc(it.id)} · ${fmtDate(it.Date)}</span>
        <button class="btn btn-tonal btn-sm" data-edit="${esc(it.id)}" type="button">Edit</button>
        <button class="btn btn-outline btn-sm" data-del="${esc(it.id)}" type="button">Delete</button>
      </div>`).join('');
    el.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => startEdit(b.dataset.edit)));
    el.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => del(b.dataset.del)));
  }

  // ---- form ----
  const formCard = $('form-card');
  $('btn-new').addEventListener('click', () => {
    $('form-title').textContent = 'New announcement';
    $('f-id').value = ''; $('f-title').value = ''; $('f-desc').value = '';
    $('f-author').value = 'Natune Team'; $('f-images').value = '';
    $('f-important').checked = false; $('f-body').value = '';
    msg($('form-msg'), '');
    formCard.hidden = false; $('f-title').focus();
  });
  $('btn-cancel').addEventListener('click', () => { formCard.hidden = true; });

  function startEdit(id) {
    const it = items.find((x) => x.id === id);
    if (!it) return;
    $('form-title').textContent = 'Edit: ' + it.id;
    $('f-id').value = it.id;
    $('f-title').value = it.Title || '';
    $('f-desc').value = it.Description || '';
    $('f-author').value = it.Author || '';
    $('f-images').value = (Array.isArray(it.ImageURL) ? it.ImageURL : it.ImageURL ? [it.ImageURL] : []).join('\n');
    $('f-important').checked = !!it.Important;
    msg($('form-msg'), 'Loading body…', true);
    formCard.hidden = false;
    api('content?id=' + encodeURIComponent(id))
      .then((d) => { $('f-body').value = d.body || ''; msg($('form-msg'), ''); })
      .catch((e) => msg($('form-msg'), 'Could not load body: ' + e.message));
  }

  $('news-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = $('f-id').value;
    const images = $('f-images').value.split('\n').map((s) => s.trim()).filter(Boolean);
    const payload = {
      title: $('f-title').value.trim(),
      description: $('f-desc').value.trim(),
      author: $('f-author').value.trim(),
      imageUrls: images,
      important: $('f-important').checked,
      body: $('f-body').value,
    };
    msg($('form-msg'), 'Publishing to GitHub…', true);
    $('btn-save').disabled = true;
    const req = id
      ? api('news?id=' + encodeURIComponent(id), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      : api('news', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    req.then((d) => {
      msg($('form-msg'), 'Published — the site redeploys in about a minute.', true);
      formCard.hidden = true;
      loadItems();
    })
      .catch((e2) => msg($('form-msg'), 'Publish failed: ' + e2.message))
      .finally(() => { $('btn-save').disabled = false; });
  });

  function del(id) {
    if (!confirm(`Delete "${id}"? This removes the announcement from the app and site.`)) return;
    api('news?id=' + encodeURIComponent(id), { method: 'DELETE' })
      .then(() => { msg($('editor-msg'), 'Deleted.', true); loadItems(); })
      .catch((e) => msg($('editor-msg'), 'Delete failed: ' + e.message));
  }
})();
