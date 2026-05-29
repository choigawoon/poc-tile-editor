# 🗺️ ROADMAP — workspace · tabs · patterns · PCG

> **Resume protocol**: this file is the source of truth for in-progress work.
> A fresh session should: (1) read this file, (2) find the `▶ CURRENT` marker,
> (3) continue the first unchecked `[ ]` item, (4) after each step run
> `npm run build` (turbo) to confirm green, (5) tick the box and move the `▶`.
> Branch: `feat/tile-metadata`.

## Target data model — shared workspace (decided)

```
workspace = {
  format, version, name,
  tileWidth, tileHeight, nextGid,     // shared grid + gid allocation
  tilesets:  [...],                   // ★ SHARED across all maps & patterns
  tagRegistry: [...],                 // ★ SHARED
  maps:     [ { id, name, mapWidth, mapHeight, layers[], objects?, game? } ],
  patterns: [ { id, name, w, h, layers[], doors:{n,e,s,w} } ],   // P3+
}
ui = { ..., activeMapId, activeKind:'map'|'pattern' }
```
A **pattern** is a small map carrying edge-door metadata; sharing tilesets means
its gids resolve in any map — the basis for PCG connection.
Exporters/▶Play stay unchanged via an adapter `mapToProject(map)` that flattens
`workspace + map` into the existing exporter shape.

Dependency chain: `0 → 1 → 2` and `0 → 1 → 3 → 4`.

---

### Phase 0 — workspace model (DONE ✓ — no new UI; zero feature regression)
- [x] `state.js`: `createWorkspace()`/`makeMap()`/`toWorkspace()`/`normalizeActive()`, `state.workspace`, `ui.activeMapId`; accessors `activeMap()`/`activeLayer()`/`activeTileset()`/`tilesetForGid()`
- [x] **`state.project` is a Proxy** routing shared fields → workspace, map fields → activeMap. Keeps all ~72 call sites + exporters/▶Play working with no edits (proxy IS the adapter). Reassignment guarded (getter-only).
- [x] `history.js`: snapshot/restore `state.workspace` (+ normalizeActive)
- [x] `persist.js`: autosave/restore `workspace` (+ migrate old single-project saves)
- [x] `project.js`: new/save/load operate on workspace (save = whole workspace)
- [x] consumers (tileset/tools/renderer/panels/tilemeta/import-image/default-project/main): unchanged — proxy handles them
- [x] verify: 20 Node runtime tests (proxy routing, nextGid+=, mapWidth=, push, exporter via proxy, v1 migration) + editor & game build green via turbo
- [x] commit "Phase 0: shared-workspace model"
- _Note for resume_: tile size (`tileWidth/Height`) is workspace-level (one grid for all maps). Per-map tile size is a future option if needed.

### Phase 1 — multi-map tabs + new map + save  (DONE ✓)
- [x] `maps.js` tab bar: list maps · click switch · `＋` new map · dblclick rename · `×` close
- [x] stage restructured to tabs + canvas area; camera recenters on switch (canvas sizes to `#stage-canvas`)
- [x] save/load whole workspace `.json` (already via P0 project.js)
- [x] verify: 12 Node tests (new/switch/close, map isolation, shared tilesets, neighbor fallback) + build green
- [ ] ⚠️ browser eyeball pending (tab bar render + stage layout) — check on dev server
- [x] commit

### ▶ CURRENT — Phase 2 — test tileset + load & test  (decision: BOTH)
- [x] programmatic labeled test tileset: `tools/make-test-tileset.mjs` → `apps/editor/public/samples/test-tileset.png` (8×2=16 tiles: grass/flower/path/stone/water/deepwater/sand/ice · wall/wallbrick/tree/rock/lava/spikes/bridge/**door**). Separate file — default scene's tileset.png untouched. Load via ⊞/＋ (`/samples/test-tileset.png`).
- [ ] genai-MCP art variant (deferred; reskin-swap onto the same 8×2 grid)
- [ ] paint test maps across tabs, tag/meta, ▶Play (browser)
- [ ] commit

### Phase 3 — patterns (separate; place as chunks)  (DONE ✓)
- [x] `state.project` proxy generalized to `activeDoc()` (map OR pattern) via `ui.activeKind`; patterns are map-shaped docs (+ empty `doors`) so the whole editor edits them unchanged
- [x] tab bar split into **Maps | Patterns** groups (`maps.js`): new/switch/rename/close for each; pattern tabs dashed
- [x] **stamp tool** (`▦`, key M): `stampAt()` blits the chosen pattern's layers onto the active map at the hovered cell — layer-name matched (missing layers created), empty cells skipped (overlay), out-of-bounds clipped, one undo; hover ghost preview; stamp-pattern picker in the tab bar
- [x] verify: 12 Node tests (activeDoc routing, proxy→pattern, stamp offset/skip/auto-layer/clip) + build green
- [ ] ⚠️ browser eyeball pending (tab groups, stamp preview)
- [x] commit

### ▶ CURRENT — Phase 4 — PCG door standardization + dungeon connect  (needs P3)
- [ ] pattern `doors:{n,e,s,w}` edge-slot metadata + authoring UI
- [ ] edge compatibility rule; seeded room-grid generator placing patterns via P3 stamp
- [ ] verify + commit

---

## Log (newest first)
- **Phase 0 ✓** — shared-workspace model via a `state.project` Proxy (zero churn on consumers); history/persist/project/migration done; 20 runtime tests + build green. Next: Phase 1 tabs.
- _(start)_ plan approved; shared-workspace model chosen; beginning Phase 0.
