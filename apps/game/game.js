// ─────────────────────────────────────────────────────────────────────────
//  EXAMPLE GAME RUNTIME  (role ③) — PixiJS / WebGL
//
//  Knows NOTHING about the editor or how the map was authored. Its only input
//  is a BUNDLE: map (placement data) + tileset images (pixels). Collision, the
//  player, the camera and skins are the GAME's interpretation, owned here.
//
//  Rendering is PixiJS (GPU). Swap the bundle — or just a same-grid tileset —
//  and this exact code renders a different world.
// ─────────────────────────────────────────────────────────────────────────
import { Application, Texture, Rectangle, Sprite, Container, Graphics } from 'pixi.js';
import { tileSrcRect, gidMeta, gidHasTag, tileTags } from '@poc/core';
import { loadBundleFromUrl, loadInlineBundle, loadImage, resolveCell } from './bundle.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Create a game bound to a canvas + HUD element. Call mount(source) to (re)load
// a bundle; mount can be called many times (the editor's ▶Play re-mounts).
export async function createGame(canvas, hud) {
  const app = new Application();
  await app.init({ canvas, width: canvas.width, height: canvas.height, background: '#0c0d11', antialias: false });

  const world = new Container();      // moved by the camera
  const tileLayers = new Container(); // all tile sprites
  const player = new Graphics();
  world.addChild(tileLayers);
  world.addChild(player);
  app.stage.addChild(world);

  const state = {
    map: null, images: null, base: '', skinImages: null,
    TW: 32, TH: 32, mapPxW: 0, mapPxH: 0,
    solidGrid: null, camera: { x: 0, y: 0 },
    p: { x: 0, y: 0, w: 20, h: 20, speed: 140 },
    skins: [], skinIndex: 0,
    textureCache: new Map(), // tileset image element -> base Texture
  };

  // ---- input ----
  const keys = new Set();
  const onKeyDown = (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    keys.add(e.key.toLowerCase());
    if (e.key.toLowerCase() === 't') cycleSkin();
  };
  const onKeyUp = (e) => keys.delete(e.key.toLowerCase());
  addEventListener('keydown', onKeyDown);
  addEventListener('keyup', onKeyUp);

  // base Texture for a tileset image, cached, with nearest-neighbor scaling.
  function baseTextureFor(img) {
    let tex = state.textureCache.get(img);
    if (!tex) {
      tex = Texture.from(img);
      tex.source.scaleMode = 'nearest';
      state.textureCache.set(img, tex);
    }
    return tex;
  }

  function buildTiles() {
    tileLayers.removeChildren().forEach((c) => c.destroy({ children: true }));
    const { map, images } = state;
    for (const layer of map.layers) {
      if (layer.visible === false) continue; // logic-only layers (e.g. Collision)
      const lc = new Container();
      lc.alpha = layer.opacity != null ? layer.opacity : 1;
      for (let r = 0; r < map.height; r++) {
        for (let c = 0; c < map.width; c++) {
          const gid = layer.data[r][c];
          if (!gid) continue;
          const info = resolveCell(gid, map.tilesets);
          if (!info) continue;
          const img = images.get(info.ts);
          if (!img) continue;
          const s = tileSrcRect(info.ts, info.local);
          const base = baseTextureFor(img);
          const sub = new Texture({ source: base.source, frame: new Rectangle(s.sx, s.sy, s.sw, s.sh) });
          const sp = new Sprite(sub);
          sp.x = c * state.TW;
          sp.y = r * state.TH;
          sp.width = state.TW;
          sp.height = state.TH;
          lc.addChild(sp);
        }
      }
      tileLayers.addChild(lc);
    }
  }

  function drawPlayer() {
    player.clear();
    player.rect(0, 0, state.p.w, state.p.h).fill(0xffd166);
    player.rect(4, 6, 3, 4).fill(0x1e1f26);
    player.rect(state.p.w - 7, 6, 3, 4).fill(0x1e1f26);
  }

  // Precompute which cells block movement. A cell is solid if EITHER (legacy)
  // it's non-empty on a layer named "Collision", OR (type metadata) any tile
  // placed there is marked `solid` in its tileset. The metadata path means a
  // wall is solid wherever it's painted — no dedicated collision layer needed.
  function buildCollision() {
    const m = state.map;
    const grid = new Array(m.width * m.height).fill(false);
    const collisionLayer = m.layers.find((l) => /collision/i.test(l.name)) || null;
    for (const layer of m.layers) {
      const legacy = layer === collisionLayer;
      for (let r = 0; r < m.height; r++) {
        for (let c = 0; c < m.width; c++) {
          const gid = layer.data[r][c];
          if (!gid) continue;
          // solid via: legacy Collision layer · `solid` flag · or a
          // Movement.Blocked gameplay tag (tags can drive behavior too)
          if (legacy || gidMeta(m.tilesets, gid).solid || gidHasTag(m.tilesets, gid, 'Movement.Blocked'))
            grid[r * m.width + c] = true;
        }
      }
    }
    return grid;
  }

  function solid(cx, cy) {
    const { map, solidGrid } = state;
    if (cx < 0 || cy < 0 || cx >= map.width || cy >= map.height) return true;
    return !!(solidGrid && solidGrid[cy * map.width + cx]);
  }

  // Merged gameplay tags of every tile stacked on a cell (across layers). The
  // game's runtime read path for tile classification — e.g. damage on
  // tagsAt(cx,cy).some(t => t.startsWith('Hazard')). Exposed on window.__game.
  function tagsAt(cx, cy) {
    const m = state.map;
    if (!m || cx < 0 || cy < 0 || cx >= m.width || cy >= m.height) return [];
    const out = new Set();
    for (const layer of m.layers) {
      const gid = layer.data[cy][cx];
      if (!gid) continue;
      const info = resolveCell(gid, m.tilesets);
      if (info) for (const t of tileTags(info.ts, info.local)) out.add(t);
    }
    return [...out];
  }
  function blocked(nx, ny) {
    const { p, TW, TH } = state;
    const x0 = Math.floor(nx / TW), x1 = Math.floor((nx + p.w - 1) / TW);
    const y0 = Math.floor(ny / TH), y1 = Math.floor((ny + p.h - 1) / TH);
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++) if (solid(cx, cy)) return true;
    return false;
  }

  function update(dt) {
    if (!state.map) return;
    const { p } = state;
    let dx = 0, dy = 0;
    if (keys.has('arrowleft') || keys.has('a')) dx -= 1;
    if (keys.has('arrowright') || keys.has('d')) dx += 1;
    if (keys.has('arrowup') || keys.has('w')) dy -= 1;
    if (keys.has('arrowdown') || keys.has('s')) dy += 1;
    if (dx && dy) { const k = Math.SQRT1_2; dx *= k; dy *= k; }
    const step = p.speed * dt;
    const tryX = p.x + dx * step;
    if (!blocked(tryX, p.y)) p.x = tryX;
    const tryY = p.y + dy * step;
    if (!blocked(p.x, tryY)) p.y = tryY;

    const vw = app.renderer.width, vh = app.renderer.height;
    state.camera.x = clamp(p.x + p.w / 2 - vw / 2, 0, Math.max(0, state.mapPxW - vw));
    state.camera.y = clamp(p.y + p.h / 2 - vh / 2, 0, Math.max(0, state.mapPxH - vh));

    world.x = -Math.round(state.camera.x);
    world.y = -Math.round(state.camera.y);
    player.x = p.x;
    player.y = p.y;
  }

  app.ticker.add((ticker) => update(ticker.deltaMS / 1000));

  async function cycleSkin() {
    if (state.skins.length < 2) return;
    state.skinIndex = (state.skinIndex + 1) % state.skins.length;
    const skin = state.skins[state.skinIndex];
    const src = state.skinImages?.[skin.image] || (state.base + skin.image);
    try {
      const img = await loadImage(src);
      const ts0 = state.map.tilesets[0];
      state.images.set(ts0, img);
      buildTiles();
      updateHud();
      if (window.__game) window.__game.skin = skin.id;
    } catch (e) { /* missing skin image — ignore */ }
  }

  function updateHud() {
    if (!hud) return;
    const m = state.map;
    const skin = state.skins.length ? `  ·  skin: ${state.skins[state.skinIndex].label} (T)` : '';
    hud.textContent =
      `map ${m.width}×${m.height}  ·  layers ${m.layers.length}  ·  ` +
      `tilesets ${m.tilesets.length}  ·  WASD/arrows to move${skin}`;
  }

  // source: { type:'url', url } | { type:'inline', inline }
  // inline = { map, images:{filename:dataURL}, ... }
  async function mount(source) {
    const loaded = source.type === 'inline'
      ? await loadInlineBundle(source.inline)
      : await loadBundleFromUrl(source.url);

    state.map = loaded.map;
    state.images = loaded.images;
    state.base = source.type === 'url' ? source.url.replace(/[^/]*$/, '') : '';
    state.skinImages = source.type === 'inline' ? source.inline.images : null;
    state.textureCache.clear();

    const m = loaded.map;
    state.TW = m.tileWidth; state.TH = m.tileHeight;
    state.mapPxW = m.width * m.tileWidth; state.mapPxH = m.height * m.tileHeight;
    state.solidGrid = buildCollision();
    state.skins = m.game?.skins ?? [];
    state.skinIndex = 0;

    const spawn = m.game?.spawn ?? { x: 1, y: 1 };
    state.p.speed = m.game?.playerSpeed ?? 140;
    state.p.x = spawn.x * state.TW + (state.TW - state.p.w) / 2;
    state.p.y = spawn.y * state.TH + (state.TH - state.p.h) / 2;

    buildTiles();
    drawPlayer();
    updateHud();

    // expose for inspection/testing
    window.__game = { map: state.map, player: state.p, camera: state.camera, solid, tagsAt, renderer: 'pixi' };
  }

  function resize(w, h) { app.renderer.resize(w, h); }

  function destroy() {
    removeEventListener('keydown', onKeyDown);
    removeEventListener('keyup', onKeyUp);
    app.destroy(true, { children: true });
  }

  return { mount, resize, destroy, app };
}
