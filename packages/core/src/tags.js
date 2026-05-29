// Hierarchical gameplay tags, modeled on Unreal's FGameplayTag.
//
// A tag is a dot-separated path: "Terrain.Water.Deep". A concrete tag
// implicitly satisfies queries for any of its ANCESTORS — "Terrain.Water.Deep"
// answers yes to "Terrain" and "Terrain.Water", but NOT to a deeper query like
// "Terrain.Water.Deep.Cold". This is what lets a consumer ask broad questions
// ("does this tile have any Hazard.* tag?") without enumerating every leaf.
//
// Tags CLASSIFY; use plain key/value props for scalar parameters (friction,
// damage). Storage is just an array of strings on a tile's `tags`, so the
// bundle stays declarative and any engine — Unreal included, 1:1 — can read it.

// @ts-check

// Canonical form: trim each segment, drop empties. "  A . B " -> "A.B".
/** @param {unknown} tag @returns {string} */
export function normalizeTag(tag) {
  if (typeof tag !== 'string') return '';
  return tag.split('.').map((s) => s.trim()).filter(Boolean).join('.');
}

// Does a concrete `tag` satisfy a `query` (exact match or descendant)?
// Case-insensitive, matching Unreal's tolerant comparison.
/** @param {unknown} tag @param {unknown} query @returns {boolean} */
export function tagMatches(tag, query) {
  const t = normalizeTag(tag).toLowerCase();
  const q = normalizeTag(query).toLowerCase();
  if (!t || !q) return false;
  return t === q || t.startsWith(q + '.');
}

// All ancestor paths of a tag, broadest → narrowest, including itself.
//   "A.B.C" -> ["A", "A.B", "A.B.C"]
/** @param {unknown} tag @returns {string[]} */
export function expandTag(tag) {
  const segs = normalizeTag(tag).split('.').filter(Boolean);
  const out = [];
  for (let i = 0; i < segs.length; i++) out.push(segs.slice(0, i + 1).join('.'));
  return out;
}

// ---- container queries (a "container" is an array of tag strings) ----

// True if any tag in the container is the query tag or a descendant of it.
/** @param {unknown} container @param {unknown} query @returns {boolean} */
export function hasTag(container, query) {
  return Array.isArray(container) && container.some((t) => tagMatches(t, query));
}

// True only on an exact (case-insensitive) match — no hierarchy.
/** @param {unknown} container @param {unknown} query @returns {boolean} */
export function hasTagExact(container, query) {
  const q = normalizeTag(query).toLowerCase();
  return Array.isArray(container) && container.some((t) => normalizeTag(t).toLowerCase() === q);
}

/** @param {unknown} container @param {string[]} queries @returns {boolean} */
export function hasAny(container, queries) {
  return queries.some((q) => hasTag(container, q));
}
/** @param {unknown} container @param {string[]} queries @returns {boolean} */
export function hasAll(container, queries) {
  return queries.every((q) => hasTag(container, q));
}
