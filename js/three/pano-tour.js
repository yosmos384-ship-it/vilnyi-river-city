// VILNYI RIVER CITY — photoreal 360° tour (Matterport-style). Path-traced equirectangular panoramas (Blender Cycles,
// rendered offline into assets/pano/<type>/<style>/<point>.jpg + assets/pano/index.json) shown on a lightweight sphere viewer:
// drag / gyro to look, wheel / pinch to zoom, floor-circle hotspots to move between standing points with a zoom + cross-fade,
// a minimap of the points, style switcher (only styles that were rendered), black/gold HUD matching walk.js, RTL aware.
//
// export async function openPanoTour(container, { unitId, typeId, styleId, pointId, i18n, onExit, onSwitchTo3D }) → { setStyle, dispose }
// window.VRC_PANO = { open: openPanoTour, has(typeId, styleId), ready }
//
// Frames: every point is stored in UNIT-LOCAL coords of the reference unit of its type (pos:[u, v, y] with x=u, z=v, y = level
// floor height; yaw = three.js camera rotation.y in that frame). Commons ('lobby', 'corridor', 'parking', …) are stored in
// BUILDING-LOCAL coords (pos:[x, z, y]); see INTEGRATION.md.
import * as THREE from 'three';

const MANIFEST_URL = new URL('../../assets/pano/index.json?v=3.6', import.meta.url);
const ASSET_BASE = new URL('../../assets/pano/', import.meta.url);
const EYE = 1.6;                       // camera height the panoramas were rendered at (m)
const FOV0 = 75, FOV_MIN = 30, FOV_MAX = 100;
const D2R = Math.PI / 180;

// ---------------------------------------------------------------- manifest (fetched once, cached)
let MANIFEST = null;
const ready = fetch(MANIFEST_URL, { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null).then(m => (MANIFEST = m || { types: {} }));
function styleEntry(typeId, styleId) { return MANIFEST && MANIFEST.types && MANIFEST.types[typeId] && MANIFEST.types[typeId].styles && MANIFEST.types[typeId].styles[styleId]; }
export function hasPano(typeId, styleId) {
  if (!MANIFEST) return false;
  if (styleId) return !!(styleEntry(typeId, styleId) || []).points?.length;
  const t = MANIFEST.types && MANIFEST.types[typeId];
  return !!(t && Object.values(t.styles || {}).some(s => s.points && s.points.length));
}
export function panoStyles(typeId) { const t = MANIFEST && MANIFEST.types && MANIFEST.types[typeId]; return t ? Object.keys(t.styles || {}).filter(s => t.styles[s].points?.length) : []; }

// ---------------------------------------------------------------- strings (site i18n first, then these 8-language fallbacks)
const STR = {
  en: { title: 'Photoreal tour', loading: 'Loading the photoreal tour…', exit: 'Exit', free3d: 'Free 3D', photo: 'Photoreal', design: 'Design', map: 'Map', hint: 'Drag to look around · tap a circle on the floor to move', gyro: 'Motion', none: 'The photoreal tour for this apartment is being prepared.', illus: 'Illustrative visualisation', upper: 'upper level', lobby: 'Lobby', corridor: 'Corridor', parking: 'Parking', lift: 'Lift', entrance: 'Entrance', zoomIn: 'Zoom in', zoomOut: 'Zoom out' },
  he: { title: 'סיור פוטוריאליסטי', loading: 'טוען את הסיור הפוטוריאליסטי…', exit: 'יציאה', free3d: 'תלת־ממד חופשי', photo: 'מציאותי', design: 'עיצוב', map: 'מפה', hint: 'גררו כדי להסתכל סביב · הקישו על עיגול ברצפה כדי לעבור', gyro: 'תנועה', none: 'הסיור הפוטוריאליסטי לדירה זו בהכנה.', illus: 'הדמיה להמחשה בלבד', upper: 'מפלס עליון', lobby: 'לובי', corridor: 'מסדרון', parking: 'חניון', lift: 'מעלית', entrance: 'כניסה', zoomIn: 'התקרבות', zoomOut: 'התרחקות' },
  ru: { title: 'Фотореалистичный тур', loading: 'Загружаем фотореалистичный тур…', exit: 'Выход', free3d: 'Свободное 3D', photo: 'Фотореализм', design: 'Дизайн', map: 'План', hint: 'Потяните, чтобы осмотреться · нажмите на круг на полу, чтобы перейти', gyro: 'Гироскоп', none: 'Фотореалистичный тур для этой квартиры готовится.', illus: 'Иллюстративная визуализация', upper: 'верхний уровень', lobby: 'Лобби', corridor: 'Коридор', parking: 'Паркинг', lift: 'Лифт', entrance: 'Вход', zoomIn: 'Приблизить', zoomOut: 'Отдалить' },
  uk: { title: 'Фотореалістичний тур', loading: 'Завантажуємо фотореалістичний тур…', exit: 'Вихід', free3d: 'Вільне 3D', photo: 'Фотореалізм', design: 'Дизайн', map: 'План', hint: 'Потягніть, щоб роздивитися · торкніться кола на підлозі, щоб перейти', gyro: 'Гіроскоп', none: 'Фотореалістичний тур для цієї квартири готується.', illus: 'Ілюстративна візуалізація', upper: 'верхній рівень', lobby: 'Лобі', corridor: 'Коридор', parking: 'Паркінг', lift: 'Ліфт', entrance: 'Вхід', zoomIn: 'Наблизити', zoomOut: 'Віддалити' },
  ro: { title: 'Tur fotorealist', loading: 'Se încarcă turul fotorealist…', exit: 'Ieșire', free3d: '3D liber', photo: 'Fotorealist', design: 'Design', map: 'Plan', hint: 'Trage pentru a privi în jur · atinge un cerc de pe podea pentru a te deplasa', gyro: 'Mișcare', none: 'Turul fotorealist pentru acest apartament este în pregătire.', illus: 'Vizualizare cu caracter ilustrativ', upper: 'nivelul superior', lobby: 'Hol de intrare', corridor: 'Coridor', parking: 'Parcare', lift: 'Lift', entrance: 'Intrare', zoomIn: 'Apropie', zoomOut: 'Depărtează' },
  fr: { title: 'Visite photoréaliste', loading: 'Chargement de la visite photoréaliste…', exit: 'Quitter', free3d: '3D libre', photo: 'Photoréaliste', design: 'Style', map: 'Plan', hint: 'Faites glisser pour regarder autour · touchez un cercle au sol pour avancer', gyro: 'Mouvement', none: 'La visite photoréaliste de cet appartement est en préparation.', illus: 'Visualisation non contractuelle', upper: 'niveau supérieur', lobby: 'Hall d’entrée', corridor: 'Couloir', parking: 'Parking', lift: 'Ascenseur', entrance: 'Entrée', zoomIn: 'Zoom avant', zoomOut: 'Zoom arrière' },
  it: { title: 'Tour fotorealistico', loading: 'Caricamento del tour fotorealistico…', exit: 'Esci', free3d: '3D libero', photo: 'Fotorealistico', design: 'Design', map: 'Pianta', hint: 'Trascina per guardarti intorno · tocca un cerchio sul pavimento per spostarti', gyro: 'Movimento', none: 'Il tour fotorealistico di questo appartamento è in preparazione.', illus: 'Visualizzazione indicativa', upper: 'livello superiore', lobby: 'Lobby', corridor: 'Corridoio', parking: 'Parcheggio', lift: 'Ascensore', entrance: 'Ingresso', zoomIn: 'Avvicina', zoomOut: 'Allontana' },
  de: { title: 'Fotorealistische Tour', loading: 'Fotorealistische Tour wird geladen…', exit: 'Schließen', free3d: 'Freies 3D', photo: 'Fotorealistisch', design: 'Design', map: 'Plan', hint: 'Ziehen zum Umsehen · Kreis am Boden antippen, um sich zu bewegen', gyro: 'Bewegung', none: 'Die fotorealistische Tour für diese Wohnung wird vorbereitet.', illus: 'Illustrative Visualisierung', upper: 'obere Ebene', lobby: 'Lobby', corridor: 'Flur', parking: 'Tiefgarage', lift: 'Aufzug', entrance: 'Eingang', zoomIn: 'Vergrößern', zoomOut: 'Verkleinern' },
};
const ROOM_EN = { living: 'Living', kitchen: 'Kitchen', hall: 'Hall', bedroom: 'Bedroom', bath: 'Bathroom', storage: 'Storage', dressing: 'Dressing', balcony: 'Balcony', loggia: 'Loggia', terrace: 'Terrace' };
const STYLE_N = { milano: { he: 'מילאנו', en: 'Milano', ru: 'Милано', uk: 'Мілано' }, nordic: { he: 'נורדי', en: 'Nordic', ru: 'Нордик', uk: 'Нордік' }, riviera: { he: 'ריביירה', en: 'Riviera', ru: 'Ривьера', uk: 'Рив’єра' } };

const CSS = `
.pt{position:absolute;inset:0;overflow:hidden;background:#050505;color:#f3ead7;font-family:"Manrope","Inter Tight","Heebo","Assistant",system-ui,sans-serif;
  -webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;--g:#c9a45c;--g2:#e6c987;--bg:rgba(8,8,8,.66);--ln:rgba(201,164,92,.40);
  --st:env(safe-area-inset-top,0px);--sb:env(safe-area-inset-bottom,0px);--sl:env(safe-area-inset-left,0px);--sr:env(safe-area-inset-right,0px)}
.pt *{box-sizing:border-box}
.pt button{font:inherit;color:inherit;background:none;border:0;cursor:pointer}
.pt canvas.pt-gl{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:grab;outline:none}
.pt canvas.pt-gl.drag{cursor:grabbing}.pt canvas.pt-gl.hot{cursor:pointer}
.pt-panel{background:var(--bg);-webkit-backdrop-filter:blur(12px) saturate(1.2);backdrop-filter:blur(12px) saturate(1.2);border:1px solid var(--ln);border-radius:12px}
.pt-top{position:absolute;top:calc(10px + var(--st));left:calc(10px + var(--sl));right:calc(10px + var(--sr));display:flex;gap:8px;align-items:flex-start;justify-content:space-between;pointer-events:none}
.pt-top>*{pointer-events:auto}
.pt-title{padding:7px 12px;min-width:0;max-width:min(56vw,460px)}
.pt-title .t1{font-family:"Cormorant Garamond","Bodoni Moda",Georgia,serif;font-size:15px;letter-spacing:.04em;color:var(--g2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pt-title .t2{font-size:11.5px;opacity:.9;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pt-title .t2 b{color:var(--g);font-weight:600}
.pt-actions{display:flex;gap:7px;flex-shrink:0}
.pt-btn{height:34px;padding:0 13px;border-radius:999px;display:inline-flex;align-items:center;gap:7px;font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap;touch-action:manipulation}
.pt-ghost{background:var(--bg);border:1px solid var(--ln)!important;color:#f3ead7;-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)}
.pt-ghost:hover{border-color:var(--g)!important}
.pt-seg{display:inline-flex;border:1px solid var(--ln);border-radius:999px;overflow:hidden;background:var(--bg);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);height:34px}
.pt-seg button{padding:0 12px;font-size:11px;letter-spacing:.05em;color:#d9ccb0;white-space:nowrap}
.pt-seg button.on{background:linear-gradient(135deg,#e6c987,#b88a3c);color:#111;font-weight:700}
.pt-side{position:absolute;top:calc(56px + var(--st));right:calc(10px + var(--sr));display:flex;flex-direction:column;gap:7px;align-items:stretch;padding:7px;width:118px}
.pt[dir=rtl] .pt-side{right:auto;left:calc(10px + var(--sl))}
.pt-lbl{font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--g);opacity:.9;padding:2px 4px 0;text-align:start}
.pt-styles{display:flex;flex-direction:column;gap:3px}
.pt-styles button{text-align:start;padding:5px 9px;border-radius:8px;font-size:11.5px;border:1px solid transparent;color:#e9dfc8}
.pt-styles button.on{border-color:var(--g);color:var(--g2);background:rgba(201,164,92,.10)}
.pt-zoom{display:flex;border:1px solid var(--ln);border-radius:999px;overflow:hidden;direction:ltr}
.pt-zoom button{flex:1;font-size:15px;line-height:1;padding:5px 0;color:var(--g2)}
.pt-zoom button:active{background:rgba(201,164,92,.25)}
.pt-bottom{position:absolute;bottom:calc(10px + var(--sb));left:calc(10px + var(--sl));right:calc(10px + var(--sr));display:flex;flex-direction:column;gap:6px;align-items:center;pointer-events:none}
.pt-row{display:flex;gap:5px;overflow-x:auto;scrollbar-width:none;pointer-events:auto;padding:1px;max-width:100%;touch-action:pan-x}
.pt-row::-webkit-scrollbar{display:none}
.pt-chip{flex-shrink:0;height:32px;padding:0 13px;border-radius:999px;font-size:12px;white-space:nowrap;background:var(--bg);border:1px solid var(--ln)!important;-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);color:#efe5cf}
.pt-chip.on{border-color:var(--g)!important;color:#111;background:linear-gradient(135deg,#e6c987,#b88a3c);font-weight:700}
.pt-hint{font-size:11px;opacity:.85;padding:5px 12px;border-radius:999px;background:rgba(0,0,0,.45);transition:opacity .8s;text-align:center}
.pt-illus{position:absolute;bottom:calc(52px + var(--sb));left:calc(12px + var(--sl));font-size:9.5px;letter-spacing:.08em;opacity:.55;pointer-events:none;text-transform:uppercase}
.pt[dir=rtl] .pt-illus{left:auto;right:calc(12px + var(--sr))}
.pt-map{position:absolute;bottom:calc(92px + var(--sb));left:calc(10px + var(--sl));padding:6px;transition:opacity .3s}
.pt[dir=rtl] .pt-map{left:auto;right:calc(10px + var(--sr))}
.pt-map canvas{display:block;touch-action:none;cursor:pointer}
.pt-veil{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:#050505;transition:opacity .6s;z-index:5}
.pt-veil .sp{width:38px;height:38px;border-radius:50%;border:2px solid rgba(201,164,92,.25);border-top-color:var(--g);animation:ptspin 1s linear infinite}
.pt-veil .tx{font-family:"Cormorant Garamond",Georgia,serif;font-size:18px;color:var(--g2);letter-spacing:.04em;text-align:center;padding:0 20px}
.pt-veil.gone{opacity:0;pointer-events:none}
.pt-bar{position:absolute;top:0;left:0;height:2px;background:linear-gradient(90deg,#b88a3c,#e6c987);width:0;transition:width .25s,opacity .5s;z-index:4}
@keyframes ptspin{to{transform:rotate(360deg)}}
@media (max-width:640px){
  .pt-title{max-width:calc(100vw - 150px)}
  .pt-side{top:auto;bottom:calc(92px + var(--sb));width:auto;flex-direction:row;padding:5px;right:calc(10px + var(--sr))}
  .pt[dir=rtl] .pt-side{right:auto;left:calc(10px + var(--sl))}
  .pt-side .pt-lbl{display:none}
  .pt-styles{flex-direction:column}
  .pt-styles button{padding:4px 8px;font-size:11px}
  .pt-zoom{flex-direction:column;border-radius:14px;width:34px}
  .pt-map{bottom:calc(92px + var(--sb))}
  .pt-btn{padding:0 11px}
  .pt-seg button{padding:0 9px;font-size:10.5px}
}
`;

// ---------------------------------------------------------------- sphere shader: equirect lookup by direction (exact, no seams),
// two panoramas cross-faded; each carries its own yaw offset (radians) so both stay registered to the plan while fading.
const VS = `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }`;
const FS = `
uniform sampler2D tA; uniform sampler2D tB; uniform float mixK; uniform vec3 offA; uniform vec3 offB; uniform float blur;
varying vec3 vDir;
const float PI = 3.141592653589793;
vec2 eq(vec3 d){ d = normalize(d); return vec2(0.5 - atan(d.x, d.z) / (2.0*PI), 0.5 + asin(clamp(d.y,-1.0,1.0)) / PI); }
void main(){
  // each pano is looked up from its own centre: the sphere of radius R around the camera is re-projected towards
  // the pano origin (off = pano origin − camera, in metres, divided by the sphere radius) → parallax-correct fades
  vec3 d = normalize(vDir);
  vec3 a = texture2D(tA, eq(d * 10.0 - offA)).rgb;
  vec3 b = texture2D(tB, eq(d * 10.0 - offB)).rgb;
  gl_FragColor = vec4(mix(a, b, mixK), 1.0);
  #include <colorspace_fragment>
}`;

function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
function easeInOut(k) { return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; }

export async function openPanoTour(container, opts = {}) {
  const { unitId = null, i18n = null, onExit = null, onSwitchTo3D = null } = opts;
  let typeId = opts.typeId || null, styleId = opts.styleId || 'milano';
  await ready;
  // ---------- i18n
  const lang = () => { const l = i18n && i18n.lang; return (typeof l === 'function' ? l() : l) || document.documentElement.lang || 'en'; };
  const dir = () => { const d = i18n && i18n.dir; const v = typeof d === 'function' ? d() : d; return v === 'rtl' || v === 'ltr' ? v : (document.documentElement.dir || 'ltr'); };
  const L = () => STR[(lang() || 'en').slice(0, 2)] || STR.en;
  const tt = (key, fallbackKey) => {
    let s; try { s = i18n && typeof i18n.t === 'function' ? i18n.t(key) : undefined; } catch { s = undefined; }
    if (typeof s === 'string' && s && s !== key) return s;
    return fallbackKey ? (L()[fallbackKey] ?? STR.en[fallbackKey] ?? key) : key;
  };
  const roomName = (kind) => tt('walk.room.' + kind, null) !== 'walk.room.' + kind ? tt('walk.room.' + kind) : (L()[kind] || ROOM_EN[kind] || kind);
  const styleName = (id) => { const s = tt('style.' + id + '.n'); if (s && s !== 'style.' + id + '.n') return s; const n = STYLE_N[id]; return n ? (n[lang().slice(0, 2)] || n.en) : id; };

  // ---------- DOM
  if (!document.getElementById('pt-css')) { const s = el('style'); s.id = 'pt-css'; s.textContent = CSS; document.head.appendChild(s); }
  const root = el('div', 'pt'); root.setAttribute('dir', dir()); root.setAttribute('lang', lang());
  const canvas = el('canvas', 'pt-gl'); canvas.tabIndex = 0; root.appendChild(canvas);
  const bar = el('div', 'pt-bar'); root.appendChild(bar);
  const top = el('div', 'pt-top');
  const title = el('div', 'pt-panel pt-title'); const t1 = el('div', 't1'), t2 = el('div', 't2'); title.append(t1, t2);
  const actions = el('div', 'pt-actions');
  const seg = el('div', 'pt-seg'); const bFree = el('button'); const bPhoto = el('button', 'on'); seg.append(bFree, bPhoto);
  const bExit = el('button', 'pt-btn pt-ghost');
  actions.append(seg, bExit); top.append(title, actions); root.appendChild(top);
  const side = el('div', 'pt-panel pt-side');
  const lblDesign = el('div', 'pt-lbl'); const styles = el('div', 'pt-styles');
  const zoom = el('div', 'pt-zoom'); const zIn = el('button', '', '+'), zOut = el('button', '', '−'); zoom.append(zIn, zOut);
  side.append(lblDesign, styles, zoom); root.appendChild(side);
  const map = el('div', 'pt-panel pt-map'); const mapC = el('canvas'); map.appendChild(mapC); root.appendChild(map);
  const illus = el('div', 'pt-illus'); root.appendChild(illus);
  const bottom = el('div', 'pt-bottom'); const hint = el('div', 'pt-hint'); const row = el('div', 'pt-row'); bottom.append(hint, row); root.appendChild(bottom);
  const veil = el('div', 'pt-veil', '<div class="sp"></div><div class="tx"></div>'); root.appendChild(veil);
  container.appendChild(root);
  const setTexts = () => {
    root.setAttribute('dir', dir()); root.setAttribute('lang', lang());
    bFree.textContent = tt('walk.free3d', 'free3d'); bPhoto.textContent = tt('walk.photoreal', 'photo');
    bExit.textContent = tt('walk.exit', 'exit'); lblDesign.textContent = tt('walk.design', 'design');
    zIn.title = L().zoomIn; zOut.title = L().zoomOut; hint.textContent = L().hint; illus.textContent = L().illus;
    veil.querySelector('.tx').textContent = L().loading;
  };
  setTexts();
  if (!onSwitchTo3D) seg.style.display = 'none';

  // ---------- three
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV0, 1, 0.05, 100);
  camera.rotation.order = 'YXZ';
  const blank = new THREE.DataTexture(new Uint8Array([8, 8, 8, 255]), 1, 1); blank.needsUpdate = true; blank.colorSpace = THREE.SRGBColorSpace;
  const U = { tA: { value: blank }, tB: { value: blank }, mixK: { value: 0 }, offA: { value: new THREE.Vector3() }, offB: { value: new THREE.Vector3() }, blur: { value: 0 } };
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(10, 64, 32), new THREE.ShaderMaterial({ uniforms: U, vertexShader: VS, fragmentShader: FS, side: THREE.BackSide, depthWrite: false }));
  sphere.frustumCulled = false; scene.add(sphere);
  // hotspots: floor rings placed at the target point's floor position relative to the current eye (true perspective)
  const hotG = new THREE.Group(); scene.add(hotG);
  const ringGeo = new THREE.RingGeometry(0.2, 0.26, 48); ringGeo.rotateX(-Math.PI / 2);
  const discGeo = new THREE.CircleGeometry(0.2, 48); discGeo.rotateX(-Math.PI / 2);
  const hitGeo = new THREE.CircleGeometry(0.42, 16); hitGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xe6c987, transparent: true, opacity: 0.95, depthTest: false });
  const discMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, depthTest: false });
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  // hover reticle following the pointer on the floor
  const ret = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.19, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0, depthTest: false }));
  ret.renderOrder = 3; scene.add(ret);

  // ---------- state
  let entry = null, points = [], byId = new Map(), cur = null, busy = false, disposed = false;
  let yaw = 0, pitch = 0, fov = FOV0, tYaw = 0, tPitch = 0, tFov = FOV0, lastInteract = performance.now();
  const texCache = new Map();          // url → Promise<Texture>
  const loader = new THREE.TextureLoader();
  const imgUrl = (p) => new URL(p.img, ASSET_BASE).href;
  function loadTex(url, onProgress) {
    if (texCache.has(url)) return texCache.get(url);
    const pr = new Promise((res, rej) => {
      loader.load(url, t => { t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.wrapS = THREE.RepeatWrapping; res(t); }, onProgress, rej);
    });
    texCache.set(url, pr);
    // keep at most ~8 panoramas resident
    if (texCache.size > 8) { const k = texCache.keys().next().value; const old = texCache.get(k); texCache.delete(k); old.then(t => { if (t !== U.tA.value && t !== U.tB.value) t.dispose(); }).catch(() => {}); }
    return pr;
  }
  const levelY = (p) => p.pos[2] || 0;
  // pano-origin offset for the lookup of a pano `p` while the camera stands at `eyePos` (plan metres → sphere units)
  function offsetOf(p, eye) { return new THREE.Vector3(p.pos[0] - eye.x, (levelY(p) + EYE) - eye.y, p.pos[1] - eye.z); }

  function buildHotspots() {
    hotG.clear();
    if (!cur) return;
    for (const id of cur.links || []) {
      const q = byId.get(id); if (!q) continue;
      const dx = q.pos[0] - cur.pos[0], dz = q.pos[1] - cur.pos[1], dy = levelY(q) - levelY(cur) - EYE;
      const g = new THREE.Group(); g.position.set(dx, Math.max(dy, -EYE - 0.2) + 0.01, dz); g.userData.target = id;
      if (Math.abs(levelY(q) - levelY(cur)) > 0.5) g.position.y = -EYE + 0.01 + (levelY(q) > levelY(cur) ? 0.6 : -0.3);
      const ring = new THREE.Mesh(ringGeo, ringMat), disc = new THREE.Mesh(discGeo, discMat), hit = new THREE.Mesh(hitGeo, hitMat);
      ring.renderOrder = disc.renderOrder = 2; hit.userData.target = id;
      g.add(disc, ring, hit); hotG.add(g);
    }
  }
  function curEye() { return new THREE.Vector3(cur.pos[0], levelY(cur) + EYE, cur.pos[1]); }

  function renderChips() {
    row.innerHTML = '';
    const seen = new Set();
    for (const p of points) {
      const key = p.room + '|' + p.level + '|' + (p.roomName || '');
      if (seen.has(key)) continue; seen.add(key);
      const b = el('button', 'pt-chip');
      const same = points.filter(q => q.room === p.room && q.level === p.level && (q.roomName || '') === (p.roomName || ''));
      const kindCount = points.filter(q => q.room === p.room).map(q => q.roomName).filter((v, i, a) => a.indexOf(v) === i).length;
      b.textContent = roomName(p.room) + (kindCount > 1 && p.roomName && /\d/.test(p.roomName) ? ' ' + p.roomName.replace(/\D+/g, '') : '') + (p.level ? ' · ' + (tt('walk.upper', 'upper')) : '');
      b.dataset.pid = same[0].id; b.dataset.key = key;
      b.addEventListener('click', () => goTo(same.find(q => q.id === cur?.id) ? same[(same.indexOf(same.find(q => q.id === cur.id)) + 1) % same.length].id : same[0].id));
      row.appendChild(b);
    }
    markChips();
  }
  function markChips() {
    if (!cur) return;
    const key = cur.room + '|' + cur.level + '|' + (cur.roomName || '');
    for (const b of row.children) { const on = b.dataset.key === key; b.classList.toggle('on', on); if (on) b.scrollIntoView?.({ block: 'nearest', inline: 'center' }); }
  }
  function renderStyles() {
    styles.innerHTML = '';
    const list = panoStyles(typeId);
    for (const s of list) {
      const b = el('button', s === styleId ? 'on' : ''); b.textContent = styleName(s);
      b.addEventListener('click', () => api.setStyle(s)); styles.appendChild(b);
    }
    lblDesign.style.display = styles.style.display = list.length > 1 ? '' : 'none';
  }
  function renderTitle() {
    const unitTxt = (() => { try { return unitId && i18n && typeof i18n.unitLabel === 'function' ? i18n.unitLabel(unitId) : ''; } catch { return ''; } })();
    t1.textContent = (entry && entry.title && (entry.title[lang().slice(0, 2)] || entry.title.en)) || (L().title + (typeId && !entry?.commons ? ' · ' + typeId : ''));
    t2.innerHTML = '';
    const b = el('b'); b.textContent = cur ? roomName(cur.room) + (cur.level ? ' · ' + tt('walk.upper', 'upper') : '') : ''; t2.appendChild(b);
    if (!entry?.commons) t2.append(document.createTextNode(' · ' + styleName(styleId) + (unitTxt ? ' · ' + unitTxt : '')));
  }

  // ---------- minimap (plan outline + points; current point with a view cone)
  const MAPW = 150, MAPH = 150;
  function drawMap() {
    const plan = entry && entry.plan; const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (!points.length) { map.style.display = 'none'; return; }
    map.style.display = '';
    const lv = cur ? cur.level : 0;
    const pts = points.filter(p => p.level === lv);
    const rooms = plan && plan.rooms ? plan.rooms.filter(r => r.level === lv) : [];
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    const acc = (x, z) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); };
    rooms.forEach(r => r.poly.forEach(([x, z]) => acc(x, z))); pts.forEach(p => acc(p.pos[0], p.pos[1]));
    const w = x1 - x0 || 1, h = z1 - z0 || 1, pad = 10;
    // plan drawn with the facade (+v) at the top: screen y = −v ; +u to the left when looking at the facade (mirror-free)
    const s = Math.min((MAPW - pad * 2) / w, (MAPH - pad * 2) / h);
    const cw = Math.round(w * s + pad * 2), ch = Math.round(h * s + pad * 2);
    mapC.width = cw * dpr; mapC.height = ch * dpr; mapC.style.width = cw + 'px'; mapC.style.height = ch + 'px';
    const X = x => pad + (x1 - x) * s, Y = z => pad + (z1 - z) * s;
    mapC._tx = { X, Y, s, pts };
    const c = mapC.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, cw, ch);
    c.lineJoin = 'round';
    for (const r of rooms) {
      c.beginPath(); r.poly.forEach(([x, z], i) => i ? c.lineTo(X(x), Y(z)) : c.moveTo(X(x), Y(z))); c.closePath();
      c.fillStyle = /balcony|loggia|terrace/.test(r.kind) ? 'rgba(201,164,92,.07)' : 'rgba(255,255,255,.06)'; c.fill();
      c.strokeStyle = 'rgba(230,201,135,.55)'; c.lineWidth = 1; c.stroke();
    }
    if (plan && plan.outline) {
      c.beginPath(); plan.outline.forEach(([x, z], i) => i ? c.lineTo(X(x), Y(z)) : c.moveTo(X(x), Y(z))); c.closePath(); c.strokeStyle = 'rgba(230,201,135,.55)'; c.stroke();
    }
    for (const p of pts) {
      const on = cur && p.id === cur.id;
      c.beginPath(); c.arc(X(p.pos[0]), Y(p.pos[1]), on ? 4.5 : 3.2, 0, Math.PI * 2);
      c.fillStyle = on ? '#e6c987' : 'rgba(243,234,215,.75)'; c.fill();
    }
    if (cur) {
      // view cone: camera looks along (−sin yaw, −cos yaw) in plan (x,z)
      const cx = X(cur.pos[0]), cy = Y(cur.pos[1]);
      const ang = (a) => { const dx = -Math.sin(a), dz = -Math.cos(a); return Math.atan2(-dz, -dx); };   // screen angle of plan direction (X flipped, Y flipped)
      const a = ang(yaw), half = (hfov() / 2) * D2R;
      const g = c.createRadialGradient(cx, cy, 2, cx, cy, 26); g.addColorStop(0, 'rgba(230,201,135,.55)'); g.addColorStop(1, 'rgba(230,201,135,0)');
      c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, 26, a - half, a + half); c.closePath(); c.fillStyle = g; c.fill();
    }
  }
  const hfov = () => 2 * Math.atan(Math.tan(camera.fov * D2R / 2) * camera.aspect) / D2R;
  mapC.addEventListener('click', (e) => {
    const T = mapC._tx; if (!T) return; const r = mapC.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top;
    let best = null, bd = 14;
    for (const p of T.pts) { const d = Math.hypot(T.X(p.pos[0]) - mx, T.Y(p.pos[1]) - my); if (d < bd) { bd = d; best = p; } }
    if (best) goTo(best.id);
  });

  // ---------- navigation
  function setCurrent(p) {
    cur = p; buildHotspots(); markChips(); renderTitle(); drawMap();
  }
  async function showFirst(p, keepView) {
    const tex = await loadTex(imgUrl(p), (e) => { if (e && e.total) bar.style.width = (100 * e.loaded / e.total) + '%'; });
    if (disposed) return;
    U.tA.value = tex; U.tB.value = tex; U.mixK.value = 0; U.offA.value.set(0, 0, 0); U.offB.value.set(0, 0, 0);
    setCurrent(p);
    if (!keepView) { yaw = tYaw = p.yaw ?? 0; pitch = tPitch = -0.05; }
    bar.style.opacity = 0; setTimeout(() => { bar.style.width = '0'; bar.style.opacity = 1; }, 600);
    veil.classList.add('gone');
    preloadNeighbours();
  }
  function preloadNeighbours() { if (!cur) return; for (const id of (cur.links || []).slice(0, 4)) { const q = byId.get(id); if (q) loadTex(imgUrl(q)).catch(() => {}); } }
  async function goTo(id) {
    if (busy || !cur || id === cur.id) return;
    const q = byId.get(id); if (!q) return;
    busy = true; lastInteract = performance.now();
    bar.style.opacity = 1;
    let tex;
    try { tex = await loadTex(imgUrl(q), (e) => { if (e && e.total) bar.style.width = (100 * e.loaded / e.total) + '%'; }); }
    catch (e) { busy = false; console.warn('[pano] load failed', e); return; }
    if (disposed) return;
    bar.style.opacity = 0; setTimeout(() => { bar.style.width = '0'; }, 500);
    // Matterport-like move: turn a little towards the target, fly the virtual eye from the old point to the new one while
    // both panoramas are re-projected from their own centres (parallax-correct) and cross-faded, with a gentle FOV dip.
    const from = curEye(), to = new THREE.Vector3(q.pos[0], levelY(q) + EYE, q.pos[1]);
    const d = to.clone().sub(from); const dist = Math.hypot(d.x, d.z);
    const wantYaw = dist > 0.2 ? Math.atan2(-d.x, -d.z) : yaw;
    let dy = Math.atan2(Math.sin(wantYaw - yaw), Math.cos(wantYaw - yaw));
    const turn = Math.abs(dy) > 1.3 ? dy : dy * 0.6;     // face the direction of travel (fully if it is behind us)
    const yaw0 = yaw, fov0 = fov, dur = Math.min(1300, 650 + dist * 170);
    U.tA.value = U.tA.value; U.tB.value = tex; U.mixK.value = 0;
    const pA = cur, t0 = performance.now();
    hotG.visible = false;
    await new Promise(res => {
      const step = () => {
        if (disposed) return res();
        const k = Math.min(1, (performance.now() - t0) / dur), e = easeInOut(k);
        yaw = tYaw = yaw0 + turn * Math.min(1, e * 1.6);
        const eye = from.clone().lerp(to, e);
        U.offA.value.copy(offsetOf(pA, eye)).multiplyScalar(1).divideScalar(1);
        U.offB.value.copy(offsetOf(q, eye));
        // the sphere shader works in units of the 10 m sphere: scale offsets accordingly
        U.offA.value.multiplyScalar(1); U.offB.value.multiplyScalar(1);
        U.mixK.value = THREE.MathUtils.smoothstep(k, 0.25, 0.8);
        fov = tFov = fov0 - Math.sin(Math.PI * k) * 8;
        if (k < 1) requestAnimationFrame(step); else res();
      };
      step();
    });
    U.tA.value = tex; U.mixK.value = 0; U.offA.value.set(0, 0, 0); U.offB.value.set(0, 0, 0);
    fov = tFov = fov0;
    hotG.visible = true;
    setCurrent(q);
    busy = false;
    preloadNeighbours();
  }

  async function loadEntry(sId, keepPoint) {
    typeId = typeId || (MANIFEST && Object.keys(MANIFEST.types || {})[0]);
    const T = MANIFEST.types && MANIFEST.types[typeId];
    let s = sId && styleEntry(typeId, sId) ? sId : (T && (styleEntry(typeId, styleId) ? styleId : Object.keys(T.styles || {})[0]));
    entry = s ? T.styles[s] : null;
    if (!entry || !entry.points || !entry.points.length) {
      veil.querySelector('.tx').textContent = L().none; veil.querySelector('.sp').style.display = 'none';
      return false;
    }
    styleId = s; entry.commons = !!T.commons; if (T.title && !entry.title) entry.title = T.title;
    if (!entry.plan && T.plan) entry.plan = T.plan;
    points = entry.points; byId = new Map(points.map(p => [p.id, p]));
    renderStyles(); renderChips();
    let start = (keepPoint && byId.get(keepPoint)) || (opts.pointId && byId.get(opts.pointId)) || byId.get(entry.start) || points[0];
    await showFirst(start, !!keepPoint);
    return true;
  }

  // ---------- input: drag / pinch / wheel / keys / gyro
  const ptrs = new Map(); let dragMoved = 0, pinch0 = 0, fovPinch0 = FOV0, lastX = 0, lastY = 0, velYaw = 0, velPitch = 0;
  const raycaster = new THREE.Raycaster(); const ndc = new THREE.Vector2();
  function pick(e) {
    const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(hotG.children, true);
    return hits.length ? hits[0].object.userData.target || hits[0].object.parent.userData.target : null;
  }
  // floor point under the pointer (for the reticle and click-to-walk to the nearest linked point)
  function floorHit(e) {
    const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const d = raycaster.ray.direction; if (d.y > -0.08) return null;
    const t = -EYE / d.y; const p = d.clone().multiplyScalar(t); return Math.hypot(p.x, p.z) < 12 ? p : null;
  }
  function nearestLinkTo(p) {
    if (!cur || !p) return null; let best = null, bd = 1.6;
    for (const id of cur.links || []) { const q = byId.get(id); if (!q || q.level !== cur.level) continue; const d = Math.hypot(q.pos[0] - cur.pos[0] - p.x, q.pos[1] - cur.pos[1] - p.z); if (d < bd) { bd = d; best = id; } }
    return best;
  }
  const degPerPx = () => camera.fov / (canvas.clientHeight || 600);
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture?.(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); lastInteract = performance.now();
    if (ptrs.size === 1) { dragMoved = 0; lastX = e.clientX; lastY = e.clientY; velYaw = velPitch = 0; canvas.classList.add('drag'); }
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); fovPinch0 = tFov; }
  });
  canvas.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) {
      // hover: hotspot cursor + reticle
      if (e.pointerType === 'mouse') {
        const id = pick(e); canvas.classList.toggle('hot', !!id);
        const p = floorHit(e); if (p && !busy) { ret.position.set(p.x, -EYE + 0.012, p.z); ret.material.opacity = 0.55; } else ret.material.opacity = 0;
      }
      return;
    }
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch0 > 0) tFov = THREE.MathUtils.clamp(fovPinch0 * pinch0 / d, FOV_MIN, FOV_MAX);
      dragMoved += 10; return;
    }
    const dx = e.clientX - lastX, dy = e.clientY - lastY; lastX = e.clientX; lastY = e.clientY;
    dragMoved += Math.abs(dx) + Math.abs(dy);
    const k = degPerPx() * D2R;
    tYaw += dx * k; tPitch = THREE.MathUtils.clamp(tPitch + dy * k, -1.45, 1.45);
    velYaw = dx * k; velPitch = dy * k; lastInteract = performance.now();
  });
  const up = e => {
    const was = ptrs.has(e.pointerId); ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch0 = 0;
    if (!ptrs.size) canvas.classList.remove('drag');
    if (was && e.type === 'pointerup' && dragMoved < 8 && ptrs.size === 0) {
      const id = pick(e) || nearestLinkTo(floorHit(e)); if (id) goTo(id);
    }
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('pointerleave', () => { ret.material.opacity = 0; });
  canvas.addEventListener('wheel', e => { e.preventDefault(); tFov = THREE.MathUtils.clamp(tFov * Math.exp(e.deltaY * 0.0012), FOV_MIN, FOV_MAX); lastInteract = performance.now(); }, { passive: false });
  const onKey = e => {
    if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
    const k = e.key; let used = true;
    if (k === 'ArrowLeft') tYaw += 0.12; else if (k === 'ArrowRight') tYaw -= 0.12;
    else if (k === 'ArrowUp') { // step to the linked point closest to the view direction
      if (!cur) return; let best = null, bd = 0.8;
      for (const id of cur.links || []) { const q = byId.get(id); const a = Math.atan2(-(q.pos[0] - cur.pos[0]), -(q.pos[1] - cur.pos[1])); const d = Math.abs(Math.atan2(Math.sin(a - yaw), Math.cos(a - yaw))); if (d < bd) { bd = d; best = id; } }
      if (best) goTo(best);
    } else if (k === 'ArrowDown') tYaw += Math.PI;
    else if (k === '+' || k === '=') tFov = Math.max(FOV_MIN, tFov - 8); else if (k === '-') tFov = Math.min(FOV_MAX, tFov + 8);
    else if (k === 'Escape') { onExit && onExit(); } else used = false;
    if (used) { e.preventDefault(); lastInteract = performance.now(); }
  };
  window.addEventListener('keydown', onKey);
  zIn.addEventListener('click', () => { tFov = Math.max(FOV_MIN, tFov - 10); });
  zOut.addEventListener('click', () => { tFov = Math.min(FOV_MAX, tFov + 10); });
  bExit.addEventListener('click', () => onExit && onExit());
  bFree.addEventListener('click', () => {
    if (!onSwitchTo3D || !cur) return;
    const info = { unitId, typeId, styleId, pointId: cur.id, u: cur.pos[0], v: cur.pos[1], level: cur.level || 0, yaw: wrap(yaw), room: cur.room, frame: entry.frame || 'unit' };
    if (entry.frame === 'building') Object.assign(info, { x: cur.pos[0], z: cur.pos[1], floor: cur.floor ?? entry.floor, building: entry.building });
    onSwitchTo3D(info);
  });
  // gyro (mobile): only after an explicit tap on iOS (permission); orientation deltas are added to the drag yaw/pitch
  let gyroOn = false, gyro0 = null;
  const onOrient = (ev) => {
    if (!gyroOn || ev.alpha == null) return;
    const a = ev.alpha * D2R, b = ev.beta * D2R;
    if (!gyro0) { gyro0 = { a, b, yaw: tYaw, pitch: tPitch }; return; }
    const portrait = (screen.orientation ? screen.orientation.angle : window.orientation || 0) % 180 === 0;
    if (portrait) { tYaw = gyro0.yaw + (a - gyro0.a); tPitch = THREE.MathUtils.clamp(gyro0.pitch - (b - gyro0.b), -1.45, 1.45); }
    else { tYaw = gyro0.yaw + (a - gyro0.a); }
  };
  const isTouch = (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches);
  if (isTouch && 'DeviceOrientationEvent' in window) {
    const gb = el('button', 'pt-btn pt-ghost'); gb.textContent = L().gyro; gb.style.height = '30px'; gb.style.alignSelf = 'center';
    gb.addEventListener('click', async () => {
      try { if (typeof DeviceOrientationEvent.requestPermission === 'function') { const r = await DeviceOrientationEvent.requestPermission(); if (r !== 'granted') return; } } catch { return; }
      gyroOn = !gyroOn; gyro0 = null; gb.style.borderColor = gyroOn ? 'var(--g)' : '';
    });
    side.appendChild(gb);
    window.addEventListener('deviceorientation', onOrient);
  }
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

  // ---------- loop
  const resize = () => {
    const w = root.clientWidth || container.clientWidth || window.innerWidth, h = root.clientHeight || container.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    // portrait phones: widen the vertical FOV a little so the room still reads
    camera.updateProjectionMatrix(); drawMap();
  };
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null; ro ? ro.observe(root) : window.addEventListener('resize', resize);
  let raf = 0, lastT = performance.now(), hintHidden = false;
  const loop = (now) => {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    // inertia after release
    if (!ptrs.size && !busy && (Math.abs(velYaw) > 1e-4 || Math.abs(velPitch) > 1e-4)) { tYaw += velYaw; tPitch = THREE.MathUtils.clamp(tPitch + velPitch, -1.45, 1.45); velYaw *= 0.9; velPitch *= 0.9; }
    // gentle auto-rotate after 12 s idle
    if (!busy && !gyroOn && now - lastInteract > 12000) tYaw += dt * 0.05;
    if (!hintHidden && now - lastInteract < 1000 && now > 4000) { /* keep */ }
    const kk = 1 - Math.exp(-dt * 14);
    yaw += (tYaw - yaw) * kk; pitch += (tPitch - pitch) * kk; fov += (tFov - fov) * kk;
    camera.fov = fov; camera.updateProjectionMatrix();
    camera.rotation.set(pitch, yaw, 0);
    // hotspots: fade with distance, pulse slightly
    const pulse = 0.92 + 0.08 * Math.sin(now / 420);
    for (const g of hotG.children) { const d = Math.hypot(g.position.x, g.position.z); const s = THREE.MathUtils.clamp(0.9 + d * 0.06, 0.9, 1.4) * pulse; g.scale.setScalar(s); }
    renderer.render(scene, camera);
    if (map.style.display !== 'none' && ((now / 100) | 0) % 2 === 0) drawMap();
  };
  resize(); raf = requestAnimationFrame(loop);
  setTimeout(() => { hint.style.opacity = 0; hintHidden = true; }, 7000);

  const ok = await loadEntry(styleId);
  renderTitle();
  const api = {
    get pointId() { return cur && cur.id; },
    get styleId() { return styleId; },
    async setStyle(s) {
      if (!styleEntry(typeId, s) || s === styleId || busy) return;
      const keep = cur && cur.id; const y = tYaw, p = tPitch;
      busy = true;
      const T = MANIFEST.types[typeId]; entry = T.styles[s]; styleId = s; points = entry.points; byId = new Map(points.map(q => [q.id, q]));
      const q = byId.get(keep) || points[0];
      let tex; try { tex = await loadTex(imgUrl(q)); } catch { busy = false; return; }
      // plain cross-fade in place (same standing point, new design)
      U.tB.value = tex; U.offA.value.set(0, 0, 0); U.offB.value.set(0, 0, 0);
      const t0 = performance.now();
      await new Promise(res => { const st = () => { const k = Math.min(1, (performance.now() - t0) / 700); U.mixK.value = easeInOut(k); k < 1 ? requestAnimationFrame(st) : res(); }; st(); });
      U.tA.value = tex; U.mixK.value = 0; tYaw = y; tPitch = p;
      busy = false; renderStyles(); renderChips(); setCurrent(q); preloadNeighbours();
    },
    goTo, setTexts: () => { setTexts(); renderChips(); renderStyles(); renderTitle(); },
    dispose() {
      if (disposed) return; disposed = true;
      cancelAnimationFrame(raf); ro && ro.disconnect(); window.removeEventListener('resize', resize); window.removeEventListener('keydown', onKey);
      window.removeEventListener('deviceorientation', onOrient);
      for (const pr of texCache.values()) pr.then(t => t.dispose()).catch(() => {});
      texCache.clear();
      sphere.geometry.dispose(); sphere.material.dispose(); ringGeo.dispose(); discGeo.dispose(); hitGeo.dispose();
      renderer.dispose(); root.remove();
    },
    ok,
  };
  return api;
}

if (typeof window !== 'undefined') {
  window.VRC_PANO = { open: openPanoTour, has: hasPano, styles: panoStyles, ready };
}
