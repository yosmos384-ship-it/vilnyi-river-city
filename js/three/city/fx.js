// City Drive — effects: one particle cloud (smoke, steam, sparks, glass, dust, debris), ground skid marks and the player's headlight pool on the road. Three draw calls in all.
import * as THREE from 'three';

const NP = 420, ND = 56, NS = 260;
export function createFx(scene) {
  const group = new THREE.Group(); group.name = 'city-fx'; scene.add(group);
  // ---- particles
  const pos = new Float32Array(NP * 3), col = new Float32Array(NP * 4), siz = new Float32Array(NP), P = [];
  for (let i = 0; i < NP; i++) P.push({ life: 0 });
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); pg.setAttribute('aCol', new THREE.BufferAttribute(col, 4)); pg.setAttribute('aSize', new THREE.BufferAttribute(siz, 1));
  const pm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uH: { value: 800 } },
    vertexShader: 'attribute vec4 aCol; attribute float aSize; varying vec4 vC; uniform float uH; void main(){ vC = aCol; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(aSize * uH / max(0.3, -mv.z), 0.0, 220.0); }',
    fragmentShader: 'varying vec4 vC; void main(){ vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.12, length(d)) * vC.a; if (a < 0.01) discard; gl_FragColor = vec4(vC.rgb, a); }' });
  const pts = new THREE.Points(pg, pm); pts.frustumCulled = false; pts.renderOrder = 8; group.add(pts);
  let cur = 0;
  const KIND = {
    smoke: { c: [0.32, 0.32, 0.34], a: 0.5, s: 0.5, g: 1.6, life: 2.2, grow: 1.6, drag: 0.8 },
    dark: { c: [0.06, 0.06, 0.07], a: 0.62, s: 0.6, g: 1.9, life: 2.6, grow: 1.9, drag: 0.8 },
    steam: { c: [0.92, 0.94, 0.96], a: 0.42, s: 0.45, g: 2.4, life: 1.6, grow: 2.2, drag: 1.2 },
    spark: { c: [1.6, 1.0, 0.3], a: 1, s: 0.07, g: -9, life: 0.55, grow: 0, drag: 0.5 },
    glass: { c: [0.85, 0.95, 1.0], a: 0.9, s: 0.05, g: -9.8, life: 0.9, grow: 0, drag: 0.3 },
    debris: { c: [0.08, 0.08, 0.09], a: 1, s: 0.11, g: -9.8, life: 1.2, grow: 0, drag: 0.3 },
    dust: { c: [0.55, 0.5, 0.42], a: 0.35, s: 0.6, g: 0.5, life: 1.3, grow: 1.5, drag: 1.5 },
    tyre: { c: [0.8, 0.8, 0.82], a: 0.3, s: 0.45, g: 0.7, life: 1.0, grow: 1.6, drag: 1.4 },
    leaf: { c: [0.2, 0.42, 0.14], a: 1, s: 0.09, g: -3, life: 1.8, grow: 0, drag: 1.2 },
  };
  function emit(kind, x, y, z, vx = 0, vy = 0, vz = 0, n = 1, spread = 1) {
    const K = KIND[kind]; if (!K) return;
    for (let i = 0; i < n; i++) { const p = P[cur]; cur = (cur + 1) % NP; p.K = K; p.life = p.max = K.life * (0.7 + Math.random() * 0.6); p.x = x + (Math.random() - 0.5) * 0.3 * spread; p.y = y + Math.random() * 0.2; p.z = z + (Math.random() - 0.5) * 0.3 * spread;
      p.vx = vx + (Math.random() - 0.5) * 2.2 * spread; p.vy = vy + Math.random() * 1.5 * spread; p.vz = vz + (Math.random() - 0.5) * 2.2 * spread; p.s = K.s * (0.7 + Math.random() * 0.6); }
  }
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  const skids = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x08080a, transparent: true, depthWrite: false, opacity: 0.42, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), NS);
  skids.count = 0; skids.frustumCulled = false; skids.renderOrder = 2; group.add(skids); let sk = 0, skN = 0;
  function skid(x, z, yaw, len, w = 0.24) { _q.setFromAxisAngle(UP, yaw); _m.compose(_v.set(x, 0.03, z), _q, _s.set(w, 1, len)); skids.setMatrixAt(sk, _m); sk = (sk + 1) % NS; skN = Math.min(NS, skN + 1); skids.count = skN; skids.instanceMatrix.needsUpdate = true; }
  // ---- headlight pool on the road (additive; no light is added to the scene)
  const beamTex = (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 256; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 128, 256);
    for (const cx of [44, 84]) { const gr = g.createRadialGradient(cx, 200, 2, cx, 120, 150); gr.addColorStop(0, 'rgba(255,244,220,0.95)'); gr.addColorStop(0.35, 'rgba(255,240,210,0.4)'); gr.addColorStop(1, 'rgba(255,240,210,0)'); g.globalCompositeOperation = 'lighter'; g.fillStyle = gr; g.fillRect(0, 0, 128, 256); }
    g.globalCompositeOperation = 'source-over';   // black (= no light added) at all four edges, so the quad never shows
    for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [[0, 256, 0, 222, 0, 222, 128, 34], [0, 0, 0, 60, 0, 0, 128, 60], [0, 0, 30, 0, 0, 0, 30, 256], [128, 0, 98, 0, 98, 0, 30, 256]]) { const fd = g.createLinearGradient(x0, y0, x1, y1); fd.addColorStop(0, 'rgba(0,0,0,1)'); fd.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = fd; g.fillRect(rx, ry, rw, rh); }
    return new THREE.CanvasTexture(c); })();
  const bgeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5);
  const beam = new THREE.Mesh(bgeo, new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 }));
  beam.visible = false; beam.renderOrder = 4; beam.frustumCulled = false; group.add(beam);
  function update(dt, viewH = 800) {
    pm.uniforms.uH.value = viewH;
    for (let i = 0; i < NP; i++) {
      const p = P[i]; if (p.life <= 0) { siz[i] = 0; col[i * 4 + 3] = 0; continue; }
      const K = p.K; p.life -= dt; const k = Math.exp(-dt * K.drag); p.vx *= k; p.vz *= k; p.vy = K.g < 0 ? p.vy + K.g * dt : p.vy * k + K.g * dt * 0.6;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; if (p.y < 0.03 && K.g < 0) { p.y = 0.03; p.vy = -p.vy * 0.3; p.vx *= 0.6; p.vz *= 0.6; }
      const f = Math.max(0, p.life / p.max); pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      col[i * 4] = K.c[0]; col[i * 4 + 1] = K.c[1]; col[i * 4 + 2] = K.c[2]; col[i * 4 + 3] = K.a * (K.grow ? Math.min(1, f * 1.6) * Math.min(1, (1 - f) * 8 + 0.2) : Math.min(1, f * 3)); siz[i] = p.s * (1 + K.grow * (1 - f));
    }
    pg.attributes.position.needsUpdate = pg.attributes.aCol.needsUpdate = pg.attributes.aSize.needsUpdate = true;
  }
  return {
    group, emit, skid, update,
    setBeam(on, x, z, yaw, high, S) { beam.visible = !!on; if (!on) return; const len = high ? 62 : 34; beam.position.set(x + Math.sin(yaw) * (S.zF - 0.4), 0.04, z + Math.cos(yaw) * (S.zF - 0.4)); beam.rotation.set(0, yaw, 0); beam.scale.set(high ? 15 : 11, 1, len); beam.material.opacity = high ? 0.62 : 0.4; },
    clear() { skN = 0; skids.count = 0; for (const p of P) p.life = 0; },
    dispose() { pg.dispose(); pm.dispose(); skids.geometry.dispose(); skids.material.dispose(); bgeo.dispose(); beam.material.dispose(); beamTex.dispose(); scene.remove(group); },
  };
}
