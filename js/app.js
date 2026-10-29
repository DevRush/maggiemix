/* ============================================================
   MaggieMix — app logic
   Plain browser JS, no build step, no framework.
   Data comes from js/recipes.js (global RECIPES, never mutated).
   ============================================================ */
(function () {
  'use strict';

  // ---------- Constants ----------
  const FAV_KEY = 'maggiemix:favorites';
  const SITE_URL = 'https://maggiemix.com/';
  const DESKTOP = window.matchMedia('(min-width: 1024px)');

  const PROTEIN = {
    chicken: { cls: 'card-chicken', label: 'Chicken' },
    meat:    { cls: 'card-meat',    label: 'Meat' },
    veg:     { cls: 'card-veg',     label: 'Veg' },
  };
  const TYPE_LABEL = { rice: 'Rice', saalan: 'Saalan', sides: 'Side', snacks: 'Snack' };
  const EFFORT = {
    quick:     { level: 1, label: 'Quick' },
    medium:    { level: 2, label: 'Medium' },
    elaborate: { level: 3, label: 'Elaborate' },
  };
  // Active-pill colour per filter value (CSS classes live in css/styles.css)
  const ACTIVE_CLASS = {
    protein: { all: 'active-all', chicken: 'active-chicken', meat: 'active-meat', veg: 'active-veg' },
    type:    { all: 'active-all', rice: 'active-rice', saalan: 'active-saalan', sides: 'active-sides', snacks: 'active-snacks' },
    effort:  { all: 'active-all', quick: 'active-quick', medium: 'active-medium', elaborate: 'active-elaborate' },
  };
  const ALL_ACTIVE_CLASSES = Object.values(ACTIVE_CLASS).flatMap(m => Object.values(m));

  // ---------- DOM ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const el = {
    grid: $('#recipeGrid'),
    empty: $('#emptyState'),
    emptyQuery: $('#emptyQuery'),
    counters: $$('.recipe-count'),
    filters: $('#filters'),
    detailPanel: $('#detailPanel'),
    detailEmpty: $('#detailEmpty'),
    detailContent: $('#detailContent'),
    sheet: $('#sheetPanel'),
    sheetBackdrop: $('#sheetBackdrop'),
    sheetContent: $('#sheetContent'),
    searchInputs: $$('.search-input'),
    toast: $('#toast'),
  };

  // ---------- State ----------
  // Display order is shuffled once per page load so the homepage feels fresh;
  // ids (not positions) are the source of truth for everything else.
  const recipes = shuffle(RECIPES.slice());
  const byId = new Map(recipes.map(r => [r.id, r]));
  const state = {
    protein: 'all', type: 'all', effort: 'all',
    query: '',
    favoritesOnly: false,
    selectedId: null,   // recipe shown in the detail panel / sheet
    pickedId: null,     // recipe chosen by "Pick For Me" (gets the glow)
  };
  let favorites = loadFavorites();
  let lastFocused = null; // element to return focus to when the sheet closes

  // ---------- Utilities ----------
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function isDesktop() { return DESKTOP.matches; }
  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }
  function shareUrlFor(id) {
    const base = /^https?:$/.test(location.protocol) ? location.origin + location.pathname : SITE_URL;
    return base + '#' + id;
  }

  // ---------- Favorites (localStorage, keyed by recipe id) ----------
  function loadFavorites() {
    let raw = [];
    try { raw = JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch (e) { raw = []; }
    if (!Array.isArray(raw)) raw = [];
    // Migrate entries saved by the previous version, which stored recipe names.
    const nameToId = new Map(RECIPES.map(r => [r.name, r.id]));
    const ids = raw.map(v => byId.has(v) ? v : nameToId.get(v)).filter(Boolean);
    const set = new Set(ids);
    if (ids.length !== raw.length || ids.some((v, i) => v !== raw[i])) saveFavorites(set);
    return set;
  }
  function saveFavorites(set) {
    try { localStorage.setItem(FAV_KEY, JSON.stringify(Array.from(set))); } catch (e) { /* private mode etc. */ }
  }
  function isFavorite(id) { return favorites.has(id); }
  function toggleFavorite(id) {
    if (favorites.has(id)) favorites.delete(id); else favorites.add(id);
    saveFavorites(favorites);
    // Patch every star for this recipe in place (panel, sheet) …
    $$(`[data-fav="${CSS.escape(id)}"]`).forEach(btn => setFavButtonState(btn, isFavorite(id)));
    // … then refresh the grid (card badge, and the Saved-only list if active).
    updateFavoritesPill();
    renderCards();
  }
  function setFavButtonState(btn, fav) {
    btn.classList.toggle('is-fav', fav);
    btn.setAttribute('aria-label', fav ? 'Remove from saved recipes' : 'Save this recipe');
    btn.setAttribute('aria-pressed', String(fav));
  }
  function toggleFavoritesFilter() {
    state.favoritesOnly = !state.favoritesOnly;
    state.pickedId = null;
    updateFavoritesPill();
    renderCards();
  }
  function updateFavoritesPill() {
    const count = favorites.size;
    if (count === 0) state.favoritesOnly = false;
    $$('.favorites-pill-wrap').forEach(w => { w.hidden = count === 0; });
    $$('.fav-count').forEach(e => { e.textContent = count; });
    $$('.favorites-filter').forEach(pill => {
      pill.classList.toggle('active', state.favoritesOnly);
      pill.setAttribute('aria-pressed', String(state.favoritesOnly));
    });
  }

  // ---------- Filtering & search ----------
  function matchesQuery(r, tokens) {
    if (!tokens.length) return true;
    const hay = r._search || (r._search = [r.name, r.urdu, r.desc, r.ingredients.join(' ')].join(' ').toLowerCase());
    return tokens.every(t => hay.includes(t));
  }
  function visibleRecipes() {
    const tokens = state.query.toLowerCase().split(/\s+/).filter(Boolean);
    let list = recipes.filter(r =>
      (state.protein === 'all' || r.protein === state.protein) &&
      (state.type === 'all' || r.type === state.type) &&
      (state.effort === 'all' || r.effort === state.effort) &&
      (!state.favoritesOnly || isFavorite(r.id)) &&
      matchesQuery(r, tokens));
    // On mobile there is no side panel, so the picked recipe floats to the top.
    if (state.pickedId && !isDesktop()) {
      const i = list.findIndex(r => r.id === state.pickedId);
      if (i > 0) list = [list[i], ...list.slice(0, i), ...list.slice(i + 1)];
    }
    return list;
  }
  function setFilter(group, value) {
    if (!(group in ACTIVE_CLASS) || !(value in ACTIVE_CLASS[group])) return;
    state[group] = value;
    state.pickedId = null;
    updateFilterUI();
    renderCards();
  }
  function updateFilterUI() {
    for (const group of Object.keys(ACTIVE_CLASS)) {
      $$(`.filter-pill[data-filter="${group}"]`).forEach(btn => {
        const active = btn.dataset.value === state[group];
        btn.classList.remove(...ALL_ACTIVE_CLASSES);
        if (active) btn.classList.add(ACTIVE_CLASS[group][state[group]]);
        btn.setAttribute('aria-pressed', String(active));
      });
    }
  }
  function setQuery(q, { fromInput } = {}) {
    state.query = q.trim();
    state.pickedId = null;
    el.searchInputs.forEach(inp => { if (inp !== fromInput && inp.value !== q) inp.value = q; });
    $$('.search-clear').forEach(b => { b.hidden = !q; });
    renderCards();
  }
  const setQueryDebounced = debounce(q => setQuery(q), 120);
  function resetAll() {
    state.protein = state.type = state.effort = 'all';
    state.favoritesOnly = false;
    state.pickedId = null;
    updateFilterUI();
    updateFavoritesPill();
    setQuery('');
  }

  // ---------- Rendering ----------
  const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"></use></svg>`;
  function effortHtml(effort) {
    const e = EFFORT[effort] || EFFORT.quick;
    let squares = '';
    for (let i = 0; i < 3; i++) squares += `<i class="${i < e.level ? 'on' : ''}"></i>`;
    return `<span class="effort" role="img" aria-label="Effort: ${e.label}" title="${e.label}">${squares}</span>`;
  }
  function proteinOf(r) { return PROTEIN[r.protein] || { cls: 'card-other', label: escapeHtml(r.protein) }; }
  function favButtonHtml(r) {
    const fav = isFavorite(r.id);
    return `<button type="button" class="fav-btn${fav ? ' is-fav' : ''}" data-fav="${r.id}"
              aria-label="${fav ? 'Remove from saved recipes' : 'Save this recipe'}" aria-pressed="${fav}">${icon('star')}</button>`;
  }

  function cardHtml(r) {
    const selected = r.id === state.selectedId && isDesktop();
    const picked = r.id === state.pickedId;
    const p = proteinOf(r);
    return `
      <article class="recipe-card card-enter ${p.cls}${selected ? ' selected' : ''}${picked ? ' highlighted' : ''}"
               data-id="${r.id}"${picked ? ' id="highlighted-card"' : ''}>
        ${isFavorite(r.id) ? `<span class="fav-indicator" aria-hidden="true">${icon('star')}</span>` : ''}
        <div class="card-illo">
          <span class="urdu" lang="ur" dir="rtl">${escapeHtml(r.urdu)}</span>
          <span class="chip">${p.label}</span>
        </div>
        <div class="card-body">
          <h2 class="card-title"><button type="button" class="card-title-btn" data-open="${r.id}">${escapeHtml(r.name)}</button></h2>
          <div class="card-meta">
            <span>${TYPE_LABEL[r.type] || escapeHtml(r.type)}</span><span aria-hidden="true">·</span>
            <span>${escapeHtml(r.time)}</span><span aria-hidden="true">·</span>
            ${effortHtml(r.effort)}
          </div>
          <p class="card-desc">${escapeHtml(r.desc)}</p>
          <p class="urdu card-desc-ur" lang="ur" dir="rtl">${escapeHtml(r.urduDesc)}</p>
          <p class="card-hint" aria-hidden="true">Tap to view →</p>
        </div>
      </article>`;
  }

  function detailHtml(r, variant) {
    const sheet = variant === 'sheet';
    const p = proteinOf(r);
    const e = EFFORT[r.effort];
    const eyebrow = r.id === state.pickedId ? "Tonight's pick" : TYPE_LABEL[r.type] || 'Recipe';
    return `
      <div class="detail-card ${p.cls}">
        <div class="detail-head">
          <div class="min-w-0">
            <p class="eyebrow">${eyebrow}</p>
            <h2 id="${sheet ? 'sheetTitle' : 'detailTitle'}" class="detail-title">${escapeHtml(r.name)}</h2>
          </div>
          ${favButtonHtml(r)}
        </div>
        <div class="detail-body">
          <p class="urdu detail-urdu" lang="ur" dir="rtl">${escapeHtml(r.urdu)}</p>
          <div class="tag-row">
            <span class="tag tag-accent">${p.label}</span>
            <span class="tag">${TYPE_LABEL[r.type] || escapeHtml(r.type)}</span>
            <span class="tag">${escapeHtml(r.time)}</span>
            ${e ? `<span class="tag">${e.label}</span>` : ''}
          </div>
          <p class="detail-desc">${escapeHtml(r.desc)}</p>
          <p class="urdu detail-urdu-desc" lang="ur" dir="rtl">${escapeHtml(r.urduDesc)}</p>
          <div class="ingredients">
            <h3 class="section-title">Ingredients</h3>
            <ul>${r.ingredients.map(ing => `<li>${escapeHtml(ing)}</li>`).join('')}</ul>
          </div>
          <div class="note">
            <h3 class="section-title">Ammi's note</h3>
            <p>${escapeHtml(r.notes)}</p>
          </div>
          <div class="detail-actions">
            <button type="button" class="btn-primary" data-share="${r.id}">${icon('share')}Share</button>
            <button type="button" class="btn-outline" data-action="print">${icon('print')}Print</button>
          </div>
        </div>
      </div>`;
  }

  function renderCards() {
    const list = visibleRecipes();
    el.counters.forEach(c => { c.textContent = list.length; });
    if (list.length === 0) {
      el.grid.innerHTML = '';
      el.empty.classList.remove('hidden');
      if (el.emptyQuery) el.emptyQuery.textContent = state.query ? `Nothing matches “${state.query}”.` : 'No recipes match these filters.';
      return;
    }
    el.empty.classList.add('hidden');
    el.grid.innerHTML = list.map(cardHtml).join('');
  }

  function renderDetailPanel(r) {
    el.detailEmpty.classList.add('hidden');
    el.detailContent.classList.remove('hidden');
    el.detailContent.innerHTML = detailHtml(r, 'panel');
    el.detailPanel.scrollTop = 0;
  }

  // ---------- Selecting / opening a recipe ----------
  function openRecipe(id, { scroll = false } = {}) {
    const r = byId.get(id);
    if (!r) return;
    state.selectedId = id;
    if (state.pickedId && state.pickedId !== id) {
      state.pickedId = null;
      $$('.recipe-card.highlighted', el.grid).forEach(c => { c.classList.remove('highlighted'); c.removeAttribute('id'); });
    }
    if (history.replaceState) history.replaceState(null, '', '#' + id);
    if (isDesktop()) {
      $$('.recipe-card.selected', el.grid).forEach(c => c.classList.remove('selected'));
      const card = $(`.recipe-card[data-id="${CSS.escape(id)}"]`, el.grid);
      if (card) {
        card.classList.add('selected');
        if (scroll) card.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      renderDetailPanel(r);
    } else {
      openSheet(r);
    }
  }

  function pickForMe() {
    const list = visibleRecipes();
    if (!list.length) return;
    const r = list[Math.floor(Math.random() * list.length)];
    state.pickedId = r.id;
    state.selectedId = r.id;
    renderCards(); // re-render so the glow animation restarts even if the same card is picked twice
    if (isDesktop()) {
      // The sticky detail panel is always visible, so no page jump is needed.
      renderDetailPanel(r);
      if (history.replaceState) history.replaceState(null, '', '#' + r.id);
    } else {
      // Picked card floats to the top of the grid; scroll there so it is seen.
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  // ---------- Mobile bottom sheet ----------
  function openSheet(r) {
    lastFocused = document.activeElement;
    el.sheetContent.innerHTML = detailHtml(r, 'sheet');
    el.sheet.scrollTop = 0;
    document.body.classList.add('sheet-open');
    $$('[data-inert-when-sheet]').forEach(n => { n.inert = true; });
    el.sheetBackdrop.classList.add('open');
    requestAnimationFrame(() => el.sheet.classList.add('open'));
    const closeBtn = $('.sheet-close-btn', el.sheet);
    if (closeBtn) closeBtn.focus({ preventScroll: true });
  }
  function closeSheet() {
    if (!el.sheet.classList.contains('open')) return;
    el.sheet.classList.remove('open');
    el.sheetBackdrop.classList.remove('open');
    document.body.classList.remove('sheet-open');
    $$('[data-inert-when-sheet]').forEach(n => { n.inert = false; });
    if (history.replaceState) history.replaceState(null, '', location.pathname + location.search);
    if (lastFocused && document.contains(lastFocused)) lastFocused.focus({ preventScroll: true });
    lastFocused = null;
  }
  function isSheetOpen() { return el.sheet.classList.contains('open'); }

  // Swipe-down to dismiss (only when the sheet is scrolled to the top)
  (function swipeToClose() {
    let startY = 0, currentY = 0, dragging = false;
    el.sheet.addEventListener('touchstart', e => {
      dragging = el.sheet.scrollTop <= 0;
      startY = currentY = e.touches[0].clientY;
    }, { passive: true });
    el.sheet.addEventListener('touchmove', e => {
      if (!dragging) return;
      currentY = e.touches[0].clientY;
      const diff = currentY - startY;
      if (diff > 0) { el.sheet.style.transition = 'none'; el.sheet.style.transform = `translateY(${diff}px)`; }
    }, { passive: true });
    el.sheet.addEventListener('touchend', () => {
      if (!dragging) return;
      dragging = false;
      el.sheet.style.transition = '';
      el.sheet.style.transform = '';
      if (currentY - startY > 80) closeSheet();
    });
  })();

  // ---------- Share / print / toast ----------
  let toastTimer;
  function toast(msg) {
    if (!el.toast) return;
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), 2200);
  }
  async function shareRecipe(id) {
    const r = byId.get(id);
    if (!r) return;
    const url = shareUrlFor(id);
    const text = `${r.name} (${r.urdu}) — ${r.desc}`;
    if (navigator.share) {
      try { await navigator.share({ title: `${r.name} — MaggieMix`, text, url }); return; }
      catch (e) { if (e && e.name === 'AbortError') return; /* fall through to copy */ }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copied — paste it anywhere');
    } catch (e) {
      toast(url);
    }
  }

  // ---------- Structured data (schema.org/Recipe) ----------
  function parseTimeToISO(timeStr) {
    // "45 min" → PT45M · "1 hr 30 min" → PT1H30M · "2.5 hrs" → PT2H30M · "4+ hrs" → PT4H
    if (!timeStr) return undefined;
    let total = 0;
    const hr = timeStr.match(/(\d+(?:\.\d+)?)\+?\s*hr/i);
    const min = timeStr.match(/(\d+)\s*min/i);
    if (hr) total += parseFloat(hr[1]) * 60;
    if (min) total += parseInt(min[1], 10);
    if (!total) return undefined;
    const h = Math.floor(total / 60), m = Math.round(total - h * 60);
    return 'PT' + (h ? h + 'H' : '') + (m ? m + 'M' : '');
  }
  function schemaCategory(type) {
    return { rice: 'Main course', saalan: 'Main course', sides: 'Side dish', snacks: 'Snack' }[type] || 'Main course';
  }
  function injectStructuredData() {
    const graph = RECIPES.map(r => ({
      '@type': 'Recipe',
      '@id': SITE_URL + '#' + r.id,
      'url': SITE_URL + '#' + r.id,
      'name': r.name,
      'alternateName': r.urdu,
      'description': r.desc,
      'recipeCuisine': 'Pakistani',
      'recipeCategory': schemaCategory(r.type),
      'keywords': ['Pakistani recipe', r.name, r.protein, r.type].join(', '),
      'recipeIngredient': r.ingredients,
      'recipeInstructions': [{ '@type': 'HowToStep', 'name': 'Cook', 'text': r.notes }],
      'totalTime': parseTimeToISO(r.time),
      'recipeYield': '4 servings',
      'inLanguage': ['en', 'ur'],
      'isPartOf': { '@id': SITE_URL + '#collection' },
      'suitableForDiet': r.protein === 'veg' ? 'https://schema.org/VegetarianDiet' : undefined,
    }));
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'recipe-structured-data';
    script.textContent = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph });
    document.head.appendChild(script);
  }

  // ---------- Layout: keep sticky offsets in sync with the real filter-bar height ----------
  function trackFilterBarHeight() {
    if (!el.filters) return;
    const apply = () => document.documentElement.style.setProperty('--filters-h', el.filters.offsetHeight + 'px');
    apply();
    if ('ResizeObserver' in window) new ResizeObserver(apply).observe(el.filters);
    else window.addEventListener('resize', apply);
  }

  // ---------- Events (delegated; no inline handlers so a strict CSP works) ----------
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-filter], [data-action], [data-fav], [data-share], [data-open], .recipe-card');
    if (!t) return;
    if (t.dataset.open) return openRecipe(t.dataset.open);
    if (t.dataset.filter) return setFilter(t.dataset.filter, t.dataset.value);
    if (t.dataset.fav) { e.stopPropagation(); return toggleFavorite(t.dataset.fav); }
    if (t.dataset.share) return shareRecipe(t.dataset.share);
    switch (t.dataset.action) {
      case 'pick': return pickForMe();
      case 'toggle-favorites': return toggleFavoritesFilter();
      case 'close-sheet': return closeSheet();
      case 'reset-filters': return resetAll();
      case 'print': return window.print();
      case 'clear-search': {
        setQuery('');
        const inp = $('.search-input', t.parentElement); if (inp) inp.focus();
        return;
      }
    }
    if (t.classList.contains('recipe-card')) openRecipe(t.dataset.id);
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isSheetOpen()) { e.preventDefault(); closeSheet(); }
  });

  el.searchInputs.forEach(inp => {
    inp.addEventListener('input', () => {
      $$('.search-clear').forEach(b => { b.hidden = !inp.value; });
      setQueryDebounced(inp.value);
    });
    inp.addEventListener('keydown', e => { if (e.key === 'Escape' && inp.value) { setQuery(''); e.stopPropagation(); } });
  });

  window.addEventListener('hashchange', () => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (byId.has(id) && id !== state.selectedId) openRecipe(id, { scroll: true });
  });

  const onLayoutChange = () => {
    // Layout flipped between phone and desktop: keep whatever is open in the right container.
    if (isDesktop() && isSheetOpen()) { closeSheet(); if (state.selectedId) openRecipe(state.selectedId); }
    renderCards();
  };
  if (DESKTOP.addEventListener) DESKTOP.addEventListener('change', onLayoutChange); else DESKTOP.addListener(onLayoutChange);

  // ---------- Init ----------
  function init() {
    const params = new URLSearchParams(location.search);
    const q = params.get('q');
    if (q) {
      el.searchInputs.forEach(i => { i.value = q; });
      state.query = q.trim();
      $$('.search-clear').forEach(b => { b.hidden = false; });
    }
    trackFilterBarHeight();
    updateFilterUI();
    updateFavoritesPill();
    renderCards();
    injectStructuredData();

    const id = decodeURIComponent(location.hash.slice(1));
    if (byId.has(id)) openRecipe(id, { scroll: true });

    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is best-effort */ });
    }
  }
  init();
})();
