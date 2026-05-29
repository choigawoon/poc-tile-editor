// Thin re-export: the real logic lives in @poc/core (packages/core).
// Kept so existing editor imports (slug, exportGeneric) keep working.
export { exportGeneric, slug, imageName } from '@poc/core';
