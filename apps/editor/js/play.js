// ▶Play: run the CURRENT in-memory map in the real game runtime, live.
//
// The editor and game are separate apps. We embed the game in an iframe and
// hand it the working project as an INLINE bundle over postMessage — the same
// bundle shape the game accepts from disk, so "play" and "shipped" use one path.
//
// This is the dev-loop half of "one codebase, two deployments": edit → ▶Play →
// see it instantly; ship → `vite build` the game against a saved bundle.
import { state } from './state.js';
import { exportProject, imageName } from '@poc/core';

// Where the game dev server lives. Overridable via ?game= for flexibility.
const GAME_URL = new URLSearchParams(location.search).get('game') || 'http://localhost:5175/';

let els = null;
let ready = false;

export function initPlay(elements) {
  els = elements;
  els.btnPlay.addEventListener('click', open);
  els.btnPlayClose.addEventListener('click', close);
  els.btnPlayReload.addEventListener('click', sendBundle);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !els.overlay.hidden) close();
  });
  // messages from the embedded game
  window.addEventListener('message', (e) => {
    const d = e.data;
    if (d?.type === 'poc-ready') { ready = true; setStatus('connected'); sendBundle(); }
    else if (d?.type === 'poc-mounted') {
      window.__playAck = d.info;
      setStatus(`playing · ${d.info.width}×${d.info.height} · ${d.info.layers} layers · ${d.info.renderer}`);
    }
    else if (d?.type === 'poc-error') { setStatus('error: ' + d.message); }
  });
}

function open() {
  if (!state.project.tilesets.length) {
    alert('Add a tileset and paint something first.');
    return;
  }
  els.overlay.hidden = false;
  ready = false;
  setStatus('loading game…');
  // (re)load the iframe so we get a fresh 'poc-ready' handshake each open
  els.frame.src = GAME_URL;
}

function close() {
  els.overlay.hidden = true;
  els.frame.src = 'about:blank';
  ready = false;
}

// Build the inline bundle from the live project and post it to the game.
function sendBundle() {
  if (!ready) { setStatus('game not ready yet…'); return; }
  const bundle = buildPlayBundle(state.project);
  els.frame.contentWindow.postMessage({ type: 'poc-play', bundle }, '*');
  setStatus(`sending · ${bundle.map.width}×${bundle.map.height} · ${bundle.map.layers.length} layers`);
}

// project → { map (generic export + game hints), images:{file:dataURL} }
export function buildPlayBundle(project) {
  const map = JSON.parse(exportProject('generic', project).content);

  // gameplay hints the runtime reads.
  map.game = { spawn: { x: 1, y: 1 }, playerSpeed: 150 };

  // If the project has 2+ same-grid tilesets, offer them as skins to toggle.
  const grids = project.tilesets.map((t) => `${t.tileWidth}x${t.tileHeight}x${t.columns}`);
  if (project.tilesets.length >= 2 && grids.every((g) => g === grids[0])) {
    map.game.skins = project.tilesets.map((t, i) => ({
      id: 'skin' + i, image: imageName(t.name), label: t.name,
    }));
  }

  // images keyed by the exported filename (what map.tilesets[].image holds)
  const images = {};
  for (const ts of project.tilesets) images[imageName(ts.name)] = ts.image;

  return { map, images };
}

function setStatus(s) { if (els?.status) els.status.textContent = s; }
