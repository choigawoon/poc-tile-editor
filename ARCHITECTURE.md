# Architecture — three separated roles

This project deliberately splits responsibilities into three parts that only
touch each other through one well-defined artifact: **the bundle**.

```
┌──────────────────────┐     ┌─────────────────────┐     ┌──────────────────────┐
│ ① AUTHORING TOOL     │     │ ② BUNDLE            │     │ ③ GAME RUNTIME       │
│   (the editor)       │ ──▶ │   (the contract)    │ ──▶ │   (the example game) │
│                      │     │                     │     │                      │
│ where human intent   │     │ data + resources    │     │ just consumes it     │
│ goes in: paint, fill,│     │ only, NO logic:     │     │ owns interpretation: │
│ rect, layers, (later │     │  • map.json         │     │  collision, player,  │
│ procedural gen)      │     │  • tileset PNG(s)   │     │  camera, skins       │
└──────────────────────┘     └─────────────────────┘     └──────────────────────┘
        tool's job ends here ──────┘         └────── game's job starts here
```

## Why this split

The game needs only two things: **the tileset resource** (pixels) and **how the
map was laid out** (placement data). It must *not* need to know *how* or *why*
the map was authored — that's where human intent lives, and intent is hard to
generate automatically. So the tool owns generation (many possible methods), and
the game owns consumption. The bundle is the seam between them.

Change anything on the tool side — add procedural generators, new brushes, AI
assists — and the game is unaffected as long as it still emits a valid bundle.
Change the game — new physics, entities, lighting — and the authoring side is
unaffected.

## ② The bundle (`bundles/demo/`)

```
bundles/demo/
  map.json            placement data: layers of tile ids (gid), 0 = empty
  tileset.day.png     resource: the tiles (bright tone)
  tileset.night.png   resource: same 8×8 grid, cool tone  (a reskin)
```

`map.json` is produced by the **real Generic exporter** (`js/exporters/generic.js`)
— the exact code path the editor's *Export* button uses. Built with:

```bash
node tools/make-demo-bundle.mjs
```

Key properties of the contract:

- **Tile ids are positional, not pixels.** A cell stores `gid = tileset.firstId +
  localIndex`; `localIndex → (col,row)` in the tileset grid. So the *meaning* of a
  cell is "tile #N", and what #N looks like is decided by the PNG.
- **Layers are just named grids.** The game assigns meaning by convention (e.g. a
  layer named `Collision` = solid cells). The data does not encode behavior.
- **Optional `game` block** carries tool-authored hints the game may read:
  `spawn`, `playerSpeed`, and `skins` (alternate same-grid tilesets).

## ③ The game runtime (`game-runtime/`)

A ~200-line vanilla-JS top-down walker. It depends on **nothing but the bundle**:
`fetch(map.json)` → load referenced PNG(s) → render visible layers → run its own
collision/player/camera. Open `game-runtime/index.html` (served over http).

Interpretations the **game** owns (not the data):

1. **Collision** — any non-empty cell on the `Collision` layer is solid.
2. **Gameplay hints** — reads `map.game.spawn` / `playerSpeed` if present.
3. **Skins** — `map.game.skins` lists alternate same-grid PNGs; press **T** to
   hot-swap day↔night. The map data never changes; only the pixels do.

## The reskin guarantee (demonstrated)

Because cells reference tile *indices*, swapping the tileset PNG for another with
the **same grid** (tile size, columns, tile count, and consistent per-index
meaning) re-tones every map that uses it — with **zero changes to map data or
game code**.

Verified live: same `map.json`, same `game.js`, switching `tileset.day.png` →
`tileset.night.png` shifted the average rendered tone from a warm grass-green
`[88,133,76]` to a darker cool `[46,73,87]`. The map stayed identical.

```bash
# make an alternate-tone PNG with the identical grid:
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
./serve.sh                       # http://localhost:8080
# editor:  /index.html
# game:    /game-runtime/index.html   (press T to toggle day/night)
```
