// ─────────────────────────────────────────────────────────────────────────
//  EXAMPLE GAME RUNTIME  (role ③)
//
//  This file knows NOTHING about the editor or how the map was authored.
//  Its only input is a BUNDLE: a map.json (placement data) + tileset.png
//  (pixels). Everything gameplay-related — collision, the player, the camera —
//  is the GAME's interpretation, owned here, not in the data.
//
//  Swap the bundle (or just the tileset.png with a same-grid one) and this
//  exact code renders a different world. That is the whole point.
// ─────────────────────────────────────────────────────────────────────────

const BUNDLE_URL = new URL('../bundles/demo/map.json', import.meta.url).href;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const hud = document.getElementById('hud');

// ---- bundle loading (the only dependency on the outside world) ----
// `skinImage`, when given, overrides each tileset's image filename — this is how
// the game reskins (day↔night) by loading a different same-grid PNG. The map
// data (gids) is untouched; only the pixels change.
async function loadBundle(url, skinImage) {
  const map = await (await fetch(url)).json();
  const base = url.replace(/[^/]*$/, '');
  const images = await Promise.all(map.tilesets.map((ts) =>
    loadImage(base + (skinImage || ts.image)).then((img) => [ts, img])));
  return { map, images: new Map(images), base };
}

function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('image load failed: ' + src));
    img.src = src;
  });
}

// gid (global id) → which tileset + local index. 0 = empty. Mirrors the
// format's contract: gid = tileset.firstId + localIndex.
function resolve(gid, tilesets) {
  if (gid <= 0) return null;
  let t = null;
  for (const ts of tilesets) if (gid >= ts.firstId) t = ts;
  if (!t) return null;
  return { ts: t, local: gid - t.firstId };
}

function srcRect(ts, local) {
  const col = local % ts.columns;
  const row = Math.floor(local / ts.columns);
  return {
    sx: ts.margin + col * (ts.tileWidth + ts.spacing),
    sy: ts.margin + row * (ts.tileHeight + ts.spacing),
    sw: ts.tileWidth, sh: ts.tileHeight,
  };
}

// ---- the game ----
function start({ map, images, base }) {
  const TW = map.tileWidth, TH = map.tileHeight;
  const mapPxW = map.width * TW, mapPxH = map.height * TH;

  // GAME-OWNED interpretation #3: skins. The bundle may advertise alternate
  // same-grid tilesets under map.game.skins; the game can hot-swap the pixels.
  const skins = map.game?.skins ?? [];
  let skinIndex = 0;
  let currentImages = images;
  async function applySkin(i) {
    if (!skins.length) return;
    skinIndex = (i + skins.length) % skins.length;
    const skin = skins[skinIndex];
    const img = await loadImage(base + skin.image);
    currentImages = new Map(map.tilesets.map((ts) => [ts, img]));
    window.__game.images = currentImages;
    window.__game.skin = skin.id;
    updateHud();
  }

  // GAME-OWNED interpretation #1: collision.
  // Convention: any non-empty cell on the layer named "Collision" is solid.
  // The data carries placement; the GAME decides it means "you can't walk here".
  const collisionLayer = map.layers.find((l) => /collision/i.test(l.name));
  const solid = (cx, cy) => {
    if (cx < 0 || cy < 0 || cx >= map.width || cy >= map.height) return true;
    return !!(collisionLayer && collisionLayer.data[cy][cx]);
  };

  // GAME-OWNED interpretation #2: gameplay hints from the bundle (optional).
  const spawn = map.game?.spawn ?? { x: 1, y: 1 };
  const player = {
    x: spawn.x * TW + (TW - 20) / 2,
    y: spawn.y * TH + (TH - 20) / 2,
    w: 20, h: 20,
    speed: map.game?.playerSpeed ?? 140,
  };

  // visible layers, in order, excluding logic-only layers
  const drawLayers = map.layers.filter((l) => l.visible !== false);

  // input
  const keys = new Set();
  addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    keys.add(e.key.toLowerCase());
    if (e.key.toLowerCase() === 't') applySkin(skinIndex + 1); // T = toggle skin
  });
  addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

  const camera = { x: 0, y: 0 };

  // AABB vs solid tiles — checked per axis so we slide along walls.
  function blocked(nx, ny) {
    const x0 = Math.floor(nx / TW), x1 = Math.floor((nx + player.w - 1) / TW);
    const y0 = Math.floor(ny / TH), y1 = Math.floor((ny + player.h - 1) / TH);
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++)
        if (solid(cx, cy)) return true;
    return false;
  }

  function update(dt) {
    let dx = 0, dy = 0;
    if (keys.has('arrowleft') || keys.has('a')) dx -= 1;
    if (keys.has('arrowright') || keys.has('d')) dx += 1;
    if (keys.has('arrowup') || keys.has('w')) dy -= 1;
    if (keys.has('arrowdown') || keys.has('s')) dy += 1;
    if (dx && dy) { const k = Math.SQRT1_2; dx *= k; dy *= k; }

    const step = player.speed * dt;
    const tryX = player.x + dx * step;
    if (!blocked(tryX, player.y)) player.x = tryX;
    const tryY = player.y + dy * step;
    if (!blocked(player.x, tryY)) player.y = tryY;

    // camera follows player, clamped to map bounds
    const viewW = canvas.width, viewH = canvas.height;
    camera.x = clamp(player.x + player.w / 2 - viewW / 2, 0, Math.max(0, mapPxW - viewW));
    camera.y = clamp(player.y + player.h / 2 - viewH / 2, 0, Math.max(0, mapPxH - viewH));
  }

  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0c0d11';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(1, 0, 0, 1, -Math.round(camera.x), -Math.round(camera.y));

    // only draw tiles within the viewport
    const c0 = Math.max(0, Math.floor(camera.x / TW));
    const r0 = Math.max(0, Math.floor(camera.y / TH));
    const c1 = Math.min(map.width - 1, Math.ceil((camera.x + canvas.width) / TW));
    const r1 = Math.min(map.height - 1, Math.ceil((camera.y + canvas.height) / TH));

    for (const layer of drawLayers) {
      if (layer.opacity != null) ctx.globalAlpha = layer.opacity;
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const gid = layer.data[r][c];
          if (!gid) continue;
          const info = resolve(gid, map.tilesets);
          if (!info) continue;
          const img = currentImages.get(info.ts);
          if (!img) continue;
          const s = srcRect(info.ts, info.local);
          ctx.drawImage(img, s.sx, s.sy, s.sw, s.sh, c * TW, r * TH, TW, TH);
        }
      }
      ctx.globalAlpha = 1;
    }

    // player (a simple sprite the GAME owns — not from the bundle)
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(player.x, player.y, player.w, player.h);
    ctx.fillStyle = '#1e1f26';
    ctx.fillRect(player.x + 4, player.y + 6, 3, 4);
    ctx.fillRect(player.x + player.w - 7, player.y + 6, 3, 4);
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  function updateHud() {
    const skinLabel = skins.length ? `  ·  skin: ${skins[skinIndex].label} (press T)` : '';
    hud.textContent =
      `bundle: ${BUNDLE_URL.split('/').slice(-2).join('/')}  ·  ` +
      `map ${map.width}×${map.height}  ·  layers ${map.layers.length}  ·  ` +
      `tilesets ${map.tilesets.length}  ·  WASD/arrows to move${skinLabel}`;
  }

  // expose for inspection/testing
  window.__game = { map, player, camera, solid, images: currentImages, skin: skins[0]?.id, applySkin };
  updateHud();
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

loadBundle(BUNDLE_URL)
  .then(start)
  .catch((err) => {
    hud.textContent = 'Failed to load bundle: ' + err.message +
      '  (did you run: node tools/make-demo-bundle.mjs ?)';
    console.error(err);
  });
