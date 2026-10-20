const REFRESH_MS = 30000;
const TIMEOUT_MS = 5000;
const RETRY_DELAYS = [0, 250, 500, 1000, 1500, 2500, 4000];
const CACHE_KEY = "mk-stats-v1";
const THUMB_KEY = "mk-thumbs-v1";
const CACHE_MAX_AGE = 120000;
const THUMB_MAX_AGE = 86400000;
const GAMES_API = "https://games.roproxy.com/v1/games?universeIds=";
const THUMBS_API = "https://thumbnails.roproxy.com/v1/games/multiget/thumbnails?size=768x432&format=Png&countPerUniverse=1&universeIds=";

const state = GAMES.map(g => ({
  ...g,
  playing: null,
  visits: g.fallback.visits,
  studio: g.fallback.studio,
  thumb: null,
  el: null
}));

const fmt = n => (n == null ? "—" : n.toLocaleString("en-US"));
const ids = state.map(g => g.universeId).join(",");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const shown = new WeakMap();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
let lastUpdated = null;

function setNum(el, target, animate) {
  el.classList.remove("pending");
  const start = shown.get(el) ?? 0;
  shown.set(el, target);
  if (!animate || reduceMotion || document.hidden || start === target) {
    el.textContent = fmt(target);
    return;
  }
  const t0 = performance.now();
  const dur = start === 0 ? 1200 : 700;
  function step(now) {
    const p = Math.min(1, (now - t0) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(Math.round(start + (target - start) * eased));
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function sorted() {
  return [...state].sort((a, b) => (b.playing ?? -1) - (a.playing ?? -1) || b.visits - a.visits);
}

function buildCard(g) {
  const el = document.createElement("article");
  el.className = "game";
  const url = `https://www.roblox.com/games/${g.placeId}`;
  el.innerHTML = `
    <a class="thumb" href="${url}" target="_blank" rel="noopener" aria-label="Play ${g.title} on Roblox">
      <div class="badge-row">
        <span class="badge rank"></span>
        <span class="badge"><span class="live-dot off"></span><span class="b-playing"></span> playing</span>
      </div>
    </a>
    <div class="game-body">
      <h3>${g.title}</h3>
      <div class="meta"><span class="studio"></span> · ${g.year}</div>
      <div class="game-stats">
        <div class="now"><strong class="s-playing"></strong>playing now</div>
        <div><strong class="s-visits"></strong>all-time plays</div>
      </div>
      ${g.bio ? `<div class="role-label">What I did</div><p class="bio">${g.bio}</p>` : ""}
      <a class="game-link" href="${url}" target="_blank" rel="noopener">Play on Roblox <span>↗</span></a>
    </div>`;
  return el;
}

function addThumb(g) {
  if (!g.el || !g.thumb) return;
  const thumb = g.el.querySelector(".thumb");
  if (thumb.querySelector("img")) return;
  const img = document.createElement("img");
  img.src = g.thumb;
  img.alt = `${g.title} thumbnail`;
  img.loading = "lazy";
  thumb.prepend(img);
}

function updateCard(g, rank, live) {
  if (!g.el) g.el = buildCard(g);
  const q = s => g.el.querySelector(s);
  q(".rank").textContent = `#${rank}`;
  q(".b-playing").textContent = fmt(g.playing);
  q(".s-playing").textContent = fmt(g.playing);
  q(".s-visits").textContent = fmt(g.visits);
  q(".studio").textContent = g.studio;
  q(".badge .live-dot").classList.toggle("off", !live || !g.playing);
  addThumb(g);
}

function showSkeletons() {
  const box = document.getElementById("games");
  if (!box) return;
  const count = Number(box.dataset.limit) || state.length;
  box.innerHTML = Array.from({ length: count }, () => `<div class="game skeleton"><div class="thumb"></div></div>`).join("");
}

function renderGames(live) {
  const box = document.getElementById("games");
  if (!box) return;
  const limit = Number(box.dataset.limit) || state.length;
  const featured = box.hasAttribute("data-featured");
  const order = sorted();
  order.forEach((g, i) => updateCard(g, i + 1, live));
  const list = order.slice(0, limit).map(g => g.el);
  list.forEach((el, i) => el.classList.toggle("featured", featured && i === 0));
  box.replaceChildren(...list);
}

function renderTotals(live) {
  const visits = state.reduce((s, g) => s + g.visits, 0);
  const playing = live ? state.reduce((s, g) => s + (g.playing || 0), 0) : null;
  document.querySelectorAll('[data-total="visits"]').forEach(el => setNum(el, visits, true));
  document.querySelectorAll('[data-total="playing"]').forEach(el => setNum(el, playing, false));
  document.querySelectorAll(".total-dot").forEach(d => d.classList.toggle("off", !live));
  const note = document.getElementById("live-note");
  if (note) {
    const time = new Date(lastUpdated || Date.now()).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
    note.innerHTML = live
      ? `<span class="live-dot"></span>Live from Roblox · updated ${time} · refreshes every ${REFRESH_MS / 1000}s`
      : `<span class="live-dot off"></span>Live player counts unavailable right now · showing saved play totals`;
  }
}

function renderHeroBg() {
  const bg = document.getElementById("hero-bg");
  if (!bg) return;
  const pics = state.map(g => g.thumb).filter(Boolean);
  if (!pics.length) return;
  bg.innerHTML = Array.from({ length: 9 }, (_, i) => `<div style="background-image:url('${pics[i % pics.length]}')"></div>`).join("");
}

async function getJSON(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function applyStats(data) {
  data.forEach(d => {
    const g = state.find(x => x.universeId === d.id);
    if (!g) return;
    g.playing = d.playing ?? 0;
    g.visits = d.visits ?? g.visits;
    g.studio = d.creator?.name ?? g.studio;
  });
}

async function loadStats(delays = RETRY_DELAYS) {
  for (const wait of delays) {
    if (wait) await sleep(wait);
    try {
      const { data } = await getJSON(GAMES_API + ids);
      if (!Array.isArray(data) || !data.length) throw new Error("empty");
      applyStats(data);
      lastUpdated = Date.now();
      store.set(CACHE_KEY, { t: lastUpdated, data: data.map(d => ({ id: d.id, playing: d.playing, visits: d.visits, creator: { name: d.creator?.name } })) });
      return true;
    } catch (e) {}
  }
  return false;
}

function applyThumbs(map) {
  state.forEach(g => { if (map[g.universeId]) g.thumb = map[g.universeId]; });
  state.forEach(addThumb);
  renderHeroBg();
}

async function loadThumbs() {
  const cached = store.get(THUMB_KEY);
  if (cached && cached.map && Date.now() - cached.t < THUMB_MAX_AGE) {
    applyThumbs(cached.map);
    return;
  }
  for (const wait of [0, 800, 2000]) {
    if (wait) await sleep(wait);
    try {
      const { data } = await getJSON(THUMBS_API + ids);
      const map = {};
      data.forEach(d => {
        const t = d.thumbnails && d.thumbnails[0];
        if (t && t.state === "Completed") map[d.universeId] = t.imageUrl;
      });
      store.set(THUMB_KEY, { t: Date.now(), map });
      applyThumbs(map);
      return;
    } catch (e) {}
  }
}

function setupReveal() {
  const items = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) {
    items.forEach(el => el.classList.add("in"));
    return;
  }
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add("in");
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.12 });
  items.forEach(el => io.observe(el));
}

async function refresh() {
  if (!document.hidden && await loadStats([0, 1000, 2500])) {
    renderGames(true);
    renderTotals(true);
  }
  setTimeout(refresh, lastUpdated ? REFRESH_MS : 8000);
}

(async () => {
  document.querySelectorAll(".year").forEach(el => (el.textContent = new Date().getFullYear()));
  setupReveal();
  const cached = store.get(CACHE_KEY);
  if (cached && Array.isArray(cached.data) && Date.now() - cached.t < CACHE_MAX_AGE) {
    applyStats(cached.data);
    lastUpdated = cached.t;
    renderGames(true);
    renderTotals(true);
  } else {
    showSkeletons();
  }
  loadThumbs();
  const live = await loadStats();
  if (live || !lastUpdated) {
    renderGames(live);
    renderTotals(live);
  }
  setTimeout(refresh, live ? REFRESH_MS : 8000);
})();
