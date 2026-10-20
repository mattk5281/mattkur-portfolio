const REFRESH_MS = 30000;
const GAMES_API = "https://games.roproxy.com/v1/games?universeIds=";
const THUMBS_API = "https://thumbnails.roproxy.com/v1/games/multiget/thumbnails?size=768x432&format=Png&countPerUniverse=1&universeIds=";

const state = GAMES.map(g => ({
  ...g,
  playing: g.fallback.playing,
  visits: g.fallback.visits,
  studio: g.fallback.studio,
  thumb: null,
  el: null
}));

const fmt = n => n.toLocaleString("en-US");
const ids = state.map(g => g.universeId).join(",");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const shown = new WeakMap();

function countTo(el, target) {
  const start = shown.get(el) ?? 0;
  if (reduceMotion || start === target) {
    el.textContent = fmt(target);
    shown.set(el, target);
    return;
  }
  const t0 = performance.now();
  const dur = start === 0 ? 1600 : 900;
  function step(now) {
    const p = Math.min(1, (now - t0) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(Math.round(start + (target - start) * eased));
    if (p < 1) requestAnimationFrame(step);
  }
  shown.set(el, target);
  requestAnimationFrame(step);
}

function sorted() {
  return [...state].sort((a, b) => b.playing - a.playing || b.visits - a.visits);
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
      ${g.bio ? `<p class="bio">${g.bio}</p>` : ""}
      <a class="game-link" href="${url}" target="_blank" rel="noopener">Play on Roblox <span>↗</span></a>
    </div>`;
  return el;
}

function updateCard(g, rank, live) {
  if (!g.el) g.el = buildCard(g);
  const q = s => g.el.querySelector(s);
  q(".rank").textContent = `#${rank}`;
  q(".b-playing").textContent = fmt(g.playing);
  q(".s-playing").textContent = fmt(g.playing);
  q(".s-visits").textContent = fmt(g.visits);
  q(".studio").textContent = g.studio;
  q(".badge .live-dot").classList.toggle("off", !live || g.playing === 0);
  const thumb = q(".thumb");
  if (g.thumb && !thumb.querySelector("img")) {
    const img = document.createElement("img");
    img.src = g.thumb;
    img.alt = `${g.title} thumbnail`;
    img.loading = "lazy";
    thumb.prepend(img);
  }
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

function renderTotals(live, showNote) {
  const visits = state.reduce((s, g) => s + g.visits, 0);
  const playing = state.reduce((s, g) => s + g.playing, 0);
  document.querySelectorAll('[data-total="visits"]').forEach(el => countTo(el, visits));
  document.querySelectorAll('[data-total="playing"]').forEach(el => countTo(el, playing));
  document.querySelectorAll(".total-dot").forEach(d => d.classList.toggle("off", !live));
  const note = document.getElementById("live-note");
  if (note && showNote) {
    const time = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
    note.innerHTML = live
      ? `<span class="live-dot"></span>Live from Roblox · updated ${time} · refreshes every ${REFRESH_MS / 1000}s`
      : `<span class="live-dot off"></span>Showing last saved stats · live data unavailable right now`;
  }
}

function renderHeroBg() {
  const bg = document.getElementById("hero-bg");
  if (!bg) return;
  const pics = state.map(g => g.thumb).filter(Boolean);
  if (!pics.length) return;
  bg.innerHTML = Array.from({ length: 9 }, (_, i) => `<div style="background-image:url('${pics[i % pics.length]}')"></div>`).join("");
}

function render(live, note = true) {
  renderGames(live);
  renderTotals(live, note);
}

async function loadStats() {
  try {
    const res = await fetch(GAMES_API + ids);
    if (!res.ok) throw new Error(res.status);
    const { data } = await res.json();
    data.forEach(d => {
      const g = state.find(x => x.universeId === d.id);
      if (!g) return;
      g.playing = d.playing ?? g.playing;
      g.visits = d.visits ?? g.visits;
      g.studio = d.creator?.name ?? g.studio;
    });
    return true;
  } catch (e) {
    return false;
  }
}

async function loadThumbs() {
  try {
    const res = await fetch(THUMBS_API + ids);
    if (!res.ok) return;
    const { data } = await res.json();
    data.forEach(d => {
      const g = state.find(x => x.universeId === d.universeId);
      const t = d.thumbnails && d.thumbnails[0];
      if (g && t && t.state === "Completed") g.thumb = t.imageUrl;
    });
  } catch (e) {}
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

(async () => {
  document.querySelectorAll(".year").forEach(el => (el.textContent = new Date().getFullYear()));
  setupReveal();
  render(false, false);
  const [live] = await Promise.all([loadStats(), loadThumbs()]);
  renderHeroBg();
  render(live);
  setInterval(async () => render(await loadStats()), REFRESH_MS);
})();
