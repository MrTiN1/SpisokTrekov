(() => {
  'use strict';

  const DATA = window.ARTISTS_DATA;
  const $ = (selector) => document.querySelector(selector);
  const els = {
    grid: $('#artistGrid'), search: $('#search'), sort: $('#sort'),
    results: $('#resultsInfo'), loadMore: $('#loadMore'), loadCounter: $('#loadCounter'),
    empty: $('#emptyState'), reset: $('#resetSearch'), error: $('#errorMessage'),
    toast: $('#toast'), toastText: $('#toastText'), heroCount: $('#heroCount'),
    filters: [...document.querySelectorAll('[data-filter]')],
  };
  const KEY = 'm3rzo_artists_favorites_v1';
  const PAGE_SIZE = 64;
  const collator = new Intl.Collator('ru', { sensitivity: 'base', numeric: true });
  let favorites;
  try { favorites = new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); }
  catch { favorites = new Set(); }
  let filter = 'all';
  let shown = PAGE_SIZE;
  let visible = [];
  let toastTimeout;

  const text = (id, value) => { const el = $('#' + id); if (el) el.textContent = String(value); };
  const normalize = (value) => String(value).toLocaleLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replaceAll('ё', 'е').trim();

  if (!DATA || !Array.isArray(DATA.cis) || !Array.isArray(DATA.world) || !Array.isArray(DATA.popular)) {
    if (els.error) {
      els.error.hidden = false;
      els.error.textContent = 'Не удалось загрузить каталог. Проверьте файл artists-data.js и перезагрузите страницу.';
    }
    return;
  }

  const sets = {
    cis: new Set(DATA.cis),
    world: new Set(DATA.world),
    popular: new Set(DATA.popular)
  };
  const all = [...new Set([...DATA.cis, ...DATA.world])];
  const sourceOrder = new Map(all.map((name, idx) => [name, idx]));
  // Keep only names in the published data; preserve favorites across upstream updates.
  favorites = new Set([...favorites].filter(name => sourceOrder.has(name)));

  text('statAll', all.length.toLocaleString('ru-RU'));
  text('statPopular', sets.popular.size.toLocaleString('ru-RU'));
  text('statCis', sets.cis.size.toLocaleString('ru-RU'));
  text('statWorld', sets.world.size.toLocaleString('ru-RU'));
  text('tabAll', all.length);
  text('tabPopular', sets.popular.size);
  text('tabCis', sets.cis.size);
  text('tabWorld', sets.world.size);
  text('heroCount', all.length.toLocaleString('ru-RU'));

  function storeFavorites() {
    try { localStorage.setItem(KEY, JSON.stringify([...favorites])); } catch { /* private browsing */ }
  }

  function showToast(message, success = true) {
    els.toastText.textContent = message;
    const check = els.toast.querySelector('.toast-tick');
    if (check) check.textContent = success ? '✓' : '!';
    els.toast.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => els.toast.classList.remove('show'), 1900);
  }

  async function copyName(name, card) {
    let copied = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(name);
        copied = true;
      }
    } catch { /* try fallback */ }
    if (!copied) {
      const input = document.createElement('textarea');
      input.value = name;
      input.setAttribute('readonly', '');
      input.style.position = 'fixed';
      input.style.left = '-9999px';
      document.body.append(input);
      input.select();
      try { copied = document.execCommand('copy'); }
      catch { copied = false; }
      input.remove();
    }
    if (copied) {
      card.classList.add('just-copied');
      setTimeout(() => card.isConnected && card.classList.remove('just-copied'), 1000);
      showToast(`СКОПИРОВАНО: ${name}`);
    } else {
      showToast('НЕ УДАЛОСЬ СКОПИРОВАТЬ. ПРОВЕРЬТЕ РАЗРЕШЕНИЯ БРАУЗЕРА.', false);
    }
  }

  function createCard(name, idx) {
    const card = document.createElement('article');
    card.className = 'artist-card';
    card.dataset.name = name;
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'artist-copy';
    copy.setAttribute('aria-label', `Скопировать имя: ${name}`);
    const number = document.createElement('span');
    number.className = 'index';
    number.textContent = String(idx + 1).padStart(3, '0');
    const label = document.createElement('span');
    label.className = 'artist-name';
    label.textContent = name;
    const icon = document.createElement('span');
    icon.className = 'copy-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '⧉';
    copy.append(number, label, icon);

    const fave = document.createElement('button');
    fave.type = 'button';
    fave.className = 'favorite-btn' + (favorites.has(name) ? ' is-fav' : '');
    fave.textContent = favorites.has(name) ? '★' : '☆';
    fave.setAttribute('aria-pressed', String(favorites.has(name)));
    fave.setAttribute('aria-label', favorites.has(name) ? `Удалить ${name} из избранного` : `Добавить ${name} в избранное`);
    fave.title = favorites.has(name) ? 'Убрать из избранного' : 'В избранное';

    copy.addEventListener('click', () => copyName(name, card));
    fave.addEventListener('click', () => {
      if (favorites.has(name)) favorites.delete(name); else favorites.add(name);
      storeFavorites();
      text('tabFavorites', favorites.size);
      showToast(favorites.has(name) ? 'ДОБАВЛЕНО В ИЗБРАННОЕ' : 'УДАЛЕНО ИЗ ИЗБРАННОГО');
      if (filter === 'favorites') render(true);
      else {
        fave.textContent = favorites.has(name) ? '★' : '☆';
        fave.classList.toggle('is-fav', favorites.has(name));
        fave.setAttribute('aria-pressed', String(favorites.has(name)));
        fave.setAttribute('aria-label', favorites.has(name) ? `Удалить ${name} из избранного` : `Добавить ${name} в избранное`);
      }
    });
    card.append(copy, fave);
    return card;
  }

  function updateTabs() {
    for (const btn of els.filters) {
      const active = btn.dataset.filter === filter;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    }
    text('tabFavorites', favorites.size);
  }

  function filteredNames() {
    const search = normalize(els.search.value);
    let names = all;
    if (filter === 'popular') names = all.filter(name => sets.popular.has(name));
    if (filter === 'cis') names = DATA.cis;
    if (filter === 'world') names = DATA.world;
    if (filter === 'favorites') names = all.filter(name => favorites.has(name));
    if (search) names = names.filter(name => normalize(name).includes(search));
    const sort = els.sort.value;
    if (sort === 'az') names = [...names].sort(collator.compare);
    if (sort === 'za') names = [...names].sort((a, b) => collator.compare(b, a));
    // Keep the original upstream order by default.
    if (sort === 'default' && filter === 'all') names = [...names].sort((a,b) => sourceOrder.get(a) - sourceOrder.get(b));
    return names;
  }

  function render(resetPage = false) {
    if (resetPage) shown = PAGE_SIZE;
    visible = filteredNames();
    updateTabs();
    const page = visible.slice(0, shown);
    els.grid.replaceChildren();
    const fragment = document.createDocumentFragment();
    page.forEach((name, idx) => fragment.append(createCard(name, idx)));
    els.grid.append(fragment);
    els.empty.hidden = visible.length !== 0;
    els.loadMore.hidden = page.length >= visible.length;
    els.results.textContent = `НАЙДЕНО: ${visible.length.toLocaleString('ru-RU')} / ПОКАЗАНО: ${page.length.toLocaleString('ru-RU')}`;
    els.loadCounter.textContent = visible.length ? `ОТОБРАЖЕНО ${page.length} ИЗ ${visible.length}` : '';
  }

  els.search.addEventListener('input', () => render(true));
  els.sort.addEventListener('change', () => render(true));
  els.filters.forEach(btn => btn.addEventListener('click', () => {
    filter = btn.dataset.filter;
    render(true);
  }));
  els.loadMore.addEventListener('click', () => {
    const previous = shown;
    shown += PAGE_SIZE;
    render();
    // Keep scroll stable; screen reader will announce number shown.
    const firstNew = els.grid.children[previous];
    if (firstNew) firstNew.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  els.reset.addEventListener('click', () => {
    els.search.value = '';
    els.sort.value = 'default';
    filter = 'all';
    render(true);
    els.search.focus();
  });
  document.addEventListener('keydown', event => {
    const target = event.target;
    const typing = target instanceof HTMLElement && (target.matches('input,textarea,select') || target.isContentEditable);
    if (((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') || (event.key === '/' && !typing)) {
      event.preventDefault();
      els.search.focus();
      els.search.select();
      document.querySelector('#catalog')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (event.key === 'Escape' && document.activeElement === els.search) {
      if (els.search.value) { els.search.value = ''; render(true); }
      else els.search.blur();
    }
  });
  render(true);
})();
