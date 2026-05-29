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

### ▶ CURRENT — Phase 1 — multi-map tabs + new map + save  (needs P0)
- [ ] tab bar UI (list maps · switch · `+` new map · rename · close)
- [ ] new-map flow (size prompt / defaults); recenter camera on switch
- [ ] save/load whole workspace `.json`
- [ ] verify + commit

### Phase 2 — test tileset + load & test  (tileset asset independent; testing needs P1)
- [ ] richer programmatic test tileset (grass/wall/water/**door** markers) — extend `tools/make-sample-tileset.js`
- [ ] (optional) genai-MCP art variant
- [ ] paint test maps across tabs, tag/meta, ▶Play
- [ ] verify + commit

### Phase 3 — patterns (separate; place as chunks)  (needs P0, P1)
- [ ] `workspace.patterns[]`; edit a pattern like a map (kind flag); tabs split Maps | Patterns
- [ ] "stamp pattern" tool: blit pattern layers onto a map at an offset (layer-name matched, one undo)
- [ ] verify + commit

### Phase 4 — PCG door standardization + dungeon connect  (needs P3)
- [ ] pattern `doors:{n,e,s,w}` edge-slot metadata + authoring UI
- [ ] edge compatibility rule; seeded room-grid generator placing patterns via P3 stamp
- [ ] verify + commit

---

## Log (newest first)
- **Phase 0 ✓** — shared-workspace model via a `state.project` Proxy (zero churn on consumers); history/persist/project/migration done; 20 runtime tests + build green. Next: Phase 1 tabs.
- _(start)_ plan approved; shared-workspace model chosen; beginning Phase 0.
