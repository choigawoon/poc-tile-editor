# Architecture — three separated roles

This project deliberately splits responsibilities into three parts that only
touch each other through one well-defined artifact: **the bundle**. The
directory layout mirrors these roles one-to-one, and a shared `@poc/core` SDK
gives the tool and the game one definition of the format.

```
┌──────────────────────┐     ┌─────────────────────┐     ┌──────────────────────┐
│ ① apps/editor/       │     │ ② bundles/          │     │ ③ apps/game/         │
│   (the tool, Vite)   │ ──▶ │   (the contract)    │ ──▶ │   (the game, PixiJS) │
│                      │     │                     │     │                      │
│ where human intent   │     │ data + resources    │     │ just consumes it     │
│ goes in: paint, fill,│     │ only, NO logic:     │     │ owns interpretation: │
│ rect, layers, (later │     │  • map.json         │     │  collision, player,  │
│ procedural gen)      │     │  • tileset PNG(s)   │     │  camera, skins       │
└──────────┬───────────┘     └─────────────────────┘     └──────────┬───────────┘
           └──────────▶ packages/core (@poc/core) ◀─────────────────┘
              shared SDK: gid math + exporters (no DOM, no app state)
        tool's job ends here ──────┘         └────── game's job starts here
```

The root `index.html` is a landing page that links to all three so the structure
is graspable the moment you open the project. Both apps run through **Vite**
(`npm run dev` / `npm run dev:game`) because they import `@poc/core` by name.

## Why this split

The game needs only two things: **the tileset resource** (pixels) and **how the
map was laid out** (placement data). It must *not* need to know *how* or *why*
the map was authored — that's where human intent lives, and intent is hard to
generate automatically. So the tool owns generation (many possible methods), and
the game owns consumption. The bundle is the seam between them.

Change anything on the tool side — procedural generators, new brushes, AI
assists — and the game is unaffected as long as it still emits a valid bundle.
Change the game — new physics, entities, lighting — and authoring is unaffected.

## The shared core (`packages/core`, `@poc/core`)

Pure tile-format SDK with no DOM and no app state: `resolveGid`, `tileSrcRect`,
`atlasCoord`, `slug`, `imageName`, and the four exporters (generic/tiled/godot/
unity). Both the editor and the game (and `tools/make-demo-bundle.mjs`) import
it, so the tool and the game share one definition of the format — they can never
drift apart.

## ① The editor (`apps/editor/`)

```
apps/editor/
  index.html        editor shell
  vite.config.js    dev server (HMR) + production build
  css/style.css
  js/               state · history · renderer · palette · tools · panels · project
    persist.js      localStorage autosave + restore
    play.js         ▶Play: post the live map to the embedded game
    default-project.js  first-run starter scene (2 sample tilesets)
    exporters/      thin re-exports of @poc/core + DOM download glue
```

Run with `npm run dev` (HMR on :5173) or `npm run build:editor` (minified
`dist/`, `@poc/core` bundled in). The exporters here are thin wrappers around the
shared SDK; the real format logic lives in `packages/core`.

## ② The bundle (`bundles/demo/`)

```
bundles/demo/
  map.json            placement data: layers of tile ids (gid), 0 = empty
  tileset.day.png     resource: the tiles (bright tone)
  tileset.night.png   resource: same 8×8 grid, cool tone  (a reskin)
```

`map.json` is produced by the **real Generic exporter** (`@poc/core`) — the exact
code path the editor's *Export* button uses. Built with `npm run bundle:demo`.

Key properties of the contract:

- **Tile ids are positional, not pixels.** A cell stores `gid = tileset.firstId +
  localIndex`; `localIndex → (col,row)` in the tileset grid. The *meaning* of a
  cell is "tile #N"; what #N looks like is decided by the PNG.
- **Layers are just named grids.** The game assigns meaning by convention (a
  layer named `Collision` = solid cells). The data does not encode behavior.
- **Optional `game` block** carries tool-authored hints: `spawn`, `playerSpeed`,
  `skins` (alternate same-grid tilesets).

## ③ The game runtime (`apps/game/`)

A PixiJS (WebGL) top-down walker. It depends on **nothing but the bundle**: load
the map → build a `Sprite` per tile from the tileset texture → run its own
collision/player/camera. Run with `npm run dev:game` (HMR, :5175); ships via
`npm run build:game`.

```
apps/game/
  main.js     entry — picks the bundle source, runs the engine
  game.js     PixiJS engine: world container, tile sprites, player, ticker
  bundle.js   bundle loading (URL or inline) — uses @poc/core for gid math
```

Bundle source priority: **postMessage** (the editor's ▶Play) › **`?bundle=`**
URL › the shipped demo. So one engine serves dev play *and* the release build.

Interpretations the **game** owns (not the data):

1. **Collision** — any non-empty cell on the `Collision` layer is solid.
2. **Gameplay hints** — reads `map.game.spawn` / `playerSpeed` if present.
3. **Skins** — `map.game.skins` lists alternate same-grid PNGs; press **T** to
   hot-swap day↔night. The map data never changes; only the pixels do.

## ▶ Play — the dev loop (one codebase, two deployments)

In development the editor and game are two Vite servers. The editor's **▶ Play**
embeds the game in an iframe and posts the *live* project as an **inline bundle**
(`exportProject('generic')` + tileset dataURLs). The game mounts it and acks —
edit → Play → see it instantly, no export/copy.

For release each app builds independently (`npm run build:all`): editor and game
each emit a minimized `dist/` with `@poc/core` tree-shaken in. The game build
also bundles its demo `map.json` + PNGs (`tools/sync-dist-bundle.mjs` copies the
canonical bundle into `apps/game/dist/bundles/demo/`).

## The reskin guarantee (demonstrated)

Because cells reference tile *indices*, swapping the tileset PNG for another with
the **same grid** (tile size, columns, tile count, consistent per-index meaning)
re-tones every map that uses it — with **zero changes to map data or game code**.

Verified live: same `map.json`, same game code, switching `tileset.day.png` →
`tileset.night.png` shifted the average rendered tone from a warm grass-green to
a darker cool. The map stayed identical.

```bash
node tools/make-tileset-variant.mjs night     # → samples/tileset.night.png
node tools/make-tileset-variant.mjs autumn    # warm
node tools/make-tileset-variant.mjs toxic     # green
```

### Rules for a safe reskin

| Must match the original | Why |
|---|---|
| tile width / height | grid cell size must be identical |
| image width / columns | `index → (col,row)` mapping must hold |
| per-index meaning (grass=grass…) | so the swap looks intentional |
| margin / spacing | atlas coordinate math must line up |

A PNG that only changes the *palette* (not the layout) is always safe. Change the
column count and indices shift — that's a *different* tileset, not a reskin.

## Try it

```bash
npm install
npm run dev                           # ① editor (Vite + HMR) → http://localhost:5173
npm run dev:game                      # ③ game  (Vite + Pixi) → http://localhost:5175
# in the editor: hit ▶ Play to run the live map; in the game: T = day/night
npm run build:all                     # release: apps/editor/dist + apps/game/dist
```
