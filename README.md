# 🧩 POC Tile Editor

A browser-based tile map editor with one-click export to **Godot 4**, **Unity**,
**Tiled (.tmj)**, and an engine-agnostic **Generic JSON** format. No build step,
no dependencies — pure HTML/CSS/ES modules.

![stack](https://img.shields.io/badge/stack-vanilla%20JS-yellow) ![deps](https://img.shields.io/badge/dependencies-0-green)

## Quick start

ES modules must be served over http(s) (not opened as `file://`):

```bash
./serve.sh           # serves on http://localhost:8080
# or:
python3 -m http.server 8080
```

Then open <http://localhost:8080>.

1. Click **＋** next to *Tilesets* and pick a PNG (a ready-made one is in
   `samples/tileset.png`).
2. Select tiles in the **Palette** (click, or drag to grab a multi-tile stamp).
3. Paint on the canvas. Add **Layers** on the right; set the **Map** size.
4. Pick an **Export target** in the top bar and hit **Export ⤓**.

### Tools & shortcuts

| Key | Tool |
|-----|------|
| `B` | Brush / stamp |
| `E` | Eraser |
| `G` | Fill (flood) |
| `R` | Rectangle |
| `I` | Picker (eyedropper) |
| `Ctrl/⌘ + Z` | Undo |
| `Ctrl/⌘ + Shift + Z` / `Ctrl + Y` | Redo |
| `Space + drag` / middle-drag | Pan |
| Mouse wheel | Zoom |

**Save / Load** writes a self-contained `*.tileproj.json` (tileset images are
embedded as base64), so you can resume work later.

## Export formats

Every export downloads the data file **plus the tileset PNG(s)** so it's usable
immediately.

| Target | File | How to consume |
|--------|------|----------------|
| Generic JSON | `name.json` | 2D arrays, `0` = empty, ids are global. Read in any engine/tool. |
| Tiled | `name.tmj` | Open in [Tiled](https://www.mapeditor.org/), or import via Godot / SuperTiled2Unity. |
| Godot 4 | `name.godot.json` | Use `engine-templates/godot/TileMapImporter.gd`. |
| Unity | `name.unity.json` | Use `engine-templates/unity/TileMapImporter.cs`. |

### Godot 4

1. Copy `TileMapImporter.gd`, `name.godot.json` and the tileset PNG into your project.
2. Attach the script to a `Node2D`, set `json_path` in the Inspector, run the scene.
3. It builds a `TileSet` and one `TileMapLayer` per editor layer.

### Unity

1. Copy `TileMapImporter.cs` into `Assets/`, and the JSON + PNG into a `Resources/` folder.
2. Set the tileset texture: *Texture Type = Sprite*, *Read/Write = On*, *Filter = Point*.
3. Add `TileMapImporter` to a GameObject, set `jsonResource` (no extension), press Play.

## Data model

The native project (and Generic export) uses **global tile ids (gid)**, matching
Tiled's scheme: `0` is an empty cell; otherwise `gid = tileset.firstId + localIndex`.
Multiple tilesets are supported; each gets a contiguous gid range.

## Project structure

```
index.html              # shell
css/style.css
js/
  state.js              # central store + event bus
  history.js            # undo/redo (snapshot-based)
  tileset.js            # image load / slicing / gid resolution
  renderer.js           # map canvas (camera, grid, layer compositing)
  palette.js            # tileset viewer + tile selection
  tools.js              # brush, eraser, fill, rect, picker
  panels.js             # tilesets / layers / map-size UI
  project.js            # save / load native project
  main.js               # wiring: input, shortcuts, actions
  exporters/            # generic, tiled, godot, unity + dispatch
engine-templates/       # ready-to-use Godot & Unity importers
tools/make-sample-tileset.js
samples/tileset.png
```

## Git branches

- `main` — stable line
- `develop` — integration branch for ongoing work

## License

MIT
