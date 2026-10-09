const REFRESH_MS = 30000;
const GAMES_API = "https://games.roproxy.com/v1/games?universeIds=";
const THUMBS_API = "https://thumbnails.roproxy.com/v1/games/multiget/thumbnails?size=768x432&format=Png&countPerUniverse=1&universeIds=";

const state = GAMES.map(g => ({
  ...g,
  playing: g.fallback.playing,
  visits: g.fallback.visits,
  studio: g.fallback.studio,
  thumb: null
}));

const fmt = n => n.toLocaleString("en-US");
const ids = () => state.map(g => g.universeId).join(",");

const shown = { visits: 0, playing: 0 };

function animate(el, key, target) {
  const start = shown[key];
  const t0 = performance.now();
  const dur = 1200;
  function step(now) {
    const p = Math.min(1, (now - t0) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    const v = Math.round(start + (target - start) * eased);
    el.textContent = fmt(v);
    if (p < 1) requestAnimationFrame(step);
    else shown[key] = target;
  }
  requestAnimationFrame(step);
}

function sorted() {
  return [...state].sort((a, b) => b.playing - a.playing || b.visits - a.visits);
}

function card(g, i) {
  const url = `https://www.roblox.com/games/${g.placeId}`;
  const bio = g.bio
    ? `<p class="bio">${g.bio}</p>`
    : `<p class="bio placeholder">Project details coming soon.</p>`;
  const img = g.thumb ? `<img src="${g.thumb}" alt="${g.title} thumbnail" loading="lazy">` : "";
  return `
    <article class="card game">
      <div class="thumb">${img}<span class="rank">#${i + 1}</span></div>
      <div class="game-body">
        <h3>${g.title}</h3>
        <div class="studio">${g.studio}</div>
        <div class="game-stats">
          <div class="playing-now"><strong>${fmt(g.playing)}</strong>playing now</div>
          <div><strong>${fmt(g.visits)}</strong>all-time plays</div>
        </div>
        ${bio}
        <a class="btn btn-ghost" href="${url}" target="_blank" rel="noopener">Play on Roblox ↗</a>
      </div>
    </article>`;
}

function render(live) {
  document.getElementById("games").innerHTML = sorted().map(card).join("");
  const totalVisits = state.reduce((s, g) => s + g.visits, 0);
  const totalPlaying = state.reduce((s, g) => s + g.playing, 0);
  animate(document.getElementById("total-visits"), "visits", totalVisits);
  animate(document.getElementById("total-playing"), "playing", totalPlaying);
  document.querySelectorAll(".live-dot").forEach(d => d.classList.toggle("off", !live));
  const time = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
  document.getElementById("updated").textContent = live
    ? `Live from Roblox · updated ${time} · refreshes every ${REFRESH_MS / 1000}s`
    : "Showing last saved stats · live data unavailable right now";
}

async function loadStats() {
  try {
    const res = await fetch(GAMES_API + ids());
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
    const res = await fetch(THUMBS_API + ids());
    if (!res.ok) return;
    const { data } = await res.json();
    data.forEach(d => {
      const g = state.find(x => x.universeId === d.universeId);
      const t = d.thumbnails && d.thumbnails[0];
      if (g && t && t.state === "Completed") g.thumb = t.imageUrl;
    });
  } catch (e) {}
}

async function tick() {
  const live = await loadStats();
  render(live);
}

(async () => {
  render(false);
  const [live] = await Promise.all([loadStats(), loadThumbs()]);
  render(live);
  setInterval(tick, REFRESH_MS);
})();
