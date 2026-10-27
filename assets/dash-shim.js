// Minimal stand-in for the Claude dashboard runtime, so the same page code runs on a plain website.
// Loads the JSON data files, runs the page's calculations and redraws on data, filter and width changes.
(function () {
  const SOURCES = {
    videos: 'data/videos.json',
    history: 'data/history.json',
    yt_monthly: 'data/yt_monthly.json',
    vk_week: 'data/vk_week.json',
  };
  const store = {};
  const calcs = [];
  const listeners = [];
  let params = {};
  let ready = false;

  const asRows = (json) => (Array.isArray(json) ? json : json && (json.rows || json.data || json.results)) || [];
  const status = (id) => store[id] || { status: 'loading', data: [], columns: [], meta: [] };

  function runCalcs() {
    for (const c of calcs) {
      try {
        const inputs = c.inputs.map((id) => (store[id] && store[id].status === 'ok' ? store[id].data : null));
        if (inputs.some((x) => x === null)) { store[c.id] = { status: 'loading', data: [], columns: [], meta: [] }; continue; }
        const data = c.fn(...inputs);
        store[c.id] = { status: 'ok', data, columns: Array.isArray(data) && data[0] ? Object.keys(data[0]) : [], meta: [] };
      } catch (e) {
        console.error('calc failed', c.id, e);
        store[c.id] = { status: 'error', data: [], columns: [], meta: [], message: String(e) };
      }
    }
  }

  function redraw() {
    for (const fn of listeners) {
      try { fn(); } catch (e) { console.error(e); }
    }
  }

  window.dash = {
    colors: ['#3f72d6', '#e0703f', '#3fa672', '#9b6ad6', '#d6a23f', '#3fb3c4', '#d65a8a', '#7a8a99'],
    data: (id) => status(id),
    onData: (fn) => { listeners.push(fn); try { fn(); } catch (e) { console.error(e); } },
    calc: (id, def) => { calcs.push({ id, inputs: def.inputs, fn: def.fn }); },
    loader: () => {},
    params: () => ({ ...params }),
    setParams: (p) => { params = { ...params, ...p }; for (const k in params) if (params[k] == null) delete params[k]; if (ready) redraw(); },
    resetParams: () => { params = {}; if (ready) redraw(); },
    setLink: () => {},
    refresh: () => {},
  };

  async function load() {
    await Promise.all(Object.entries(SOURCES).map(async ([id, url]) => {
      try {
        const r = await fetch(url, { cache: 'no-cache' });
        if (!r.ok) throw new Error(r.status + ' ' + url);
        const rows = asRows(await r.json());
        store[id] = { status: 'ok', data: rows, columns: rows[0] ? Object.keys(rows[0]) : [], meta: [] };
      } catch (e) {
        console.error('load failed', id, e);
        store[id] = { status: 'error', data: [], columns: [], meta: [], message: String(e) };
      }
    }));
    runCalcs();
    ready = true;
    document.querySelectorAll('.dash-skeleton').forEach((el) => el.classList.remove('dash-skeleton'));
    redraw();
    try {
      const m = await fetch('data/meta.json', { cache: 'no-cache' }).then((r) => r.json());
      const el = document.getElementById('site-updated');
      if (el && m.updated) el.textContent = 'Данные обновлены ' + m.updated.split('-').reverse().join('.');
    } catch (e) { /* no meta file */ }
  }

  let lastW = 0, t;
  window.addEventListener('resize', () => {
    clearTimeout(t);
    t = setTimeout(() => { if (ready && Math.abs(window.innerWidth - lastW) > 4) { lastW = window.innerWidth; redraw(); } }, 150);
  });
  lastW = window.innerWidth;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load); else load();
})();
