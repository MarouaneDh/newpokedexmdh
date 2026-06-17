/* ============================================================
   Pokédex — PokeAPI client + UI logic (vanilla JS)
   ============================================================ */

const API = 'https://pokeapi.co/api/v2';
const SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
const ARTWORK = (id, shiny) => `${SPRITES}/other/official-artwork/${shiny ? 'shiny/' : ''}${id}.png`;
const SPRITE = (id, shiny) => `${SPRITES}/${shiny ? 'shiny/' : ''}${id}.png`;

const REGIONS = [
  { name: 'all',    label: 'All',    from: 1,   to: 1025, icon: null },
  { name: 'kanto',  label: 'Kanto',  from: 1,   to: 151,  icon: 25 },
  { name: 'johto',  label: 'Johto',  from: 152, to: 251,  icon: 250 },
  { name: 'hoenn',  label: 'Hoenn',  from: 252, to: 386,  icon: 384 },
  { name: 'sinnoh', label: 'Sinnoh', from: 387, to: 493,  icon: 483 },
  { name: 'unova',  label: 'Unova',  from: 494, to: 649,  icon: 643 },
  { name: 'kalos',  label: 'Kalos',  from: 650, to: 721,  icon: 716 },
  { name: 'alola',  label: 'Alola',  from: 722, to: 809,  icon: 791 },
  { name: 'galar',  label: 'Galar',  from: 810, to: 905,  icon: 888 },
  { name: 'paldea', label: 'Paldea', from: 906, to: 1025, icon: 1008 },
];

const TYPES = [
  'normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting',
  'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost',
  'dragon', 'dark', 'steel', 'fairy',
];

/* Curated legendary / mythical national-dex ids (no per-species fetch needed). */
const LEGENDARY = new Set([
  144, 145, 146, 150, 243, 244, 245, 249, 250, 377, 378, 379, 380, 381, 382, 383, 384,
  480, 481, 482, 483, 484, 485, 486, 487, 488, 638, 639, 640, 641, 642, 643, 644, 645,
  646, 716, 717, 718, 785, 786, 787, 788, 789, 790, 791, 792, 793, 794, 795, 796, 797,
  798, 799, 800, 803, 804, 805, 806, 888, 889, 890, 894, 895, 896, 897, 898, 905,
  1001, 1002, 1003, 1004, 1007, 1008, 1014, 1015, 1016, 1017, 1024,
]);
const MYTHICAL = new Set([
  151, 251, 385, 386, 490, 491, 492, 493, 494, 647, 648, 649, 719, 720, 721,
  801, 802, 807, 808, 809, 893, 1025,
]);

const LANGS = [
  { code: 'en', label: 'English',  voice: 'en-US' },
  { code: 'ja', label: '日本語',    voice: 'ja-JP' },
  { code: 'fr', label: 'Français',  voice: 'fr-FR' },
  { code: 'de', label: 'Deutsch',   voice: 'de-DE' },
  { code: 'es', label: 'Español',   voice: 'es-ES' },
  { code: 'it', label: 'Italiano',  voice: 'it-IT' },
  { code: 'ko', label: '한국어',     voice: 'ko-KR' },
];

const typeColor = (t) => getComputedStyle(document.documentElement)
  .getPropertyValue(`--t-${t}`).trim() || '#999';

const STAT_LABELS = {
  hp: 'HP', attack: 'Attack', defense: 'Defense',
  'special-attack': 'Sp. Atk', 'special-defense': 'Sp. Def', speed: 'Speed',
};
const STAT_ORDER = ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed'];
const RADAR_LABELS = ['HP', 'Atk', 'Def', 'SpA', 'SpD', 'Spe'];

const SORTS = {
  'id-asc':     { kind: 'id',   dir: 1 },
  'id-desc':    { kind: 'id',   dir: -1 },
  'name-asc':   { kind: 'name', dir: 1 },
  'name-desc':  { kind: 'name', dir: -1 },
  'total-desc': { kind: 'stat', key: 'total',  dir: -1 },
  'total-asc':  { kind: 'stat', key: 'total',  dir: 1 },
  'attack-desc':{ kind: 'stat', key: 'attack', dir: -1 },
  'speed-desc': { kind: 'stat', key: 'speed',  dir: -1 },
  'hp-desc':    { kind: 'stat', key: 'hp',     dir: -1 },
};

const PAGE_SIZE = 30;

/* ===== State ===== */
const state = {
  region: 'all',
  types: new Set(),
  search: '',
  sort: 'id-asc',
  legendary: false,
  mythical: false,
  minTotal: 0,
  favorites: new Set(JSON.parse(localStorage.getItem('pokedex-favs') || '[]')),
  favoritesOnly: false,
  shiny: false,
  autoCry: localStorage.getItem('pokedex-autocry') === '1',
  lang: localStorage.getItem('pokedex-lang') || 'en',
  baseList: [],
  navList: [],
  currentIndex: 0,
  rendered: 0,
  compare: [],
  detailCache: new Map(),
  nameList: [],
  typeData: new Map(),
  typeMembers: new Map(),
  game: { id: null, streak: 0, best: parseInt(localStorage.getItem('pokedex-best') || '0', 10), answered: false },
};

let installPrompt = null;

/* ===== Fetch cache ===== */
const _cache = new Map();
async function getJSON(url) {
  if (_cache.has(url)) return _cache.get(url);
  const p = fetch(url).then((r) => { if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); });
  _cache.set(url, p);
  try { return await p; } catch (e) { _cache.delete(url); throw e; }
}

const idFromUrl = (url) => parseInt(url.split('/').filter(Boolean).pop(), 10);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const niceName = (s) => s.split('-').map(cap).join(' ');
const dexNo = (id) => `#${String(id).padStart(4, '0')}`;
const rand = (n) => Math.floor(Math.random() * n);

/* ============================================================
   Boot
   ============================================================ */
const el = {};
['grid', 'sentinel', 'loader', 'empty-state', 'result-count', 'search', 'sort',
 'reset-filters', 'region-filters', 'type-filters', 'modal', 'modal-card', 'modal-backdrop',
 'theme-toggle', 'fav-toggle', 'coverage', 'compare-tray', 'compare-items', 'compare-go',
 'compare-clear', 'compare-modal', 'compare-card', 'compare-backdrop', 'to-top', 'top-sentinel',
 'random-btn', 'game-btn', 'settings-btn', 'settings-panel', 'auto-cry', 'lang-select',
 'install-btn', 'leg-filter', 'myth-filter', 'min-total', 'min-total-val',
 'game-modal', 'game-card', 'game-backdrop']
  .forEach((id) => { el[id] = document.getElementById(id); });

init();

async function init() {
  registerSW();
  wireTheme();
  wireSettings();
  buildRegionTiles();
  buildTypeChips();
  wireControls();
  parseUrlState();
  renderSkeletonGrid();
  await loadNameList();
  applyFilters();
  openFromHash();
  window.addEventListener('hashchange', openFromHash);
}

/* ===== PWA ===== */
function registerSW() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPrompt = e;
    el['install-btn'].classList.remove('hidden');
  });
}

/* ===== Theme ===== */
function wireTheme() {
  el['theme-toggle'].addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('pokedex-theme', next);
  });
}

/* ===== Settings popover ===== */
function wireSettings() {
  const toggle = () => el['settings-panel'].classList.toggle('hidden');
  el['settings-btn'].addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
  document.addEventListener('click', (e) => {
    if (!el['settings-panel'].classList.contains('hidden') &&
        !el['settings-panel'].contains(e.target) && e.target !== el['settings-btn']) {
      el['settings-panel'].classList.add('hidden');
    }
  });

  el['auto-cry'].checked = state.autoCry;
  el['auto-cry'].addEventListener('change', (e) => {
    state.autoCry = e.target.checked;
    localStorage.setItem('pokedex-autocry', state.autoCry ? '1' : '0');
  });

  el['lang-select'].innerHTML = LANGS.map((l) => `<option value="${l.code}">${l.label}</option>`).join('');
  el['lang-select'].value = state.lang;
  el['lang-select'].addEventListener('change', (e) => {
    state.lang = e.target.value;
    localStorage.setItem('pokedex-lang', state.lang);
    if (!el.modal.classList.contains('hidden')) showCurrent(true); // refresh open modal
  });

  el['install-btn'].addEventListener('click', async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    el['install-btn'].classList.add('hidden');
  });

  el['random-btn'].addEventListener('click', () => {
    const pool = state.baseList.length ? state.baseList : state.nameList;
    if (pool.length) openModal(pool[rand(pool.length)].id);
  });

  el['game-btn'].addEventListener('click', openGame);
}

/* Full national dex name list */
async function loadNameList() {
  try {
    const data = await getJSON(`${API}/pokemon?limit=1025&offset=0`);
    state.nameList = data.results.map((r) => ({ id: idFromUrl(r.url), name: r.name }))
      .filter((p) => p.id >= 1 && p.id <= 1025);
  } catch (e) {
    console.error('Failed to load Pokémon list', e);
    state.nameList = [];
  }
}

/* ============================================================
   Region tiles + type chips
   ============================================================ */
function buildRegionTiles() {
  el['region-filters'].innerHTML = '';
  REGIONS.forEach((r) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'region-tile';
    b.dataset.region = r.name;
    b.setAttribute('aria-pressed', String(r.name === state.region));
    const count = r.to - r.from + 1;
    b.innerHTML = `
      <span class="region-tile-img">${r.icon ? `<img src="${SPRITE(r.icon)}" alt="" loading="lazy" />` : '<span class="pokeball-icon"></span>'}</span>
      <span class="region-tile-name">${r.label}</span>
      <span class="region-tile-count">${count}</span>`;
    b.addEventListener('click', () => {
      state.region = r.name;
      reflectRegion();
      applyFilters();
    });
    el['region-filters'].appendChild(b);
  });
}
function reflectRegion() {
  [...el['region-filters'].children].forEach((c) =>
    c.setAttribute('aria-pressed', String(c.dataset.region === state.region)));
}

function buildTypeChips() {
  el['type-filters'].innerHTML = '';
  TYPES.forEach((t) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'type-chip';
    b.textContent = t;
    b.dataset.type = t;
    b.style.setProperty('--type-color', typeColor(t));
    b.setAttribute('aria-pressed', String(state.types.has(t)));
    b.addEventListener('click', () => toggleType(t, b));
    el['type-filters'].appendChild(b);
  });
}

async function toggleType(t, btn) {
  if (state.types.has(t)) state.types.delete(t);
  else state.types.add(t);
  btn.setAttribute('aria-pressed', String(state.types.has(t)));
  await Promise.all([...state.types].map(ensureTypeMembers));
  applyFilters();
}

async function getTypeData(name) {
  if (state.typeData.has(name)) return state.typeData.get(name);
  const data = await getJSON(`${API}/type/${name}`);
  state.typeData.set(name, data);
  return data;
}
async function ensureTypeMembers(t) {
  if (state.typeMembers.has(t)) return state.typeMembers.get(t);
  const data = await getTypeData(t);
  const ids = new Set(data.pokemon.map((p) => idFromUrl(p.pokemon.url)).filter((id) => id >= 1 && id <= 1025));
  state.typeMembers.set(t, ids);
  return ids;
}

/* ============================================================
   Controls
   ============================================================ */
function wireControls() {
  let searchTimer;
  el.search.addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.search = e.target.value.trim().toLowerCase(); applyFilters(); }, 220);
  });
  el.sort.addEventListener('change', (e) => { state.sort = e.target.value; applyFilters(); });
  el['reset-filters'].addEventListener('click', resetFilters);
  el['fav-toggle'].addEventListener('click', () => {
    state.favoritesOnly = !state.favoritesOnly;
    el['fav-toggle'].setAttribute('aria-pressed', String(state.favoritesOnly));
    applyFilters();
  });
  el['leg-filter'].addEventListener('change', (e) => { state.legendary = e.target.checked; applyFilters(); });
  el['myth-filter'].addEventListener('change', (e) => { state.mythical = e.target.checked; applyFilters(); });
  let minTimer;
  el['min-total'].addEventListener('input', (e) => {
    el['min-total-val'].textContent = e.target.value;
    clearTimeout(minTimer);
    minTimer = setTimeout(() => { state.minTotal = parseInt(e.target.value, 10); applyFilters(); }, 280);
  });

  el['modal-backdrop'].addEventListener('click', closeModal);
  el['compare-backdrop'].addEventListener('click', closeCompare);
  el['game-backdrop'].addEventListener('click', closeGame);
  document.addEventListener('keydown', (e) => {
    if (!el['game-modal'].classList.contains('hidden')) { if (e.key === 'Escape') closeGame(); return; }
    if (!el['compare-modal'].classList.contains('hidden')) { if (e.key === 'Escape') closeCompare(); return; }
    if (el.modal.classList.contains('hidden')) return;
    if (e.key === 'Escape') closeModal();
    else if (e.key === 'ArrowRight') { e.preventDefault(); navigateModal(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); navigateModal(-1); }
  });

  el['compare-go'].addEventListener('click', openCompare);
  el['compare-clear'].addEventListener('click', () => { state.compare = []; renderCompareTray(); });

  el['to-top'].addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  new IntersectionObserver(([e]) => el['to-top'].classList.toggle('show', !e.isIntersecting)).observe(el['top-sentinel']);
  new IntersectionObserver((entries) => { if (entries[0].isIntersecting) renderNextPage(); }, { rootMargin: '600px' }).observe(el.sentinel);
}

function resetFilters() {
  Object.assign(state, { region: 'all', search: '', sort: 'id-asc', favoritesOnly: false, legendary: false, mythical: false, minTotal: 0 });
  state.types.clear();
  el.search.value = ''; el.sort.value = 'id-asc';
  el['fav-toggle'].setAttribute('aria-pressed', 'false');
  el['leg-filter'].checked = false; el['myth-filter'].checked = false;
  el['min-total'].value = 0; el['min-total-val'].textContent = '0';
  reflectRegion();
  [...el['type-filters'].children].forEach((c) => c.setAttribute('aria-pressed', 'false'));
  applyFilters();
}

/* ===== URL state ===== */
function parseUrlState() {
  const q = new URLSearchParams(location.search);
  if (q.has('region') && REGIONS.some((r) => r.name === q.get('region'))) state.region = q.get('region');
  if (q.has('types')) q.get('types').split(',').filter((t) => TYPES.includes(t)).forEach((t) => state.types.add(t));
  if (q.has('q')) { state.search = q.get('q').toLowerCase(); el.search.value = q.get('q'); }
  if (q.has('sort') && SORTS[q.get('sort')]) { state.sort = q.get('sort'); el.sort.value = q.get('sort'); }
  if (q.get('fav') === '1') { state.favoritesOnly = true; el['fav-toggle'].setAttribute('aria-pressed', 'true'); }
  if (q.get('leg') === '1') { state.legendary = true; el['leg-filter'].checked = true; }
  if (q.get('myth') === '1') { state.mythical = true; el['myth-filter'].checked = true; }
  if (q.has('min')) { state.minTotal = parseInt(q.get('min'), 10) || 0; el['min-total'].value = state.minTotal; el['min-total-val'].textContent = state.minTotal; }
  reflectRegion();
  [...el['type-filters'].children].forEach((c) => c.setAttribute('aria-pressed', String(state.types.has(c.dataset.type))));
}
function writeUrlState() {
  const q = new URLSearchParams();
  if (state.region !== 'all') q.set('region', state.region);
  if (state.types.size) q.set('types', [...state.types].join(','));
  if (state.search) q.set('q', state.search);
  if (state.sort !== 'id-asc') q.set('sort', state.sort);
  if (state.favoritesOnly) q.set('fav', '1');
  if (state.legendary) q.set('leg', '1');
  if (state.mythical) q.set('myth', '1');
  if (state.minTotal) q.set('min', state.minTotal);
  const qs = q.toString();
  history.replaceState(null, '', (qs ? '?' + qs : location.pathname) + location.hash);
}

/* ===== Favorites ===== */
function isFav(id) { return state.favorites.has(id); }
function toggleFav(id) {
  if (state.favorites.has(id)) state.favorites.delete(id); else state.favorites.add(id);
  localStorage.setItem('pokedex-favs', JSON.stringify([...state.favorites]));
  document.querySelectorAll(`[data-fav-id="${id}"]`).forEach((b) => {
    b.setAttribute('aria-pressed', String(isFav(id)));
    b.classList.toggle('is-fav', isFav(id));
  });
  if (state.favoritesOnly) applyFilters(); else updateCoverage();
}

/* ============================================================
   Filtering
   ============================================================ */
async function applyFilters() {
  const region = REGIONS.find((r) => r.name === state.region);
  let list = state.nameList.filter((p) => p.id >= region.from && p.id <= region.to);

  if (state.types.size) {
    const sets = [...state.types].map((t) => state.typeMembers.get(t)).filter(Boolean);
    if (sets.length) list = list.filter((p) => sets.every((s) => s.has(p.id)));
  }
  if (state.favoritesOnly) list = list.filter((p) => state.favorites.has(p.id));
  if (state.legendary || state.mythical) {
    list = list.filter((p) => (state.legendary && LEGENDARY.has(p.id)) || (state.mythical && MYTHICAL.has(p.id)));
  }
  if (state.search) {
    const q = state.search, num = q.replace('#', '');
    list = list.filter((p) => p.name.includes(q) || String(p.id) === num || dexNo(p.id).includes(q));
  }

  const sort = SORTS[state.sort];
  const needDetails = sort.kind === 'stat' || state.minTotal > 0;
  if (needDetails) {
    el.grid.innerHTML = '';
    el.loader.classList.remove('hidden'); el.loader.classList.add('flex');
    await ensureDetailsFor(list.map((p) => p.id));
    el.loader.classList.add('hidden'); el.loader.classList.remove('flex');
    if (state.minTotal > 0) list = list.filter((p) => statValue(state.detailCache.get(p.id), 'total') >= state.minTotal);
  }

  if (sort.kind === 'stat') {
    list.sort((a, b) => (statValue(state.detailCache.get(a.id), sort.key) - statValue(state.detailCache.get(b.id), sort.key)) * sort.dir || (a.id - b.id));
  } else if (sort.kind === 'name') {
    list.sort((a, b) => a.name.localeCompare(b.name) * sort.dir);
  } else {
    list.sort((a, b) => (a.id - b.id) * sort.dir);
  }

  state.baseList = list;
  el['result-count'].textContent = list.length.toLocaleString();
  writeUrlState();
  updateCoverage();

  el.grid.innerHTML = '';
  state.rendered = 0;
  const empty = list.length === 0;
  el['empty-state'].classList.toggle('hidden', !empty);
  el['empty-state'].classList.toggle('flex', empty);
  if (!empty) renderNextPage();
}

function statValue(d, key) {
  if (!d) return 0;
  if (key === 'total') return d.stats.reduce((s, x) => s + x.base_stat, 0);
  return d.stats.find((s) => s.stat.name === key)?.base_stat || 0;
}
function statArray(d) { return STAT_ORDER.map((k) => statValue(d, k)); }

async function ensureDetailsFor(ids) {
  const missing = ids.filter((id) => !state.detailCache.has(id));
  const total = ids.length;
  let done = total - missing.length, i = 0;
  const worker = async () => {
    while (i < missing.length) {
      const id = missing[i++];
      try { await getDetail(id); } catch (e) { /* ignore */ }
      done++;
      if (done % 24 === 0 || done === total) el['result-count'].textContent = `${done}/${total}`;
    }
  };
  await Promise.all(Array.from({ length: 16 }, worker));
}

/* ===== Team coverage ===== */
let coverageToken = 0;
async function updateCoverage() {
  const favs = [...state.favorites];
  const show = state.favoritesOnly && favs.length > 0;
  el.coverage.classList.toggle('hidden', !show);
  if (!show) return;
  el.coverage.innerHTML = `<p class="txt-muted text-sm font-600">Analyzing team coverage…</p>`;
  const token = ++coverageToken;
  await ensureDetailsFor(favs);
  if (token !== coverageToken) return;
  const weakCount = {}; TYPES.forEach((t) => (weakCount[t] = 0));
  for (const id of favs) {
    const d = state.detailCache.get(id);
    if (!d) continue;
    const eff = await effectiveness(d.types.map((t) => t.type.name));
    if (token !== coverageToken) return;
    eff.weak.forEach((w) => (weakCount[w.t] += 1));
  }
  const sorted = TYPES.map((t) => ({ t, n: weakCount[t] })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
  el.coverage.innerHTML = `
    <h2 class="font-display font-600 text-base mb-2">Team coverage <span class="txt-muted font-500">· ${favs.length} Pokémon</span></h2>
    ${sorted.length ? `
      <p class="txt-muted text-xs font-600 uppercase tracking-wide mb-1.5">Shared weaknesses (how many of your team each type beats)</p>
      <div class="flex flex-wrap gap-1.5">
        ${sorted.map((x) => `<span class="cov-badge" style="--type-color:${typeColor(x.t)}">${x.t}<b>${x.n}</b></span>`).join('')}
      </div>` : `<p class="txt-muted text-sm">No common weaknesses. Solid defensive spread.</p>`}`;
}

/* ===== Type effectiveness ===== */
async function effectiveness(typeNames) {
  const datas = await Promise.all(typeNames.map(getTypeData));
  const mult = {}; TYPES.forEach((t) => (mult[t] = 1));
  datas.forEach((d) => {
    const r = d.damage_relations;
    r.double_damage_from.forEach((x) => (mult[x.name] *= 2));
    r.half_damage_from.forEach((x) => (mult[x.name] *= 0.5));
    r.no_damage_from.forEach((x) => (mult[x.name] *= 0));
  });
  const weak = [], resist = [], immune = [];
  TYPES.forEach((t) => { const m = mult[t]; if (m === 0) immune.push({ t, m }); else if (m > 1) weak.push({ t, m }); else if (m < 1) resist.push({ t, m }); });
  weak.sort((a, b) => b.m - a.m); resist.sort((a, b) => a.m - b.m);
  return { weak, resist, immune };
}
const multLabel = (m) => ({ 4: '4×', 2: '2×', 0.5: '½×', 0.25: '¼×', 0: '0×' }[m] || `${m}×`);

/* ===== Radar chart ===== */
function radarSVG(datasets, size = 190) {
  const cx = size / 2, cy = size / 2, r = size / 2 - 28, n = 6, max = 255;
  const pt = (i, frac) => {
    const a = -Math.PI / 2 + i * 2 * Math.PI / n;
    return [cx + r * frac * Math.cos(a), cy + r * frac * Math.sin(a)];
  };
  let g = '';
  [0.25, 0.5, 0.75, 1].forEach((f) => {
    g += `<polygon points="${Array.from({ length: n }, (_, i) => pt(i, f).join(',')).join(' ')}" class="radar-ring"/>`;
  });
  for (let i = 0; i < n; i++) {
    const [ox, oy] = pt(i, 1); g += `<line x1="${cx}" y1="${cy}" x2="${ox}" y2="${oy}" class="radar-axis"/>`;
    const [lx, ly] = pt(i, 1.2); g += `<text x="${lx}" y="${ly + 3}" class="radar-label">${RADAR_LABELS[i]}</text>`;
  }
  datasets.forEach((ds) => {
    const pts = ds.stats.map((v, i) => pt(i, Math.max(0.02, Math.min(1, v / max))).join(',')).join(' ');
    g += `<polygon points="${pts}" class="radar-poly" style="fill:${ds.color};stroke:${ds.color}"/>`;
  });
  return `<svg viewBox="0 0 ${size} ${size}" class="radar">${g}</svg>`;
}

/* ===== Localized text ===== */
const langMatch = (name) => name === state.lang || (state.lang === 'ja' && name === 'ja-Hrkt');
function localName(species, fallback) {
  if (!species) return niceName(fallback);
  const m = species.names?.find((x) => langMatch(x.language.name)) || species.names?.find((x) => x.language.name === 'en');
  return m?.name || niceName(fallback);
}
function localGenus(species) {
  const m = species?.genera?.find((g) => langMatch(g.language.name)) || species?.genera?.find((g) => g.language.name === 'en');
  return m?.genus;
}
function localFlavor(species) {
  const e = species?.flavor_text_entries?.find((f) => langMatch(f.language.name)) || species?.flavor_text_entries?.find((f) => f.language.name === 'en');
  return e?.flavor_text.replace(/[\n\f­]/g, ' ').replace(/\s+/g, ' ').trim();
}

/* ============================================================
   Cards
   ============================================================ */
function renderSkeletonGrid() {
  el.grid.innerHTML = Array.from({ length: 18 }).map(() => `
    <div class="poke-card pointer-events-none">
      <div class="flex justify-between"><span class="poke-dexno">····</span></div>
      <div class="skeleton rounded-xl w-full aspect-square my-1"></div>
      <div class="skeleton h-4 rounded w-2/3 mt-1"></div>
    </div>`).join('');
}

function renderNextPage() {
  if (state.rendered >= state.baseList.length) return;
  const slice = state.baseList.slice(state.rendered, state.rendered + PAGE_SIZE);
  state.rendered += slice.length;
  slice.forEach((p, i) => {
    const card = createSkeletonCard(p);
    card.style.animationDelay = `${Math.min(i, 12) * 30}ms`;
    el.grid.appendChild(card);
    hydrateCard(card, p);
  });
}

function createSkeletonCard(p) {
  const card = document.createElement('div');
  card.className = 'poke-card card-enter';
  card.dataset.id = p.id;
  card.setAttribute('role', 'button');
  card.tabIndex = 0;
  card.setAttribute('aria-label', `${cap(p.name)}, number ${p.id}. View details`);
  const tag = LEGENDARY.has(p.id) ? '<span class="rarity-dot legendary" title="Legendary"></span>'
    : MYTHICAL.has(p.id) ? '<span class="rarity-dot mythical" title="Mythical"></span>' : '';
  card.innerHTML = `
    <button type="button" class="fav-star ${isFav(p.id) ? 'is-fav' : ''}" data-fav-id="${p.id}"
      aria-pressed="${isFav(p.id)}" aria-label="Toggle favorite for ${cap(p.name)}">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-10-9.3C.4 8.4 1.9 5 5.2 5c2 0 3.3 1.1 4.1 2.3C10.1 6.1 11.4 5 13.4 5c3.3 0 4.8 3.4 3.2 6.7C19.5 16.4 12 21 12 21z"/></svg>
    </button>
    <div class="flex items-center justify-between"><span class="poke-dexno">${dexNo(p.id)}${tag}</span></div>
    <div class="skeleton rounded-xl w-full aspect-square my-1"></div>
    <p class="poke-name text-sm sm:text-base truncate">${cap(p.name)}</p>
    <div class="flex gap-1 mt-1.5 min-h-[22px] type-slot"></div>`;
  card.addEventListener('click', () => openModal(p.id));
  card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(p.id); } });
  card.querySelector('.fav-star').addEventListener('click', (e) => { e.stopPropagation(); toggleFav(p.id); });
  return card;
}

async function hydrateCard(card, p) {
  try {
    const d = await getDetail(p.id);
    card.style.setProperty('--card-color', typeColor(d.types[0]?.type.name));
    const skeleton = card.querySelector('.skeleton');
    const img = document.createElement('img');
    img.className = 'poke-sprite my-1';
    img.alt = cap(p.name); img.loading = 'lazy'; img.decoding = 'async';
    img.src = ARTWORK(p.id);
    img.onerror = () => { img.onerror = null; img.src = SPRITE(p.id); };
    skeleton.replaceWith(img);
    card.querySelector('.type-slot').innerHTML = d.types.map((t) =>
      `<span class="type-badge" style="--type-color:${typeColor(t.type.name)}">${t.type.name}</span>`).join('');
  } catch (e) {
    const skeleton = card.querySelector('.skeleton');
    if (skeleton) { skeleton.classList.remove('skeleton'); skeleton.classList.add('flex', 'items-center', 'justify-center'); skeleton.innerHTML = '<span class="pokeball-icon opacity-40"></span>'; }
  }
}

async function getDetail(id) {
  if (state.detailCache.has(id)) return state.detailCache.get(id);
  const d = await getJSON(`${API}/pokemon/${id}`);
  state.detailCache.set(id, d);
  return d;
}

/* ============================================================
   Detail modal
   ============================================================ */
let lastFocused = null;
let navToken = 0;

function openModal(id) {
  lastFocused = document.activeElement;
  el.modal.classList.remove('hidden'); el.modal.classList.add('flex');
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => el.modal.classList.add('modal-open'));
  goToId(id, false);
}

function resolveNav(id) {
  let idx = state.baseList.findIndex((p) => p.id === id);
  if (idx >= 0) return { list: state.baseList, idx };
  idx = state.nameList.findIndex((p) => p.id === id);
  if (idx >= 0) return { list: state.nameList, idx };
  return { list: [{ id, name: String(id) }], idx: 0 };
}
function goToId(id, animate) {
  stopSpeaking();
  const { list, idx } = resolveNav(id);
  state.navList = list; state.currentIndex = idx;
  showCurrent(animate);
}
function navigateModal(delta) {
  const len = state.navList.length;
  if (len <= 1) return;
  stopSpeaking();
  state.currentIndex = (state.currentIndex + delta + len) % len;
  showCurrent(true);
}

async function showCurrent(animate) {
  const entry = state.navList[state.currentIndex];
  if (!entry) return;
  const token = ++navToken;
  const id = entry.id;
  if (location.hash !== `#${id}`) history.replaceState(null, '', `${location.pathname}${location.search}#${id}`);
  if (!animate) el['modal-card'].innerHTML = `<div class="flex items-center justify-center h-72"><span class="pokeball-icon pokeball-lg pokeball-spin"></span></div>`;
  try {
    const d = await getDetail(id);
    const species = d.species ? await getJSON(d.species.url).catch(() => null) : null;
    if (token !== navToken) return;
    renderModal(d, species, token);
    [1, -1].forEach((dl) => { const n = state.navList[(state.currentIndex + dl + state.navList.length) % state.navList.length]; if (n) getDetail(n.id).catch(() => {}); });
  } catch (e) {
    if (token !== navToken) return;
    el['modal-card'].innerHTML = `<div class="p-8 text-center"><p class="font-display text-lg">Couldn't load this Pokémon.</p><button class="mt-4 px-4 py-2 rounded-xl bg-poke-red text-white font-600 cursor-pointer" onclick="document.getElementById('modal-backdrop').click()">Close</button></div>`;
  }
}

function genderText(rate) {
  if (rate === -1) return 'Genderless';
  const f = (rate / 8) * 100;
  return `♀ ${f}% · ♂ ${100 - f}%`;
}

function renderModal(d, species, token) {
  const primary = d.types[0]?.type.name;
  const color = typeColor(primary);
  const id = d.id;
  const inFav = isFav(id);
  const name = localName(species, d.name);
  const flavor = localFlavor(species);
  const genus = localGenus(species);
  const heightM = (d.height / 10).toFixed(1);
  const weightKg = (d.weight / 10).toFixed(1);
  const total = d.stats.reduce((s, x) => s + x.base_stat, 0);
  const cryUrl = d.cries?.latest || d.cries?.legacy;
  const rarity = LEGENDARY.has(id) ? 'Legendary' : MYTHICAL.has(id) ? 'Mythical' : '';

  const moves = d.moves.map((m) => {
    const lv = m.version_group_details.find((v) => v.move_learn_method.name === 'level-up');
    return lv ? { name: m.move.name, level: lv.level_learned_at, url: m.move.url } : null;
  }).filter(Boolean).sort((a, b) => a.level - b.level);

  const len = state.navList.length;
  const prev = len > 1 ? state.navList[(state.currentIndex - 1 + len) % len] : null;
  const next = len > 1 ? state.navList[(state.currentIndex + 1) % len] : null;
  const inCompare = state.compare.includes(id);

  // species facts
  const facts2 = species ? [
    ['Gender', genderText(species.gender_rate)],
    ['Catch rate', species.capture_rate],
    ['Base happiness', species.base_happiness],
    ['Growth', niceName(species.growth_rate?.name || '-')],
    ['Egg groups', (species.egg_groups || []).map((g) => niceName(g.name)).join(', ') || '-'],
    ['Generation', species.generation ? species.generation.name.replace('generation-', '').toUpperCase() : '-'],
  ] : [];

  el['modal-card'].style.setProperty('--card-color', color);
  el['modal-card'].innerHTML = `
    <div class="modal-swap overflow-y-auto flex-1 min-h-0">
      <div class="relative p-5 pb-16 text-white" style="background:linear-gradient(160deg, ${color} 0%, ${shade(color, -18)} 100%)">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <p class="font-display font-600 text-white/80">${dexNo(id)}</p>
            <h2 id="modal-name" class="font-display font-700 text-3xl capitalize leading-tight">${name}</h2>
            ${genus ? `<p class="text-white/85 text-sm font-600">${genus}</p>` : ''}
            ${rarity ? `<span class="rarity-pill ${rarity.toLowerCase()}">${rarity}</span>` : ''}
          </div>
          <div class="flex items-center gap-1.5 flex-none">
            <button id="fav-btn" type="button" data-fav-id="${id}" aria-pressed="${inFav}" aria-label="Toggle favorite" class="modal-icon ${inFav ? 'is-fav' : ''}">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-10-9.3C.4 8.4 1.9 5 5.2 5c2 0 3.3 1.1 4.1 2.3C10.1 6.1 11.4 5 13.4 5c3.3 0 4.8 3.4 3.2 6.7C19.5 16.4 12 21 12 21z"/></svg>
            </button>
            <button id="modal-close" type="button" aria-label="Close" class="modal-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>
        <div class="flex gap-1.5 mt-3">${d.types.map((t) => `<span class="type-badge" style="background:rgba(255,255,255,0.22);text-shadow:none">${t.type.name}</span>`).join('')}</div>
      </div>

      <div class="relative -mt-20 flex justify-center pointer-events-none">
        <img id="modal-sprite" src="${ARTWORK(id, state.shiny)}" onerror="this.onerror=null;this.src='${SPRITE(id, state.shiny)}'" alt="${cap(d.name)}" class="w-40 h-40 object-contain" style="filter:drop-shadow(0 10px 14px rgba(0,0,0,0.3))" />
      </div>

      <div class="px-5 pb-6 -mt-2">
        <div class="flex flex-wrap justify-center gap-2 mb-4">
          <button id="read-btn" type="button" class="action-chip" aria-label="Read Pokédex entry aloud">
            <svg class="read-icon-play w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.78-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14z"/></svg>
            <svg class="read-icon-stop w-4 h-4 hidden" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
            <span>Read entry</span>
          </button>
          ${cryUrl ? `<button id="cry-btn" type="button" class="action-chip" aria-label="Play cry">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg><span>Cry</span></button>` : ''}
          <button id="shiny-btn" type="button" class="action-chip ${state.shiny ? 'active' : ''}" aria-pressed="${state.shiny}" aria-label="Toggle shiny">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2z"/></svg><span>Shiny</span></button>
          <button id="cmp-btn" type="button" class="action-chip ${inCompare ? 'active' : ''}" aria-pressed="${inCompare}" aria-label="Add to compare">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h7M3 18h7M17 3v18M14 7l3-4 3 4M14 17l3 4 3-4"/></svg><span>${inCompare ? 'Comparing' : 'Compare'}</span></button>
        </div>

        ${flavor ? `<p class="text-center txt-muted text-sm leading-relaxed mb-4">${flavor}</p>` : ''}

        <div class="grid grid-cols-3 gap-2 mb-4">
          ${fact('Height', heightM + ' m')}${fact('Weight', weightKg + ' kg')}${fact('Base XP', d.base_experience ?? '-')}
        </div>

        ${facts2.length ? `<div class="info-grid mb-5">${facts2.map(([k, v]) => `<div class="info-row"><span class="info-k">${k}</span><span class="info-v">${v}</span></div>`).join('')}</div>` : ''}

        <section class="mb-5"><h3 class="sec-h">Type defenses</h3><div id="eff-content"><p class="txt-muted text-sm">Calculating…</p></div></section>

        <section class="mb-5"><h3 class="sec-h">Abilities</h3>
          <div id="abil-content" class="space-y-1.5">${d.abilities.map((a) => `
            <div class="ability-row" data-ability="${a.ability.name}">
              <span class="ability-name">${niceName(a.ability.name)}${a.is_hidden ? ' <span class="hidden-tag">hidden</span>' : ''}</span>
              <span class="ability-desc txt-muted">…</span>
            </div>`).join('')}</div></section>

        <section class="mb-5" id="evo-section"><h3 class="sec-h">Evolution</h3><div id="evo-content"><p class="txt-muted text-sm">Loading…</p></div></section>

        ${species && species.varieties && species.varieties.length > 1 ? `
        <section class="mb-5"><h3 class="sec-h">Forms</h3><div class="flex flex-wrap gap-2">
          ${species.varieties.map((v) => { const vid = idFromUrl(v.pokemon.url); return `<button type="button" class="form-chip ${vid === id ? 'active' : ''}" data-form-id="${vid}">${niceName(v.pokemon.name)}</button>`; }).join('')}
        </div></section>` : ''}

        <section class="mb-5">
          <div class="flex items-center justify-between mb-2"><h3 class="sec-h mb-0">Base stats</h3><span class="text-sm font-700" style="color:${color}">Total ${total}</span></div>
          <div class="flex justify-center mb-2">${radarSVG([{ stats: statArray(d), color }])}</div>
          <div class="space-y-2">${d.stats.map((s) => { const pct = Math.min(100, Math.round((s.base_stat / 255) * 100)); return `<div class="stat-row"><span class="text-xs font-700 stat-label">${STAT_LABELS[s.stat.name] || s.stat.name}</span><span class="text-sm font-700 tabular-nums text-right">${s.base_stat}</span><span class="stat-track"><span class="stat-fill" data-pct="${pct}"></span></span></div>`; }).join('')}</div>
        </section>

        ${moves.length ? `
        <details class="moves"><summary class="sec-h cursor-pointer flex items-center gap-2 select-none">
          <span>Moves <span class="txt-muted font-500">· ${moves.length} by level-up · tap for details</span></span>
          <svg class="w-3.5 h-3.5 ml-auto chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
        </summary>
        <div class="moves-list mt-2 space-y-1">${moves.map((m) => `
          <div class="move-item" data-move-url="${m.url}" data-move="${m.name}">
            <button type="button" class="move-row"><span class="move-lv">${m.level || '-'}</span><span class="move-name">${niceName(m.name)}</span>
              <svg class="move-chev w-3.5 h-3.5 ml-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
            <div class="move-detail hidden"></div>
          </div>`).join('')}</div></details>` : ''}
      </div>
    </div>
    ${(prev || next) ? `<div class="modal-nav flex gap-2 p-3">${navButton('prev', prev)}${navButton('next', next)}</div>` : ''}`;

  wireModal(d, species, flavor, genus, name, cryUrl, token);
}

function wireModal(d, species, flavor, genus, name, cryUrl, token) {
  const id = d.id;
  const root = el['modal-card'];
  const close = root.querySelector('#modal-close');
  close.addEventListener('click', closeModal); close.focus();
  root.querySelector('#fav-btn').addEventListener('click', () => toggleFav(id));

  let cryAudio = null;
  if (cryUrl) {
    cryAudio = new Audio(cryUrl); cryAudio.volume = 0.4;
    root.querySelector('#cry-btn').addEventListener('click', () => { cryAudio.currentTime = 0; cryAudio.play().catch(() => {}); });
    if (state.autoCry) cryAudio.play().catch(() => {});
  }

  const readBtn = root.querySelector('#read-btn');
  let entryText = (name || cap(d.name));
  if (genus) entryText += `, the ${genus}`;
  entryText += '.';
  if (flavor) entryText += ' ' + flavor;
  readBtn.addEventListener('click', () => speakEntry(entryText, readBtn));

  root.querySelector('#shiny-btn').addEventListener('click', (e) => {
    state.shiny = !state.shiny;
    const sprite = root.querySelector('#modal-sprite');
    sprite.onerror = () => { sprite.onerror = null; sprite.src = SPRITE(id, state.shiny); };
    sprite.src = ARTWORK(id, state.shiny);
    e.currentTarget.classList.toggle('active', state.shiny);
    e.currentTarget.setAttribute('aria-pressed', String(state.shiny));
    root.querySelectorAll('.evo-node img').forEach((img) => {
      const eid = img.closest('[data-evo-id]')?.dataset.evoId;
      if (eid) img.src = SPRITE(eid, state.shiny);
    });
  });

  root.querySelector('#cmp-btn').addEventListener('click', (e) => {
    addToCompare(id);
    const on = state.compare.includes(id);
    e.currentTarget.classList.toggle('active', on);
    e.currentTarget.setAttribute('aria-pressed', String(on));
    e.currentTarget.querySelector('span').textContent = on ? 'Comparing' : 'Compare';
  });

  root.querySelectorAll('[data-form-id]').forEach((b) => b.addEventListener('click', () => goToId(parseInt(b.dataset.formId, 10), true)));

  const prevBtn = root.querySelector('[data-nav="prev"]');
  const nextBtn = root.querySelector('[data-nav="next"]');
  if (prevBtn) prevBtn.addEventListener('click', () => navigateModal(-1));
  if (nextBtn) nextBtn.addEventListener('click', () => navigateModal(1));

  // move detail expanders
  root.querySelectorAll('.move-item').forEach((item) => {
    item.querySelector('.move-row').addEventListener('click', () => toggleMove(item));
  });

  requestAnimationFrame(() => { root.querySelectorAll('.stat-fill').forEach((f) => { f.style.width = f.dataset.pct + '%'; }); });

  fillEffectiveness(d.types.map((t) => t.type.name), token);
  fillAbilities(d.abilities, token);
  fillEvolution(species, id, token);
}

async function toggleMove(item) {
  const detail = item.querySelector('.move-detail');
  const open = !detail.classList.contains('hidden');
  item.querySelector('.move-chev').style.transform = open ? '' : 'rotate(180deg)';
  if (open) { detail.classList.add('hidden'); return; }
  detail.classList.remove('hidden');
  if (detail.dataset.loaded) return;
  detail.innerHTML = `<p class="txt-muted text-xs px-2 py-1">Loading…</p>`;
  try {
    const m = await getJSON(item.dataset.moveUrl);
    detail.dataset.loaded = '1';
    const eff = m.effect_entries?.find((x) => x.language.name === 'en');
    const txt = (eff?.short_effect || m.flavor_text_entries?.find((f) => f.language.name === 'en')?.flavor_text || '')
      .replace('$effect_chance', m.effect_chance).replace(/\s+/g, ' ').trim();
    detail.innerHTML = `
      <div class="flex flex-wrap items-center gap-2 mb-1">
        <span class="type-badge" style="--type-color:${typeColor(m.type.name)}">${m.type.name}</span>
        <span class="move-meta">${niceName(m.damage_class.name)}</span>
        <span class="move-meta">Power ${m.power ?? '-'}</span>
        <span class="move-meta">Acc ${m.accuracy ?? '-'}</span>
        <span class="move-meta">PP ${m.pp ?? '-'}</span>
      </div>
      ${txt ? `<p class="txt-muted text-xs leading-snug">${txt}</p>` : ''}`;
  } catch (e) { detail.innerHTML = `<p class="txt-muted text-xs px-2 py-1">Couldn't load move.</p>`; }
}

async function fillEffectiveness(typeNames, token) {
  try {
    const eff = await effectiveness(typeNames);
    if (token !== navToken) return;
    const box = el['modal-card'].querySelector('#eff-content');
    if (!box) return;
    const group = (label, arr) => arr.length ? `<div class="mb-1.5"><span class="eff-label">${label}</span><span class="inline-flex flex-wrap gap-1 align-middle">${arr.map((x) => `<span class="eff-badge" style="--type-color:${typeColor(x.t)}">${x.t} <b>${multLabel(x.m)}</b></span>`).join('')}</span></div>` : '';
    box.innerHTML = group('Weak to', eff.weak) + group('Resists', eff.resist) + group('Immune', eff.immune) || `<p class="txt-muted text-sm">Takes neutral damage from every type.</p>`;
  } catch (e) { /* ignore */ }
}

async function fillAbilities(abilities, token) {
  for (const a of abilities) {
    try {
      const data = await getJSON(a.ability.url);
      if (token !== navToken) return;
      const entry = data.effect_entries?.find((x) => x.language.name === 'en');
      const txt = (entry?.short_effect || entry?.effect || '').replace(/\s+/g, ' ').trim();
      const row = el['modal-card'].querySelector(`.ability-row[data-ability="${a.ability.name}"] .ability-desc`);
      if (row) row.textContent = txt || 'No description available.';
    } catch (e) {
      const row = el['modal-card'].querySelector(`.ability-row[data-ability="${a.ability.name}"] .ability-desc`);
      if (row) row.textContent = '';
    }
  }
}

async function fillEvolution(species, currentId, token) {
  const box = el['modal-card'].querySelector('#evo-content');
  if (!box) return;
  if (!species?.evolution_chain?.url) { document.getElementById('evo-section')?.remove(); return; }
  try {
    const chain = await getJSON(species.evolution_chain.url);
    if (token !== navToken) return;
    const stages = [];
    (function walk(node, depth) {
      (stages[depth] = stages[depth] || []).push({ id: idFromUrl(node.species.url), name: node.species.name, trigger: describeTrigger(node.evolution_details) });
      node.evolves_to.forEach((c) => walk(c, depth + 1));
    })(chain.chain, 0);
    if (stages.length <= 1 && stages[0].length <= 1) { box.innerHTML = `<p class="txt-muted text-sm">${niceName(stages[0][0].name)} does not evolve.</p>`; return; }
    box.innerHTML = `<div class="evo-flow">${stages.map((stage, si) => `
      ${si > 0 ? `<div class="evo-arrow"><svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>${stage.map((s) => s.trigger).filter(Boolean)[0] ? `<span class="evo-trigger">${stage.map((s) => s.trigger).filter(Boolean)[0]}</span>` : ''}</div>` : ''}
      <div class="evo-stage">${stage.map((s) => `<button type="button" class="evo-node ${s.id === currentId ? 'active' : ''}" data-evo-id="${s.id}" aria-label="Go to ${cap(s.name)}"><img src="${SPRITE(s.id, state.shiny)}" alt="${cap(s.name)}" loading="lazy" /><span class="evo-name">${niceName(s.name)}</span></button>`).join('')}</div>`).join('')}</div>`;
    box.querySelectorAll('[data-evo-id]').forEach((b) => b.addEventListener('click', () => goToId(parseInt(b.dataset.evoId, 10), true)));
  } catch (e) { box.innerHTML = `<p class="txt-muted text-sm">Couldn't load evolution data.</p>`; }
}

function describeTrigger(details) {
  const d = details?.[0];
  if (!d) return '';
  if (d.min_level) return 'Lv. ' + d.min_level;
  if (d.item) return niceName(d.item.name);
  if (d.trigger?.name === 'trade') return 'Trade' + (d.held_item ? ' w/ ' + niceName(d.held_item.name) : '');
  if (d.min_happiness) return 'Friendship';
  if (d.min_affection) return 'Affection';
  if (d.known_move_type) return niceName(d.known_move_type.name) + ' move';
  if (d.trigger?.name) return niceName(d.trigger.name);
  return '';
}

const fact = (label, value) => `<div class="fact-tile rounded-xl py-2.5 text-center"><p class="font-display font-600 text-lg leading-none">${value}</p><p class="text-[11px] uppercase tracking-wide txt-muted mt-1">${label}</p></div>`;

function navButton(dir, p) {
  if (!p) return `<div class="flex-1"></div>`;
  const isNext = dir === 'next';
  const thumb = `<img src="${SPRITE(p.id)}" alt="" loading="lazy" />`;
  const meta = `<span class="nav-meta text-${isNext ? 'right' : 'left'}"><span class="nav-dir block">${isNext ? 'Next' : 'Prev'} ${dexNo(p.id)}</span><span class="nav-name block">${cap(p.name)}</span></span>`;
  const arrow = `<svg class="w-4 h-4 flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${isNext ? 'm9 18 6-6-6-6' : 'm15 18-6-6 6-6'}"/></svg>`;
  return `<button type="button" data-nav="${dir}" class="nav-btn ${isNext ? 'justify-end' : ''}" aria-label="${isNext ? 'Next' : 'Previous'} Pokémon: ${cap(p.name)}">${isNext ? `${meta}${thumb}${arrow}` : `${arrow}${thumb}${meta}`}</button>`;
}

function closeModal() {
  stopSpeaking();
  el.modal.classList.remove('modal-open');
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  setTimeout(() => {
    el.modal.classList.add('hidden'); el.modal.classList.remove('flex');
    if (el['compare-modal'].classList.contains('hidden') && el['game-modal'].classList.contains('hidden')) document.body.style.overflow = '';
    if (lastFocused) lastFocused.focus();
  }, 250);
}

/* ============================================================
   Compare mode
   ============================================================ */
function addToCompare(id) {
  const i = state.compare.indexOf(id);
  if (i >= 0) state.compare.splice(i, 1);
  else { if (state.compare.length >= 2) state.compare.shift(); state.compare.push(id); }
  renderCompareTray();
}
async function renderCompareTray() {
  el['compare-tray'].classList.toggle('show', state.compare.length > 0);
  el['compare-go'].disabled = state.compare.length < 2;
  const items = await Promise.all(state.compare.map(async (id) => {
    const d = await getDetail(id).catch(() => null);
    return `<div class="cmp-chip"><img src="${SPRITE(id)}" alt="${d ? cap(d.name) : ''}" /><span>${d ? cap(d.name) : '#' + id}</span></div>`;
  }));
  el['compare-items'].innerHTML = items.join('') + (state.compare.length === 1 ? `<span class="txt-muted text-sm self-center">Pick one more…</span>` : '');
}
async function openCompare() {
  if (state.compare.length < 2) return;
  el['compare-modal'].classList.remove('hidden'); el['compare-modal'].classList.add('flex');
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => el['compare-modal'].classList.add('modal-open'));
  el['compare-card'].innerHTML = `<div class="flex items-center justify-center h-72"><span class="pokeball-icon pokeball-lg pokeball-spin"></span></div>`;
  const [a, b] = await Promise.all(state.compare.map(getDetail));
  const colA = typeColor(a.types[0].type.name), colB = typeColor(b.types[0].type.name);
  const totalA = statValue(a, 'total'), totalB = statValue(b, 'total');
  const head = (d) => `<div class="text-center flex-1 min-w-0"><img src="${ARTWORK(d.id)}" onerror="this.onerror=null;this.src='${SPRITE(d.id)}'" alt="${cap(d.name)}" class="w-24 h-24 mx-auto object-contain" /><p class="poke-dexno">${dexNo(d.id)}</p><p class="font-display font-700 text-lg capitalize leading-tight truncate">${niceName(d.name)}</p><div class="flex justify-center gap-1 mt-1">${d.types.map((t) => `<span class="type-badge" style="--type-color:${typeColor(t.type.name)}">${t.type.name}</span>`).join('')}</div></div>`;
  const rows = a.stats.map((s, i) => { const av = s.base_stat, bv = b.stats[i].base_stat; return `<div class="cmp-stat"><span class="cmp-val ${av >= bv ? 'win' : ''}" style="--c:${colA}">${av}</span><span class="cmp-bars"><span class="cmp-bar-a" style="width:${(av / 255) * 100}%;background:${colA}"></span><span class="cmp-bar-b" style="width:${(bv / 255) * 100}%;background:${colB}"></span><span class="cmp-stat-name">${STAT_LABELS[s.stat.name]}</span></span><span class="cmp-val ${bv >= av ? 'win' : ''}" style="--c:${colB}">${bv}</span></div>`; }).join('');
  el['compare-card'].innerHTML = `
    <div class="flex items-center justify-between p-4 border-b" style="border-color:var(--border)"><h2 class="font-display font-700 text-lg">Compare</h2><button id="cmp-close" class="modal-icon-dark" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>
    <div class="overflow-y-auto p-4">
      <div class="flex items-start gap-3 mb-3">${head(a)}<span class="self-center font-display font-700 txt-muted">vs</span>${head(b)}</div>
      <div class="flex justify-center mb-3">${radarSVG([{ stats: statArray(a), color: colA }, { stats: statArray(b), color: colB }], 200)}</div>
      <div class="flex justify-between text-sm font-700 mb-3"><span class="${totalA >= totalB ? 'win-text' : 'txt-muted'}">Total ${totalA}</span><span class="${totalB >= totalA ? 'win-text' : 'txt-muted'}">Total ${totalB}</span></div>
      <div class="space-y-2">${rows}</div>
    </div>`;
  el['compare-card'].querySelector('#cmp-close').addEventListener('click', closeCompare);
}
function closeCompare() {
  el['compare-modal'].classList.remove('modal-open');
  setTimeout(() => { el['compare-modal'].classList.add('hidden'); el['compare-modal'].classList.remove('flex'); if (el.modal.classList.contains('hidden') && el['game-modal'].classList.contains('hidden')) document.body.style.overflow = ''; }, 250);
}

/* ============================================================
   "Who's That Pokémon?" game
   ============================================================ */
function openGame() {
  el['game-modal'].classList.remove('hidden'); el['game-modal'].classList.add('flex');
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => el['game-modal'].classList.add('modal-open'));
  newRound();
}
function closeGame() {
  el['game-modal'].classList.remove('modal-open');
  setTimeout(() => { el['game-modal'].classList.add('hidden'); el['game-modal'].classList.remove('flex'); if (el.modal.classList.contains('hidden') && el['compare-modal'].classList.contains('hidden')) document.body.style.overflow = ''; }, 250);
}
function newRound() {
  const pool = state.baseList.length >= 4 ? state.baseList : state.nameList;
  const target = pool[rand(pool.length)];
  state.game.id = target.id;
  state.game.answered = false;
  // 3 distractors
  const options = [target];
  const guard = new Set([target.id]);
  while (options.length < 4 && guard.size < pool.length) {
    const c = pool[rand(pool.length)];
    if (!guard.has(c.id)) { guard.add(c.id); options.push(c); }
  }
  for (let i = options.length - 1; i > 0; i--) { const j = rand(i + 1); [options[i], options[j]] = [options[j], options[i]]; }

  el['game-card'].innerHTML = `
    <div class="flex items-center justify-between p-4 border-b" style="border-color:var(--border)">
      <h2 class="font-display font-700 text-lg">Who's That Pokémon?</h2>
      <button id="game-close" class="modal-icon-dark" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
    </div>
    <div class="p-5">
      <div class="flex justify-center gap-6 mb-4 text-center">
        <div><p class="font-display font-700 text-2xl" id="game-streak">${state.game.streak}</p><p class="text-[11px] uppercase tracking-wide txt-muted">Streak</p></div>
        <div><p class="font-display font-700 text-2xl" id="game-best">${state.game.best}</p><p class="text-[11px] uppercase tracking-wide txt-muted">Best</p></div>
      </div>
      <div class="game-stage"><img id="game-img" class="game-silhouette" src="${ARTWORK(target.id)}" onerror="this.onerror=null;this.src='${SPRITE(target.id)}'" alt="Mystery Pokémon" /></div>
      <p id="game-result" class="text-center font-display font-700 text-lg h-7 mt-2"></p>
      <div id="game-options" class="grid grid-cols-2 gap-2 mt-2">
        ${options.map((o) => `<button type="button" class="game-option" data-opt-id="${o.id}">${cap(o.name)}</button>`).join('')}
      </div>
      <button id="game-next" class="game-next hidden">Next ›</button>
    </div>`;
  el['game-card'].querySelector('#game-close').addEventListener('click', closeGame);
  el['game-card'].querySelector('#game-next').addEventListener('click', newRound);
  el['game-card'].querySelectorAll('.game-option').forEach((b) => b.addEventListener('click', () => guess(parseInt(b.dataset.optId, 10), b)));
}
async function guess(id, btn) {
  if (state.game.answered) return;
  state.game.answered = true;
  const correct = id === state.game.id;
  const img = el['game-card'].querySelector('#game-img');
  img.classList.remove('game-silhouette');
  el['game-card'].querySelectorAll('.game-option').forEach((b) => {
    b.disabled = true;
    if (parseInt(b.dataset.optId, 10) === state.game.id) b.classList.add('correct');
    else if (b === btn) b.classList.add('wrong');
  });
  const result = el['game-card'].querySelector('#game-result');
  if (correct) {
    state.game.streak++;
    if (state.game.streak > state.game.best) { state.game.best = state.game.streak; localStorage.setItem('pokedex-best', String(state.game.best)); }
    result.textContent = "It's " + cap(state.nameList.find((p) => p.id === state.game.id)?.name || '') + '!';
    result.style.color = 'var(--t-grass)';
  } else {
    state.game.streak = 0;
    result.textContent = cap(state.nameList.find((p) => p.id === state.game.id)?.name || '');
    result.style.color = 'var(--poke-red, #ee1515)';
  }
  el['game-card'].querySelector('#game-streak').textContent = state.game.streak;
  el['game-card'].querySelector('#game-best').textContent = state.game.best;
  el['game-card'].querySelector('#game-next').classList.remove('hidden');
  try { const d = await getDetail(state.game.id); const cry = d.cries?.latest || d.cries?.legacy; if (cry) { const a = new Audio(cry); a.volume = 0.4; a.play().catch(() => {}); } } catch (e) { /* ignore */ }
}

/* ============================================================
   Voice readout
   ============================================================ */
const synth = window.speechSynthesis;
let voices = [];
function loadVoices() { if (synth) voices = synth.getVoices(); }
loadVoices();
if (synth) synth.addEventListener?.('voiceschanged', loadVoices);
function pickVoice() {
  if (!voices.length) loadVoices();
  const want = LANGS.find((l) => l.code === state.lang)?.voice || 'en-US';
  const base = want.split('-')[0];
  return voices.find((v) => v.lang === want) || voices.find((v) => v.lang.startsWith(base)) || voices.find((v) => /^en/i.test(v.lang)) || voices[0];
}
function setReadIcon(btn, speaking) {
  if (!btn) return;
  btn.querySelector('.read-icon-play')?.classList.toggle('hidden', speaking);
  btn.querySelector('.read-icon-stop')?.classList.toggle('hidden', !speaking);
}
function speakEntry(text, btn) {
  if (!synth) return;
  if (synth.speaking || synth.pending) { synth.cancel(); setReadIcon(btn, false); return; }
  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice();
  if (v) u.voice = v;
  u.lang = LANGS.find((l) => l.code === state.lang)?.voice || 'en-US';
  u.pitch = 0.2; u.rate = 0.92; u.volume = 1;
  u.onend = () => setReadIcon(btn, false);
  u.onerror = () => setReadIcon(btn, false);
  setReadIcon(btn, true);
  synth.speak(u);
}
function stopSpeaking() { if (synth && (synth.speaking || synth.pending)) synth.cancel(); }

/* ===== Deep-link ===== */
function openFromHash() {
  const id = parseInt(location.hash.replace('#', ''), 10);
  if (!id || id < 1 || id > 1025) return;
  if (el.modal.classList.contains('hidden')) openModal(id);
}

function shade(hex, percent) {
  const h = hex.replace('#', '');
  const num = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  let r = (num >> 16) + Math.round(2.55 * percent);
  let g = ((num >> 8) & 0xff) + Math.round(2.55 * percent);
  let b = (num & 0xff) + Math.round(2.55 * percent);
  r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}
