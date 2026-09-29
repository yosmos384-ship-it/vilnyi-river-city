// Photoreal 360° tour hook. Loads only the small manifest (assets/pano/index.json); the viewer module
// (js/pano-tour.js + three.js) is imported lazily on the first open().
//   window.VRC_PANO = { ready, available(unitId, styleId) → boolean, has(typeId, styleId), open(container, opts) → handle }
// opts: { unitId, styleId, startRoom, i18n, lang, dir, onExit }   (startRoom may also be 'lobby' | 'corridor' | 'parking')
import { unitById, TYPES } from './data.js';

const MANIFEST_URL = new URL('../assets/pano/index.json', import.meta.url);
let manifest = null;
const ready = fetch(MANIFEST_URL, { cache: 'no-cache' })
  .then(r => (r.ok ? r.json() : null)).catch(() => null)
  .then(m => { manifest = m && m.types ? m : { types: {}, commons: {} }; return manifest; });

const stylesOf = (typeId) => {
  const t = manifest && manifest.types[typeId];
  return t ? Object.keys(t.styles || {}).filter(s => (t.styles[s].points || []).length) : [];
};
// The rendered type to show for a unit: its own type, else the rendered type with the same room count
// (preferring one that has the requested style).
export function resolveType(unitId, styleId) {
  if (!manifest) return null;
  const u = unitById(unitId); if (!u) return null;
  if (stylesOf(u.type).length) return { typeId: u.type, sample: false };
  const rooms = TYPES[u.type] && TYPES[u.type].rooms;
  const same = Object.keys(manifest.types).filter(t => stylesOf(t).length && TYPES[t] && TYPES[t].rooms === rooms);
  if (!same.length) return null;
  const pick = same.find(t => stylesOf(t).includes(styleId)) || same[0];
  return { typeId: pick, sample: true };
}
function available(unitId, styleId) { return !!resolveType(unitId, styleId); }
function has(typeId, styleId) {
  if (!manifest) return false;
  const u = { type: typeId };
  if (stylesOf(typeId).length) return !styleId || true;
  const rooms = TYPES[u.type] && TYPES[u.type].rooms;
  return Object.keys(manifest.types).some(t => stylesOf(t).length && TYPES[t] && TYPES[t].rooms === rooms);
}
let modP = null;
async function open(container, opts = {}) {
  await ready;
  modP = modP || import('./pano-tour.js');
  const mod = await modP;
  return mod.openPanoTour(container, opts);
}

if (typeof window !== 'undefined' && !window.VRC_PANO) {
  window.VRC_PANO = { ready, available, has, open, manifest: () => manifest, stylesOf };
}
export { ready, available, has, open };
