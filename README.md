# 🧩 POC Tile Editor

A browser-based tile map **editor** with one-click export to **Godot 4**,
**Unity**, **Tiled (.tmj)**, and an engine-agnostic **Generic JSON** format —
plus a runnable **PixiJS game** that proves the data is engine-ready. A Vite +
npm-workspaces monorepo where the tool and the game share one format SDK.

![stack](https://img.shields.io/badge/stack-Vite%20%2B%20PixiJS-blue) ![core](https://img.shields.io/badge/shared-%40poc%2Fcore-green)

## The pipeline — three decoupled roles

Split into three parts joined only by a **bundle** (data + resources, no logic)
and a shared **`@poc/core`** SDK. See [ARCHITECTURE.md](ARCHITECTURE.md) for the
full story.

```
① apps/editor/  ──▶  ② bundles/  ──▶  ③ apps/game/
  the tool              the contract       the game (PixiJS)
  (intent in)           map.json + PNGs    (consumes only the bundle)
        └── shares ──▶ packages/core (@poc/core) ◀── shares ──┘
```

**One codebase, two deployments.** In development the editor and game run as two
Vite dev servers with HMR; the editor's **▶ Play** embeds the game and feeds it
the live map, so you test instantly. For release, each app builds to its own
optimized `dist/`.

## Quick start

```bash
npm install
npm run dev          # ① editor  → http://localhost:5173  (HMR)
npm run dev:game     # ③ game     → http://localhost:5175  (HMR, PixiJS)
```

- **Editor** → <http://localhost:5173> — paint, then hit **▶ Play** to run the
  live map in the embedded game (no export step). Work autosaves to the browser.
- **Game (standalone)** → <http://localhost:5175> — loads the demo bundle; press
  **T** for day/night. Load any map with `?bundle=<url-to-map.json>`.

### Release build

```bash
npm run build:all    # builds apps/editor/dist and apps/game/dist
# or individually:
npm run build:editor
npm run build:game   # rebuilds the demo bundle, tree-shakes Pixi, syncs the bundle into dist
```

> Both apps import `@poc/core` by bare specifier, so they run through Vite (which
> resolves the workspace). The root `index.html` landing page links to the dev
> servers.

## Editor usage

1. The editor opens with a starter scene (two sample tilesets + a small map).
   Add more tilesets with **＋** next to *Tilesets* (or replace the project).
2. Select tiles in the **Palette** (click, or drag to grab a multi-tile stamp).
3. Paint on the canvas. Add **Layers** on the right; set the **Map** size.
4. **▶ Play** to test live, or pick an **Export target** and hit **Export ⤓**.

| Key | Tool |  | Key | Action |
|-----|------|--|-----|--------|
| `B` | Brush / stamp | | `Ctrl/⌘ + Z` | Undo |
| `E` | Eraser | | `Ctrl/⌘ + Shift + Z` | Redo |
| `G` | Fill (flood) | | `Space`-drag / middle-drag | Pan |
| `R` | Rectangle | | Mouse wheel | Zoom |
| `I` | Picker | | | |

Work **autosaves** to `localStorage` and restores on reload. **New** clears it.
**Save / Load** writes a self-contained `*.tileproj.json` (tilesets embedded).

## Export formats

Every export downloads the data file **plus the tileset PNG(s)**. Exporters live
in `@poc/core` (shared by the editor's *Export* button and the bundle builder).

| Target | File | How to consume |
|--------|------|----------------|
| Generic JSON | `name.json` | 2D arrays, `0` = empty, ids are global. Read in any engine/tool. |
| Tiled | `name.tmj` | Open in [Tiled](https://www.mapeditor.org/), or import via Godot / SuperTiled2Unity. |
| Godot 4 | `name.godot.json` | Use `engine-templates/godot/TileMapImporter.gd`. |
| Unity | `name.unity.json` | Use `engine-templates/unity/TileMapImporter.cs`. |

## The game & bundles

`apps/game` (PixiJS) depends on **nothing but a bundle**. Build the demo bundle
(uses the real Generic exporter from `@poc/core`):

```bash
npm run bundle:demo            # → bundles/demo/ (map.json + day/night PNGs)
```

Make alternate-tone, same-grid tilesets for drop-in reskins:

```bash
node tools/make-tileset-variant.mjs night    # → samples/tileset.night.png
node tools/make-tileset-variant.mjs autumn
```

Because cells store tile **indices** (not pixels), swapping the tileset PNG for a
same-grid one re-tones every map — no data or code changes. See
[ARCHITECTURE.md](ARCHITECTURE.md) → *reskin rules*.

## Project structure

```
package.json            # npm workspaces root (dev/build scripts)
index.html              # landing page → links to the dev servers
│
├── packages/core/      # 🔑 @poc/core — shared SDK (gid math + exporters), no DOM
│   └── src/
├── apps/editor/        # ① the tool   — Vite app: paint, layers, autosave, ▶Play
│   ├── vite.config.js
│   └── js/             #   state · history · renderer · palette · tools · panels · project · persist · play
├── apps/game/          # ③ the game   — Vite + PixiJS: bundle.js · game.js · main.js
│   └── public/         #   (mirrored demo bundle, generated)
│
├── bundles/demo/       # ② the contract — map.json + tileset.day/night.png
├── engine-templates/   # Godot (.gd) & Unity (.cs) runtime importers
├── tools/              # make-demo-bundle · make-sample-tileset · make-tileset-variant · sync-dist-bundle
├── samples/            # source tilesets
└── ARCHITECTURE.md
```

## License

MIT
