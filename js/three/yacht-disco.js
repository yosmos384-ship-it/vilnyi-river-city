// VILNYI Lifestyle yacht — the look of the disco in the beach club: a dark, rich room (gloss-black floor, aubergine
// panels, smoked mirror, brass) whose light comes from its fixtures. Programmed two-colour looks that change with the
// music, moving-head beams through haze, wall washes, a mirror ball with pin spots and travelling dots, LED walls and an
// LED floor with smooth gradients, and the crowd lit by the colour of the moment with a rim light.
// No THREE.Light is created: the walkthrough's pooled point lights are recoloured (tick), everything else is emissive
// or additive. Flashes: one soft accent per beat in the last bar of a look (≈ 2 per second, never more than 2.9).
import * as THREE from 'three';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const col = (h) => new THREE.Color(h);
// the looks: [fixture colour A, fixture colour B] — two related colours at a time, never the whole rainbow
const SCENES = [['#ff2a8c', '#19c4ff'], ['#ff9422', '#12bda8'], ['#2c50ff', '#a53cff'], ['#ff3a2e', '#ffb054'], ['#19c4ff', '#7a48ff']].map(([a, b]) => [col(a), col(b)]);
const LIVE = [col('#ffae4a'), col('#3a5cff')];          // the band: amber key light, blue back light
const BEATS = 16;                                       // beats per look (four bars)
export const DISCO_U = {
  uT: { value: 0 }, uBeat: { value: 0 }, uShow: { value: 0 }, uStrobe: { value: 0 }, uPat: { value: 0 },
  uA: { value: SCENES[0][0].clone() }, uB: { value: SCENES[0][1].clone() },
};
// the room (yacht-local): x −58 … −36, z ±6.95, deck at Y0, ceiling 2.55 above it; dance floor 6 × 6 m round (−48.5, 0)
const ROOM = { x0: -58, x1: -36, hw: 6.95, h: 2.55, cx: -48.5 };
const RIG_Y = 2.40, BALL_Y = 2.06, BEAM_LEN = 3.3, BEAM_R = 0.52;

const NOISE = 'float h1(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); } float n1(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h1(i), h1(i + vec2(1, 0)), f.x), mix(h1(i + vec2(0, 1)), h1(i + vec2(1, 1)), f.x), f.y); }\n';
const HEAD = 'uniform float uT, uBeat, uShow, uStrobe, uPat; uniform vec3 uA, uB;\n';
const VS = 'varying vec2 vUv; varying vec3 vP; void main(){ vUv = uv; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }';
const TONE = '\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}';
const SRGB = '\n#include <colorspace_fragment>\n}';
const MATS = {};
function sm(key, fs, o = {}) {
  if (!MATS[key]) {
    MATS[key] = new THREE.ShaderMaterial({ uniforms: { ...DISCO_U, ...(o.uniforms || {}) }, vertexShader: o.vs || VS, fragmentShader: HEAD + (o.plain ? '' : 'varying vec2 vUv; varying vec3 vP;\n') + fs,
      transparent: !!o.add, depthWrite: !o.add, side: o.side ?? THREE.FrontSide, blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending });
    MATS[key].name = (o.keepUV ? 'y-keep-disco-' : 'ydisco.') + key;
  }
  return MATS[key];
}
function tex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; }
function std(key, make) { if (!MATS[key]) { MATS[key] = make(); MATS[key].name = 'ydisco.' + key; } return MATS[key]; }

// ---- surfaces
const floorMat = () => std('floor', () => new THREE.MeshStandardMaterial({ color: '#0b0a0e', roughness: 0.36, metalness: 0, envMapIntensity: 0.5 }));
const ceilMat = () => std('ceil', () => new THREE.MeshStandardMaterial({ color: '#050506', roughness: 0.96, metalness: 0, envMapIntensity: 0.1 }));
// channel-tufted aubergine wall panels (1 m tile, world UVs): soft vertical flutes
const panelMat = () => std('panel', () => new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0, envMapIntensity: 0.25, map: tex(256, 64, (g, w, h) => {
  for (let i = 0; i < 4; i++) { const x = i * w / 4, gr = g.createLinearGradient(x, 0, x + w / 4, 0); gr.addColorStop(0, '#120a16'); gr.addColorStop(0.18, '#2a1832'); gr.addColorStop(0.55, '#231329'); gr.addColorStop(1, '#0f0812'); g.fillStyle = gr; g.fillRect(x, 0, w / 4 + 1, h); }
}) }));
const mirrorMat = () => std('mirror', () => new THREE.MeshStandardMaterial({ color: '#24242c', roughness: 0.06, metalness: 1, envMapIntensity: 0.55 }));
const ballMat = () => std('ball', () => new THREE.MeshStandardMaterial({ color: '#e4e8f0', roughness: 0.1, metalness: 1, envMapIntensity: 1.5, flatShading: true }));
const blindMat = () => { if (!MATS.blind) { MATS.blind = new THREE.MeshBasicMaterial({ color: '#2a2620' }); MATS.blind.name = 'ydisco.blind'; } return MATS.blind; };

// LED floor: 0.5 m tiles, one colour per tile, taken from a slow gradient between the two colours of the look, with a
// ring that runs out from the middle on every beat
const ledFloorMat = () => sm('ledfloor', `void main(){ vec2 q = vUv / 0.5, f = fract(q); vec2 c = (floor(q) + 0.5) * 0.5 - vec2(${ROOM.cx.toFixed(1)}, 0.);
  float r = length(c);
  float m = 0.5 + 0.5 * sin(c.x * 0.85 + sin(c.y * 0.6 + uT * 0.37) * 1.3 + uT * 0.29);
  vec3 col = mix(uA, uB, smoothstep(0.12, 0.88, m));
  float ring = exp(-pow((r - (1. - uBeat) * 4.6) * 1.15, 2.)) * uBeat;
  float lum = 0.17 + 0.2 * (0.5 + 0.5 * sin(r * 1.5 - uT * 1.1)) + 0.34 * ring;
  float tile = smoothstep(0., 0.035, f.x) * (1. - smoothstep(0.965, 1., f.x)) * smoothstep(0., 0.035, f.y) * (1. - smoothstep(0.965, 1., f.y));
  float dif = 0.86 + 0.14 * (1. - length(f - 0.5) * 1.3);
  gl_FragColor = vec4(col * lum * tile * dif + vec3(0.004), 1.);` + TONE);
// LED walls (uv 0 … 1, about 2.9 : 1): four slow ribbons of light in the look's colours, a ring on the beat; warm
// waves for the live show. A faint pixel pitch.
const ledWallMat = () => sm('ledwall', `void main(){ vec2 p = vec2((vUv.x - 0.5) * 2.9, vUv.y - 0.5);
  vec2 g = abs(fract(vUv * vec2(160., 55.)) - 0.5); float px = 0.8 + 0.2 * (1. - smoothstep(0.22, 0.5, max(g.x, g.y)));
  vec3 dj = vec3(0.);
  for (int k = 0; k < 4; k++) { float fk = float(k);
    float y = sin(p.x * (1.1 + fk * 0.55) + uT * (0.33 + fk * 0.11) + fk * 1.7) * (0.19 + 0.04 * fk) + sin(p.x * 0.6 - uT * 0.21 + fk) * 0.08;
    float d = abs(p.y - y), band = exp(-d * d / (0.006 + 0.004 * fk)) + 0.3 * exp(-d * 6.5);
    dj += mix(uA, uB, fk / 3.) * band * (0.5 + 0.2 * uBeat); }
  float r = length(p); dj += mix(uA, uB, 0.5) * exp(-pow((r - (1. - uBeat) * 1.5) * 6., 2.)) * uBeat * 0.4;
  float w = sin(p.x * 1.6 + uT * 0.7) * 0.2 + sin(p.x * 3.1 - uT * 0.45) * 0.1; float band = (1. - smoothstep(0., 0.3, abs(p.y - w)));
  vec3 live = uA * band * 0.9 + uB * (1. - band) * 0.16;
  vec3 col = mix(dj * 0.6, live, uShow) * px * (1. - smoothstep(0.47, 0.5, abs(vUv.y - 0.5))) ;
  gl_FragColor = vec4(min(col, vec3(0.9)) + vec3(0.004), 1.);` + TONE, { keepUV: true, side: THREE.DoubleSide });
// cove lines, fixture lenses: colour A on the port side, B on the starboard side
const emitMat = () => sm('emit', `void main(){ vec3 col = vP.z < 0. ? uA : uB; gl_FragColor = vec4(col * (0.62 + 0.2 * uBeat + 0.1 * uStrobe), 1.);` + TONE);
// wall wash: three washes a side travelling along the panels, brightest low on the wall (uplighters at the skirting)
const washMat = () => sm('wash', `uniform float uY0; void main(){ float h = vP.y - uY0, sd = vP.z < 0. ? 0. : 1.; vec3 col = vec3(0.);
  for (int k = 0; k < 3; k++) { float fk = float(k); float cx = -47. + 9.5 * sin(uT * (0.21 + 0.08 * fk) + fk * 2.1 + sd * 1.3); float s = exp(-pow((vP.x - cx) / 2.3, 2.));
    col += (mod(fk + sd, 2.) < 0.5 ? uA : uB) * s; }
  float up = exp(-h * 1.05) * 0.85 + 0.15 * (1. - smoothstep(1.2, ${ROOM.h.toFixed(2)}, h));
  gl_FragColor = vec4(col * up * (0.34 + 0.07 * uBeat), 1.);` + SRGB, { add: true, uniforms: { uY0: { value: 0 } } });

// ---- moving heads: every beam, its pool of light on the floor and the mirror ball's dots are placed in the vertex shader
const BEAM_FN = `uniform float uY, uLen, uR, uBallY, uY0;
vec3 beamDir(vec4 b){
  vec2 o = b.xy;
  if (b.w > 1.5) return normalize(vec3(${ROOM.cx.toFixed(1)} - o.x, uBallY - uY, -o.y));      // pin spot on the mirror ball
  float a = uT * 0.6 + b.z, c = uT * 0.43 + b.z * 1.7;
  vec2 s1 = vec2(sin(a), cos(c)) * 0.5;                                                       // each head on its own sweep
  vec2 s2 = (o - vec2(${ROOM.cx.toFixed(1)}, 0.)) * 0.2 * (0.35 + 0.65 * sin(uT * 0.9)) + 0.22 * vec2(sin(uT * 1.3 + b.z), cos(uT * 1.3 + b.z));   // the fan opening and closing
  vec2 s = mix(s1, s2, uPat);
  return normalize(vec3(s.x, -1., s.y));
}
vec3 beamCol(vec4 b){ return b.w > 1.5 ? vec3(1., 0.93, 0.8) : mix(uA, uB, b.w); }
float beamLvl(vec4 b){ return b.w > 1.5 ? 0.8 : 0.55 + 0.45 * sin(uT * 1.7 + b.z * 2.); }
`;
const RIG_UNI = () => ({ uY: { value: 0 }, uLen: { value: BEAM_LEN }, uR: { value: BEAM_R }, uBallY: { value: 0 }, uY0: { value: 0 } });
const beamMat = () => sm('beams', NOISE + `varying vec3 vN, vV, vL, vC; varying float vT, vK; uniform float uY0;
  void main(){ float body = pow(abs(dot(normalize(vN), normalize(vV))), 1.15);            // thick through the middle, soft at the silhouette
    float along = 0.12 + 0.88 * pow(1. - vT, 1.25);
    float haze = 0.62 + 0.38 * n1(vec2(vL.x * 1.6 + vL.z * 1.1 + uT * 0.12, vL.y * 2.4 - uT * 0.28));
    float a = body * along * haze * vK * (0.44 + 0.16 * uBeat) * smoothstep(0.12, 1.1, length(vV)) * smoothstep(uY0 + 0.02, uY0 + 0.4, vL.y);
    gl_FragColor = vec4(vC, a);` + SRGB, { add: true, plain: true, side: THREE.DoubleSide, uniforms: RIG_UNI(),
  vs: HEAD + BEAM_FN + `attribute vec4 aB; attribute vec2 aQ; varying vec3 vN, vV, vL, vC; varying float vT, vK;
  void main(){ vec3 d = beamDir(aB), s = normalize(cross(d, vec3(0., 0., 1.))), u = cross(s, d);
    float r = mix(0.03, aB.w > 1.5 ? 0.16 : uR, aQ.x), len = aB.w > 1.5 ? distance(vec3(aB.x, uY, aB.y), vec3(${ROOM.cx.toFixed(1)}, uBallY, 0.)) : uLen;
    vec3 rad = s * cos(aQ.y) + u * sin(aQ.y), p = vec3(aB.x, uY, aB.y) + d * (aQ.x * len) + rad * r;
    vec4 mv = modelViewMatrix * vec4(p, 1.); vN = normalMatrix * rad; vV = -mv.xyz; vL = p; vT = aQ.x; vC = beamCol(aB); vK = beamLvl(aB); gl_Position = projectionMatrix * mv; }` });
const poolMat = () => sm('pools', `varying vec2 vQ; varying vec3 vC; varying float vK;
  void main(){ float r = length(vQ); float a = (1. - smoothstep(0.25, 1., r)) * vK * (0.3 + 0.12 * uBeat); gl_FragColor = vec4(vC, a);` + SRGB, { add: true, plain: true, uniforms: RIG_UNI(),
  vs: HEAD + BEAM_FN + `attribute vec4 aB; attribute vec2 aQ; varying vec2 vQ; varying vec3 vC; varying float vK;
  void main(){ vec3 d = beamDir(aB); float t = (uY0 + 0.045 - uY) / d.y; vec3 hit = vec3(aB.x, uY, aB.y) + d * t;
    float r = mix(0.03, uR, t / uLen) * 1.25; vec3 p = hit + vec3(aQ.x, 0., aQ.y) * r;
    vQ = aQ; vC = beamCol(aB); vK = beamLvl(aB); gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.); }` });
const dotMat = () => sm('dots', `varying vec2 vQ; varying vec3 vC; varying float vK;
  void main(){ float a = (1. - smoothstep(0.35, 1., length(vQ))) * vK; gl_FragColor = vec4(vC, a);` + SRGB, { add: true, plain: true, uniforms: { uBall: { value: new THREE.Vector3() }, uMin: { value: new THREE.Vector3() }, uMax: { value: new THREE.Vector3() } },
  vs: HEAD + `uniform vec3 uBall, uMin, uMax; attribute vec3 aD; attribute vec3 aQ; varying vec2 vQ; varying vec3 vC; varying float vK;
  void main(){ float an = uT * 0.35, cs = cos(an), sn = sin(an);
    vec3 d = vec3(aD.x * cs - aD.z * sn, aD.y, aD.x * sn + aD.z * cs); d += vec3(1e-4) * (1. - abs(sign(d)));
    vec3 tt = (mix(uMin, uMax, step(0., d)) - uBall) / d; float t = min(tt.x, min(tt.y, tt.z));
    vec3 hit = uBall + d * t, n, e1, e2;
    if (t == tt.x) { n = vec3(-sign(d.x), 0., 0.); e1 = vec3(0., 1., 0.); e2 = vec3(0., 0., 1.); }
    else if (t == tt.y) { n = vec3(0., -sign(d.y), 0.); e1 = vec3(1., 0., 0.); e2 = vec3(0., 0., 1.); }
    else { n = vec3(0., 0., -sign(d.z)); e1 = vec3(1., 0., 0.); e2 = vec3(0., 1., 0.); }
    float sz = (0.05 + 0.016 * t) * aQ.z;
    vec3 p = hit + n * 0.016 + (e1 * aQ.x + e2 * aQ.y) * sz;
    vQ = aQ.xy; vK = clamp(2.4 / (t + 0.8), 0., 1.) * (t == tt.x && d.x < 0. ? 0.25 : 1.) * (1.0 + 0.15 * uBeat);     // (faint on the stern glass)
    vC = mix(vec3(1., 0.95, 0.86), aQ.z > 1. ? uA : uB, 0.45);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.); }` });

function rigGeometry(heads) {
  const SEG = 14, aB = [], aQ = [], idx = [], pos = [];
  heads.forEach((h) => { const base = aB.length / 4;
    for (let r = 0; r < 2; r++) for (let i = 0; i <= SEG; i++) { aB.push(h[0], h[1], h[2], h[3]); aQ.push(r, i / SEG * Math.PI * 2); pos.push(h[0], 0, h[1]); }
    for (let i = 0; i < SEG; i++) { const a = base + i, b = a + 1, c = base + SEG + 1 + i, d = c + 1; idx.push(a, c, b, b, c, d); } });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aB', new THREE.Float32BufferAttribute(aB, 4)); g.setAttribute('aQ', new THREE.Float32BufferAttribute(aQ, 2)); g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(ROOM.cx, 0, 0), 30); return g;
}
function quadGeometry(n, fill) {   // n quads; fill(i) → { attrs: {name: [..per quad..]}, } corners in aQ
  const aQ = [], idx = [], pos = [], extra = {};
  for (let i = 0; i < n; i++) { const f = fill(i);
    for (const [cx, cy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { pos.push(ROOM.cx, 0, 0); if (f.q3 != null) aQ.push(cx, cy, f.q3); else aQ.push(cx, cy); for (const k in f.attrs) (extra[k] || (extra[k] = [])).push(...f.attrs[k]); }
    idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aQ', new THREE.Float32BufferAttribute(aQ, aQ.length / (n * 4)));
  for (const k in extra) g.setAttribute(k, new THREE.Float32BufferAttribute(extra[k], extra[k].length / (n * 4)));
  g.setIndex(idx); g.boundingSphere = new THREE.Sphere(new THREE.Vector3(ROOM.cx, 0, 0), 30); return g;
}
const keep = (o, name, order = 5) => { o.userData.keep = true; o.raycast = () => {}; o.frustumCulled = false; o.renderOrder = order; o.name = name; return o; };

/**
 * The room and its light rig. c: the zone's build context (yacht-rooms.js makeCtx). Called first in the zone's build();
 * the furniture, the bar, the stage gear and the people are added by yacht-rooms.js afterwards.
 */
export function buildDisco(c) {
  const { m } = c, Y0 = c.y, hw = ROOM.hw, H = ROOM.h, brass = m.brass || m.metal, black = m.blackMetal || m.metal;
  const PLANE = new THREE.PlaneGeometry(1, 1), HALF = Math.PI / 2;
  // ---- shell: gloss-black floor, matt black ceiling, fluted aubergine panels with brass reveals and smoked mirror bays
  c.floor(floorMat(), -57.95, -36, -hw, hw);
  c.ceil(-57.95, -36, -hw, hw, { mat: ceilMat(), spots: false });
  for (const sd of [-1, 1]) {
    c.wall(-58, sd * (hw + 0.05), -36, sd * (hw + 0.05), { mat: panelMat(), h: 2.7 });
    const z = sd * hw, zi = sd * (hw - 0.012);
    c.box(black, -57.95, -36.1, 0, 0.1, Math.min(z, zi), Math.max(z, zi));                               // skirting
    for (let x = -57; x <= -36.9; x += 1.5) c.box(brass, x - 0.008, x + 0.008, 0.1, H, Math.min(z, zi), Math.max(z, zi));   // brass reveals
    for (const [x0, x1] of [[-57, -52.5], [-43.5, -40.5]]) c.box(mirrorMat(), x0 + 0.02, x1 - 0.02, 0.5, 2.2, Math.min(z, sd * (hw - 0.008)), Math.max(z, sd * (hw - 0.008)));   // smoked mirror
    // cove line under the ceiling, wash on the panels (additive)
    c.box(emitMat(), -57.9, -36.1, H - 0.075, H - 0.05, sd * (hw - 0.05) - 0.012, sd * (hw - 0.05) + 0.012);
    c.mesh(PLANE, washMat(), -47, H / 2, sd * (hw - 0.02), [0, sd > 0 ? Math.PI : 0, 0], [21.8, H, 1]);
  }
  washMat().uniforms.uY0.value = Y0;
  // ---- LED dance floor in a brass frame
  c.slab(ledFloorMat(), -51.5, -45.5, -3, 3, 0.02, 1);
  c.box(brass, -51.56, -45.44, 0.012, 0.03, -3.06, -3.0); c.box(brass, -51.56, -45.44, 0.012, 0.03, 3.0, 3.06); c.box(brass, -51.56, -51.5, 0.012, 0.03, -3, 3); c.box(brass, -45.5, -45.44, 0.012, 0.03, -3, 3);
  // ---- LED walls: behind the stage and behind the DJ (black frames)
  c.mesh(PLANE, ledWallMat(), -36.14, 1.55, 0, [0, -HALF, 0], [7.4, 2.5, 1]);
  c.box(black, -36.2, -36.1, 0.25, 0.3, -3.76, 3.76); c.box(black, -36.2, -36.1, 2.8, 2.85, -3.76, 3.76);
  c.mesh(PLANE, ledWallMat(), -48.5, 1.42, -(hw - 0.07), null, [5.4, 1.86, 1]);
  c.box(black, -51.26, -45.74, 0.43, 0.49, -(hw - 0.02), -(hw - 0.09)); c.box(black, -51.26, -45.74, 2.35, 2.41, -(hw - 0.02), -(hw - 0.09));
  for (const x of [-51.23, -45.77]) c.box(black, x - 0.03, x + 0.03, 0.43, 2.41, -(hw - 0.02), -(hw - 0.09));
  // ---- the rig over the dance floor: two rails and three bridges, eight moving heads, two pin spots, two blinders
  for (const z of [-1.5, 1.5]) c.box(black, -51.4, -45.6, RIG_Y + 0.07, RIG_Y + 0.13, z - 0.035, z + 0.035);
  for (const x of [-51.4, -48.5, -45.6]) c.box(black, x - 0.035, x + 0.035, RIG_Y + 0.07, RIG_Y + 0.13, -1.5, 1.5);
  const heads = [];
  const cyl = new THREE.CylinderGeometry(0.075, 0.06, 0.13, 14), lens = new THREE.CircleGeometry(0.052, 14);
  [-51, -49.33, -47.67, -46].forEach((x, i) => [-1.5, 1.5].forEach((z, j) => {
    heads.push([x, z, i * 1.31 + j * 2.4, j]);
    c.mesh(cyl, black, x, RIG_Y + 0.02, z); c.mesh(lens, emitMat(), x, RIG_Y - 0.047, z, [HALF, 0, 0]);
  }));
  for (const x of [-50.1, -46.9]) { heads.push([x, 0, 0, 2]); c.mesh(cyl, black, x, RIG_Y + 0.02, 0, null, [0.6, 0.8, 0.6]); }
  for (const x of [-51.4, -45.6]) c.box(blindMat(), x - 0.06, x + 0.06, RIG_Y + 0.0, RIG_Y + 0.06, -0.42, 0.42);
  const rig = new THREE.Group(); rig.name = 'y-disco-rig'; rig.userData.keep = true;
  const beams = keep(new THREE.Mesh(rigGeometry(heads), beamMat()), 'y-disco-beams', 6);
  const sweepers = heads.filter(h => h[3] < 1.5);
  const pools = keep(new THREE.Mesh(quadGeometry(sweepers.length, i => ({ attrs: { aB: sweepers[i] } })), poolMat()), 'y-disco-pools', 4);
  // mirror ball: 170 dots thrown round the room (a Fibonacci sphere, leaving out the poles)
  const N = 170, dirs = []; for (let i = 0; i < N; i++) { const y = 0.6 - 1.52 * (i + 0.5) / N, r = Math.sqrt(1 - y * y), a = i * 2.39996; dirs.push([Math.cos(a) * r, y, Math.sin(a) * r]); }
  const dots = keep(new THREE.Mesh(quadGeometry(N, i => ({ attrs: { aD: dirs[i] }, q3: 0.8 + ((i * 7) % 5) * 0.12 })), dotMat()), 'y-disco-dots', 4);
  const ball = keep(new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 3), ballMat()), 'y-disco-ball', 0);
  ball.position.set(ROOM.cx, Y0 + BALL_Y, 0);
  rig.add(beams, pools, dots, ball); c.sg.add(rig);
  c.box(black, ROOM.cx - 0.012, ROOM.cx + 0.012, BALL_Y + 0.24, H, -0.012, 0.012);
  for (const mt of [beamMat(), poolMat()]) { mt.uniforms.uY.value = Y0 + RIG_Y - 0.05; mt.uniforms.uBallY.value = Y0 + BALL_Y; mt.uniforms.uY0.value = Y0; }
  { const u = dotMat().uniforms; u.uBall.value.set(ROOM.cx, Y0 + BALL_Y, 0); u.uMin.value.set(ROOM.x0 + 0.06, Y0 + 0.02, -hw + 0.03); u.uMax.value.set(ROOM.x1 - 0.2, Y0 + H - 0.01, hw - 0.03); }
  c.zone.disco = { rig, ball };
  // ---- the pooled point lights: two over the floor in the look's colours, the DJ and the stage, warm pools at the bar and the lounge
  const L = c.zone.lights, y = Y0;
  L.push([-50.0, y + 2.2, -1.3, 1.05, '#ff2a8c', 8, 'A'], [-47.0, y + 2.2, 1.3, 1.05, '#19c4ff', 8, 'B'], [-39.6, y + 2.3, 0, 0.8, '#ffb070', 8, 'M'],
    [-48.5, y + 2.1, -4.7, 0.5, '#19c4ff', 6, 'B'], [-48.5, y + 2.15, 4.2, 0.85, '#ffb070', 7], [-55.4, y + 2.2, 3.4, 0.36, '#ffb070', 7]);
}

const _a = new THREE.Color(), _b = new THREE.Color(), _m = new THREE.Color();
let lastBt = 0;
/** Per frame while the disco is in sight: the look, the accent flash, the ball, the pooled lights. */
export function discoTick(yacht, zone, dt) {
  const A = yacht.audio, U = DISCO_U, bt = A.beatTime || 0, live = A.show === 'live', n = SCENES.length;
  U.uT.value = (yacht.time || 0) % 3600; U.uBeat.value = A.beat || 0;
  U.uShow.value += ((live ? 1 : 0) - U.uShow.value) * (1 - Math.exp(-3 * dt));
  // the look: BEATS beats each, cross-fading into the next over the last beat
  const ph = bt / BEATS, i = Math.floor(ph), f = ph - i, k0 = clamp((f - (BEATS - 1) / BEATS) * BEATS, 0, 1), k = k0 * k0 * (3 - 2 * k0);
  const s0 = SCENES[((i % n) + n) % n], s1 = SCENES[(((i + 1) % n) + n) % n];
  _a.copy(s0[0]).lerp(s1[0], k).lerp(LIVE[0], U.uShow.value); _b.copy(s0[1]).lerp(s1[1], k).lerp(LIVE[1], U.uShow.value);
  U.uA.value.copy(_a); U.uB.value.copy(_b);
  U.uPat.value += ((i % 2) - U.uPat.value) * (1 - Math.exp(-1.2 * dt));
  // accent: in the last bar of a look the blinders breathe once per beat — at most 2.9 times a second, whatever the tempo
  const rate = dt > 1e-4 ? (bt - lastBt) / dt : 2; lastBt = bt;
  const div = rate > 2.9 ? Math.ceil(rate / 2.9) : 1, fr = bt / div - Math.floor(bt / div);
  const st = !live && f > (BEATS - 4) / BEATS ? Math.exp(-fr * div * 5) : 0;
  U.uStrobe.value += (st - U.uStrobe.value) * (1 - Math.exp(-(st > U.uStrobe.value ? 30 : 9) * dt));
  blindMat().color.setRGB(0.035 + 0.6 * U.uStrobe.value, 0.032 + 0.56 * U.uStrobe.value, 0.028 + 0.5 * U.uStrobe.value);
  if (zone.disco) zone.disco.ball.rotation.y = U.uT.value * 0.35;
  const pool = yacht.walk._lightPool, ls = yacht._ls;
  if (pool && ls) { _m.copy(_a).lerp(_b, 0.5); ls.forEach((l, j) => { if (!l || !l[6] || !pool[j]) return; pool[j].color.copy(l[6] === 'A' ? _a : l[6] === 'B' ? _b : _m); pool[j].intensity *= 0.82 + 0.26 * (A.beat || 0); }); }
}

// ---- people in the disco: the painted cards take the colour of the room — a low neutral fill, the travelling wash of
// the two fixture colours, and a rim of light along the silhouette (from the atlas' own alpha edge)
const FIG = new Map();
export function discoFigureMat(src) {
  let mt = src && FIG.get(src); if (mt) return mt;
  mt = src ? src.clone() : new THREE.MeshBasicMaterial({ color: 0xf4efe8, side: THREE.DoubleSide, alphaTest: 0.5, alphaToCoverage: true });
  mt.name = 'yacht-figure-card';
  mt.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uT: DISCO_U.uT, uBeat: DISCO_U.uBeat, uA: DISCO_U.uA, uB: DISCO_U.uB });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vDiscoP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvDiscoP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uT, uBeat; uniform vec3 uA, uB; varying vec3 vDiscoP;')
      .replace('#include <map_fragment>', `#include <map_fragment>
      #ifdef USE_MAP
      { vec2 px = 1.6 / vec2(textureSize(map, 0));
        float a0 = sampledDiffuseColor.a, aL = texture2D(map, vMapUv - vec2(px.x, 0.)).a, aR = texture2D(map, vMapUv + vec2(px.x, 0.)).a, aU = texture2D(map, vMapUv + vec2(0., px.y)).a;
        float wv = 0.5 + 0.5 * sin(vDiscoP.x * 0.9 + uT * 0.8 + sin(vDiscoP.z * 0.7 - uT * 0.5) * 1.2);
        vec3 wash = mix(uA, uB, wv);
        // nearer the dance floor the colour is stronger; at the bar and the lounge the fill is warmer and calmer
        float fl = (1. - smoothstep(2.5, 7.5, length(vDiscoP.xz - vec2(${ROOM.cx.toFixed(1)}, 0.))));
        vec3 lit = diffuseColor.rgb * (vec3(0.29, 0.26, 0.25) + wash * (0.24 + 0.42 * fl) * (0.8 + 0.2 * uBeat));
        lit += (uA * clamp(a0 - aL, 0., 1.) + uB * clamp(a0 - aR, 0., 1.) + mix(uA, uB, 0.5) * clamp(a0 - aU, 0., 1.) * 0.5) * (0.26 + 0.3 * fl);
        diffuseColor.rgb = lit; }
      #endif`);
  };
  mt.customProgramCacheKey = () => 'ydisco-figure';
  if (src) FIG.set(src, mt);
  return mt;
}
