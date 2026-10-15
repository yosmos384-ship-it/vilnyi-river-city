// core-pano.js — "סיור 360°" panorama mode: locked camera at nodes, inertia look, FOV zoom, 3D ring hotspots,
// stair links, carousel, auto-rotate, and equirectangular 360 export (CubeCamera → shader → PNG).
// Owner: CORE. No side effects on import.
import * as THREE from 'three';
import { createArrowSet, createFloorCursor } from './core-nav.js';

const FLOOR_HE = { upper: 'קומה עליונה', main: 'קומת כניסה', basement: 'מרתף', outside: 'חוץ' };

function labelTexture(text, sub) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 512, 128);
  const r = 40;
  g.fillStyle = 'rgba(12,18,28,0.78)';
  g.beginPath(); g.moveTo(r, 8); g.lineTo(512 - r, 8); g.arc(512 - r, 64, 56, -Math.PI / 2, Math.PI / 2); g.lineTo(r, 120); g.arc(r, 64, 56, Math.PI / 2, -Math.PI / 2); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(80,230,255,0.9)'; g.lineWidth = 4; g.stroke();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.direction = 'rtl';
  g.font = '600 46px system-ui, -apple-system, "Segoe UI", Arial, sans-serif';
  g.fillText(text, 256, sub ? 52 : 66);
  if (sub) { g.font = '400 26px system-ui, Arial, sans-serif'; g.fillStyle = 'rgba(200,240,255,0.9)'; g.fillText(sub, 256, 96); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function createPano(env) {
  // env: {scene, renderer, camera, plan, getNodes(), isOccluded(a,b), fade(op,ms) → Promise, ui:{list, tip, autoBtn}, onGo(node), toast(msg), setHighQuality(bool), requestShadow()}
  //   V2 nav: getNav() → core-nav controller (graph-based Street-View arrows, paths, floor cursor), isTouch,
  //   getPhotoreal() → true while the path-traced 360 panorama is displayed (arrows then render in an overlay pass)
  const { scene, renderer, camera, plan } = env;
  const group = new THREE.Group(); group.userData.__core = true; group.visible = false; scene.add(group);
  const ringGeo = new THREE.RingGeometry(0.2, 0.27, 48); ringGeo.rotateX(-Math.PI / 2);
  const discGeo = new THREE.CircleGeometry(0.2, 40); discGeo.rotateX(-Math.PI / 2);
  const hitGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.12, 16);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const discMat = new THREE.MeshBasicMaterial({ color: 0x9ff0ff, transparent: true, opacity: 0.18, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });

  // V3: fov eases toward fovT (pinch / wheel / ctrl+wheel trackpad pinch), range FOV_MIN..FOV_MAX; default from env.defaultFov()
  const FOV_MIN = 35, FOV_MAX = 95;
  const defFov = () => { try { const f = env.defaultFov && env.defaultFov(); return isFinite(f) ? f : 75; } catch (_) { return 75; } };
  const st = { active: false, node: null, yaw: 0, pitch: 0, vyaw: 0, vpitch: 0, fov: 75, fovT: 75, auto: false, dragging: false, gliding: false, hover: null, lastMoveT: 0, photoreal: false };
  // ---- V2 nav: Street-View chevrons + floor cursor (shared look with walk mode, see core-nav.js)
  const navArrows = createArrowSet(scene, { touch: !!env.isTouch, name: 'pano-arrows' });
  const navCursor = createFloorCursor(scene);
  const overlay = new THREE.Scene(); overlay.name = 'pano-nav-overlay';
  { const hl = new THREE.HemisphereLight(0xffffff, 0x9a9a9a, 2.4); hl.userData.__core = true; overlay.add(hl); }
  let inOverlay = false, navMode = false, lastClickUp = null, lastPairT = -1e9, arrowD = 2.4;
  const getNav = () => { const n = env.getNav && env.getNav(); return n && n.ready ? n : null; };
  // single source of truth: env.getPhotoreal() (= core's pathtrace.viewing is a 360 panorama). st.photoreal is only a
  // manual override (tests / debugging); window.__tour.pathtraceActive is an alias of pano.photoreal defined by core.
  const isPhoto = () => { try { return !!(st.photoreal || (env.getPhotoreal && env.getPhotoreal())); } catch (_) { return !!st.photoreal; } };
  const hotspots = []; // {group, node, ring, disc, label?}
  const pointers = new Map();
  let pinchD = 0, pinchFov = 75;
  let downX = 0, downY = 0, downT = 0, moved = 0;
  const rc = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  // stair / door links: [fromId, toId, position(Vector3), label, sub]
  function specialLinks() {
    const S = plan.stairs || {}, up = S.up, dn = S.down;
    const sx = up ? (up.x0 + up.x1) / 2 : 4.95;
    return [
      ['hall', 'landing', new THREE.Vector3(sx, 0.6 + 1.5, 6.0), '⬆ למעלה', 'קומה עליונה · מבואה'],
      ['landing', 'hall', new THREE.Vector3(sx, plan.upperFloor + 0.35, 4.6), '⬇ למטה', 'קומת כניסה · מסדרון'],
      ['hall', 'basement', new THREE.Vector3(5.03, plan.mainFloor + 1.15, 3.80), '⬇ מרתף', 'מדרגות למרתף'],
      ['basement', 'hall', new THREE.Vector3(sx, plan.basementFloor + 1.4, 6.5), '⬆ למעלה', 'קומת כניסה · מסדרון'],
      ['porch', 'living', new THREE.Vector3(6.05, 0.45 + 1.25, 7.55), '🚪 פנימה', 'סלון'],
      ['living', 'porch', new THREE.Vector3(6.05, 0.6 + 1.25, 7.0), '🚪 החוצה', 'מרפסת כניסה'],
    ];
  }

  function clearHotspots() {
    for (const h of hotspots) {
      group.remove(h.group);
      if (h.label) { h.label.material.map.dispose(); h.label.material.dispose(); }
    }
    hotspots.length = 0;
    navArrows.clear();
  }
  // ---- V2 nav arrows: neighbours from the nav graph, arrow points along the first leg of the path (doorway)
  // arrows sit on the floor at a distance that keeps them on screen, above the 360 carousel panel
  let uiT = -1e9, uiFrac = 0.72;
  function arrowFrac() {
    const now = performance.now();
    if (now - uiT > 500) {
      uiT = now; uiFrac = 0.72;
      try {
        const el = document.getElementById('panoUI') || (env.ui.list && env.ui.list.parentElement), r = el && el.getBoundingClientRect(), H = window.innerHeight || 800;
        if (r && r.height > 0 && r.top < H) uiFrac = Math.max(0.2, Math.min(0.72, (r.top - 70 - H / 2) / (H / 2)));
      } catch (_) {}
    }
    return uiFrac;
  }
  function layoutArrows(dt) {
    const cur = st.node; if (!cur || !navArrows.items.length) return;
    const vf = THREE.MathUtils.degToRad(st.fov) / 2;
    const below = Math.atan(arrowFrac() * Math.tan(vf)) - st.pitch;
    const tgt = Math.max(1.2, Math.min(3.4, below > 0.12 ? 1.6 / Math.tan(below) : 3.4));
    arrowD = dt > 0 ? arrowD + (tgt - arrowD) * (1 - Math.exp(-8 * dt)) : tgt;
    const nav = getNav();
    for (const it of navArrows.items) {
      const a = it.data; if (!a) continue;
      const d = Math.max(0.9, Math.min(arrowD, a.maxD));
      if (a.cd < 0 || Math.abs(d - a.cd) > 0.12) { a.cd = d; a.gy = nav ? nav.groundY(cur.p.x + a.dir.x * d, cur.p.z + a.dir.z * d, cur.floorY) : cur.floorY; }
      navArrows.place(it, cur.p.x + a.dir.x * d, a.gy + 0.006, cur.p.z + a.dir.z * d);
    }
  }
  function setOverlayMode(on) {
    on = !!on; if (on === inOverlay) return; inOverlay = on;
    const parent = on ? overlay : scene;
    parent.add(navArrows.root); parent.add(navCursor.group);
    navArrows.setOverlay(on); navCursor.setOverlay(on);
  }
  // called by core after the frame is rendered: while the path-traced panorama replaces the scene render, draw the
  // arrows + cursor on top of it (depthTest off, own light)
  function renderOverlay(cam) {
    if (!st.active || !inOverlay) return;
    const ac = renderer.autoClear;
    try { renderer.autoClear = false; renderer.setRenderTarget(null); renderer.clearDepth(); renderer.render(overlay, cam || camera); }
    catch (e) { /* overlay is optional */ } finally { renderer.autoClear = ac; }
  }
  const _fp = new THREE.Vector3();
  function floorPoint(clientX, clientY) {
    if (!st.node) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const nav = getNav();
    if (nav && !isPhoto()) { const h = nav.surfaceAt(ndc, 30); if (h) return h; }
    camera.updateMatrixWorld();
    rc.setFromCamera(ndc, camera);
    const dy = rc.ray.direction.y; if (dy > -0.02) return null;
    const t = (st.node.floorY - rc.ray.origin.y) / dy; if (!(t > 0) || t > 30) return null;
    return { point: rc.ray.at(t, _fp).clone(), normal: new THREE.Vector3(0, 1, 0), kind: 'floor', dist: t };
  }
  function dblJump(cx, cy) {
    if (!st.active || st.gliding || !st.node) return;
    const nav = getNav(); if (!nav) return;
    const fp = floorPoint(cx, cy);
    let bearing;
    if (fp && fp.kind === 'floor' && Math.hypot(fp.point.x - st.node.p.x, fp.point.z - st.node.p.z) > 0.3) bearing = Math.atan2(fp.point.x - st.node.p.x, fp.point.z - st.node.p.z);
    else { camera.updateMatrixWorld(); rc.setFromCamera(ndc, camera); bearing = Math.atan2(rc.ray.direction.x, rc.ray.direction.z); }
    const tgt = nav.panoInDirection(st.node, bearing);
    if (tgt) goTo(tgt); else if (env.toast) env.toast('אין נקודת 360 בכיוון הזה');
  }
  function onDblClick(e) {
    if (!st.active) return;
    const now = performance.now();
    if (now - lastPairT < 700 || (lastClickUp && lastClickUp.hit && now - lastClickUp.t < 700)) return;
    lastPairT = now; lastClickUp = null;
    dblJump(e.clientX, e.clientY);
  }
  function buildHotspots() {
    clearHotspots();
    const cur = st.node; if (!cur) return;
    const nav = getNav();
    let list = null;
    try { list = nav ? nav.panoArrowList(cur) : null; } catch (e) { console.warn('[pano] nav arrows', e); list = null; }
    navMode = !!list;
    if (list) {
      navArrows.set(list.map((a) => { a.cd = -1; return { key: a.node.id, x: cur.p.x, y: cur.floorY, z: cur.p.z, yaw: Math.atan2(-a.dir.x, -a.dir.z), label: a.label, sub: a.sub, data: a }; }));
      layoutArrows(0);
      navArrows.setVisible(true);
      return;
    }
    const nodes = env.getNodes();
    const same = nodes.filter((n) => n !== cur && n.floor === cur.floor);
    let nearest = null, nd = Infinity;
    for (const n of same) { const d = Math.hypot(n.p.x - cur.p.x, n.p.z - cur.p.z); if (d < nd) { nd = d; nearest = n; } }
    for (const n of same) {
      const d = Math.hypot(n.p.x - cur.p.x, n.p.z - cur.p.z);
      if (d < 0.6) continue;
      let show = n === nearest;
      if (!show && d <= 9) show = !env.isOccluded(cur, n);
      if (!show) continue;
      const g = new THREE.Group();
      g.position.set(n.p.x, n.floorY + 0.03, n.p.z);
      const ring = new THREE.Mesh(ringGeo, ringMat.clone()); ring.renderOrder = 980;
      const disc = new THREE.Mesh(discGeo, discMat.clone()); disc.renderOrder = 979;
      const hit = new THREE.Mesh(hitGeo, hitMat); hit.position.y = 0.06;
      g.add(disc, ring, hit);
      g.userData.node = n;
      group.add(g);
      hotspots.push({ group: g, node: n, ring, disc, label: null, dist: d });
    }
    for (const [a, b, pos, text, sub] of specialLinks()) {
      if (cur.id !== a) continue;
      const tgt = nodes.find((x) => x.id === b); if (!tgt) continue;
      const g = new THREE.Group(); g.position.copy(pos); g.userData.node = tgt;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(text, sub), depthTest: false, depthWrite: false, transparent: true, toneMapped: false }));
      sp.scale.set(1.0, 0.25, 1); sp.renderOrder = 985;
      g.add(sp);
      group.add(g);
      hotspots.push({ group: g, node: tgt, ring: null, disc: null, label: sp, dist: 0 });
    }
  }

  function applyCam() {
    camera.rotation.order = 'YXZ';
    camera.rotation.set(st.pitch, st.yaw, 0, 'YXZ');
    if (Math.abs(camera.fov - st.fov) > 0.01) { camera.fov = st.fov; camera.updateProjectionMatrix(); }
  }

  function markList() {
    if (!env.ui.list) return;
    for (const el of env.ui.list.querySelectorAll('[data-node]')) el.classList.toggle('on', st.node && el.dataset.node === st.node.id);
    const on = env.ui.list.querySelector('.on');
    if (on && on.scrollIntoView) try { on.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); } catch (_) {}
  }
  function buildList() {
    const L = env.ui.list; if (!L) return;
    L.innerHTML = '';
    const nodes = env.getNodes();
    for (const n of nodes) {
      const b = document.createElement('button');
      b.className = 'pnode'; b.dataset.node = n.id;
      b.innerHTML = `<span class="pn-name"></span><span class="pn-floor"></span>`;
      b.querySelector('.pn-name').textContent = n.he;
      b.querySelector('.pn-floor').textContent = FLOOR_HE[n.floor] || '';
      b.addEventListener('click', () => goTo(n));
      L.appendChild(b);
    }
    markList();
  }

  function enter(node) {
    st.active = true; group.visible = true;
    st.node = node; st.yaw = node.camYaw; st.pitch = -0.05; st.vyaw = st.vpitch = 0; st.fov = st.fovT = defFov();
    camera.position.copy(node.p);
    applyCam();
    buildList(); buildHotspots(); markList();
    env.requestShadow && env.requestShadow(node.p);
  }
  function exit() {
    st.active = false; group.visible = false; clearHotspots();
    navCursor.hide(); setOverlayMode(false); renderer.domElement.style.cursor = '';
    st.fov = st.fovT = 70; camera.fov = 70; camera.updateProjectionMatrix();
    if (env.ui.tip) env.ui.tip.style.display = 'none';
  }
  async function goTo(node) {
    if (!st.active || st.gliding || !node || node === st.node) return;
    st.gliding = true;
    clearHotspots(); navCursor.hide(); st.hover = null;
    const from = camera.position.clone(), to = node.p.clone();
    // V2 nav: fly along the nav-graph path (through doorways / up the stairs) instead of through walls
    let route = null;
    try { const nav = getNav(); route = nav ? nav.panoRoute(st.node, node) : null; } catch (_) { route = null; }
    const pts = route && route.length >= 2 ? route.map((v) => v.clone()) : [from.clone(), to.clone()];
    pts[0].copy(from); pts[pts.length - 1].copy(to);
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    const total = cum[cum.length - 1] || 1e-6;
    const dist = from.distanceTo(to);
    const dur = route ? Math.min(2.4, Math.max(0.7, 0.5 + total * 0.1)) : Math.min(1.3, 0.55 + dist * 0.06);
    // look toward target while gliding (keep current yaw if mostly vertical move); with a path: the last leg's heading
    let dx = to.x - from.x, dz = to.z - from.z;
    if (route) for (let i = pts.length - 1; i > 0; i--) { const ax = pts[i].x - pts[i - 1].x, az = pts[i].z - pts[i - 1].z; if (Math.hypot(ax, az) > 0.5) { dx = ax; dz = az; break; } }
    const startYaw = st.yaw;
    let endYaw = startYaw;
    if (Math.hypot(dx, dz) > (route ? 0.5 : 0.8)) endYaw = Math.atan2(-dx, -dz);
    // V3: arrive looking at as much of the room as possible (framing biased toward the travel heading)
    if (env.frameYaw) { try { const fy = env.frameYaw(node, endYaw); if (isFinite(fy)) endYaw = fy; } catch (_) { /* keep travel heading */ } }
    { let d = endYaw - startYaw; d = Math.atan2(Math.sin(d), Math.cos(d)); endYaw = startYaw + d; }
    env.fade(route ? 0.3 : 0.85, dur * 450);
    const t0 = performance.now();
    const posAt = (e) => {
      const s = e * total;
      let j = 1; while (j < pts.length - 1 && cum[j] < s) j++;
      const seg = cum[j] - cum[j - 1];
      camera.position.lerpVectors(pts[j - 1], pts[j], seg > 1e-6 ? Math.min(1, Math.max(0, (s - cum[j - 1]) / seg)) : 1);
    };
    await new Promise((res) => {
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / (dur * 1000));
        const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        if (route) posAt(e); else camera.position.lerpVectors(from, to, e);
        st.yaw = startYaw + (endYaw - startYaw) * Math.min(1, e * 1.4);
        applyCam();
        if (k < 1) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    });
    env.fade(0, 300);
    st.node = node; st.vyaw = 0;
    camera.position.copy(node.p);
    buildHotspots(); markList();
    env.requestShadow && env.requestShadow(node.p);
    env.onGo && env.onGo(node);
    st.gliding = false;
  }

  function pick(clientX, clientY) {
    if (navMode) { const it = navArrows.pick(clientX, clientY); return it && it.data ? it.data.node : null; }
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    rc.setFromCamera(ndc, camera);
    const objs = hotspots.map((h) => h.group);
    if (!objs.length) return null;
    const hits = rc.intersectObjects(objs, true);
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.node) o = o.parent;
      if (o) return o.userData.node;
    }
    return null;
  }

  function onDown(e) {
    if (!st.active) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchD = Math.hypot(a.x - b.x, a.y - b.y); pinchFov = st.fovT;
    }
    st.dragging = true; st.vyaw = st.vpitch = 0;
    navCursor.hide();
    downX = e.clientX; downY = e.clientY; downT = performance.now(); moved = 0;
    st.auto && setAuto(false);
  }
  function onMove(e) {
    if (!st.active) return;
    const p = pointers.get(e.pointerId);
    if (!p) {
      if (e.pointerType === 'mouse' && navMode) {
        const it = st.gliding ? null : navArrows.pick(e.clientX, e.clientY);
        navArrows.setHover(it);
        st.hover = it && it.data ? it.data.node : null;
        renderer.domElement.style.cursor = it ? 'pointer' : 'grab';
        if (env.ui.tip) env.ui.tip.style.display = 'none';
        const fp = it || st.gliding ? null : floorPoint(e.clientX, e.clientY);
        if (fp) navCursor.show(fp.point, fp.normal, fp.kind); else navCursor.hide();
        return;
      }
      if (e.pointerType === 'mouse') {
        const n = pick(e.clientX, e.clientY);
        if (n !== st.hover) {
          st.hover = n;
          renderer.domElement.style.cursor = n ? 'pointer' : 'grab';
          for (const h of hotspots) if (h.ring) h.ring.material.color.setHex(h.node === n ? 0x5ff0ff : 0xffffff);
        }
        if (env.ui.tip) {
          if (n) { env.ui.tip.textContent = n.he; env.ui.tip.style.display = 'block'; env.ui.tip.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -150%)`; }
          else env.ui.tip.style.display = 'none';
        }
      }
      return;
    }
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchD > 0) st.fovT = Math.max(FOV_MIN, Math.min(FOV_MAX, pinchFov * (pinchD / Math.max(1, d))));
      moved += 10;
      return;
    }
    moved += Math.abs(dx) + Math.abs(dy);
    const h = renderer.domElement.clientHeight || 800;
    const k = (st.fov * Math.PI / 180) / h; // radians per pixel
    st.yaw += dx * k; st.pitch = Math.max(-1.4, Math.min(1.4, st.pitch + dy * k));
    const now = performance.now(), dtm = Math.max(1, now - (st.lastMoveT || now - 16)) / 1000;
    st.lastMoveT = now;
    st.vyaw = THREE.MathUtils.lerp(st.vyaw, (dx * k) / dtm, 0.5);
    st.vpitch = THREE.MathUtils.lerp(st.vpitch, (dy * k) / dtm, 0.5);
    applyCam();
  }
  function onUp(e) {
    if (!st.active) return;
    const had = pointers.has(e.pointerId);
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchD = 0;
    if (!pointers.size) st.dragging = false;
    if (performance.now() - (st.lastMoveT || 0) > 90) { st.vyaw = 0; st.vpitch = 0; }
    if (had && moved < 7 && performance.now() - downT < 500) {
      // V2: second click / tap of a double (not on an arrow) = jump to the nearest 360 node in that direction
      const now = performance.now(), win = e.pointerType === 'mouse' ? 450 : 300;
      if (navMode && lastClickUp && !lastClickUp.hit && now - lastClickUp.t < win && Math.hypot(e.clientX - lastClickUp.x, e.clientY - lastClickUp.y) < 30) {
        lastClickUp = null; lastPairT = now; dblJump(e.clientX, e.clientY); return;
      }
      const n = pick(e.clientX, e.clientY);
      lastClickUp = { t: now, x: e.clientX, y: e.clientY, hit: !!n };
      if (n) goTo(n);
    }
  }
  function onWheel(e) {
    if (!st.active) return;
    const k = e.ctrlKey ? 0.01 : 0.0012; // ctrl+wheel = trackpad pinch
    st.fovT = Math.max(FOV_MIN, Math.min(FOV_MAX, st.fovT * Math.exp(Math.max(-120, Math.min(120, e.deltaY)) * k)));
  }
  function setAuto(on) {
    st.auto = !!on;
    if (env.ui.autoBtn) env.ui.autoBtn.classList.toggle('on', st.auto);
  }

  let time = 0;
  function update(dt) {
    if (!st.active) return;
    time += dt;
    if (Math.abs(st.fovT - st.fov) > 0.01) st.fov += (st.fovT - st.fov) * (1 - Math.exp(-12 * dt)); else st.fov = st.fovT;
    if (!st.dragging && !st.gliding) {
      if (Math.abs(st.vyaw) > 1e-4 || Math.abs(st.vpitch) > 1e-4) {
        st.yaw += st.vyaw * dt; st.pitch = Math.max(-1.4, Math.min(1.4, st.pitch + st.vpitch * dt));
        const damp = Math.exp(-4.5 * dt); st.vyaw *= damp; st.vpitch *= damp;
      }
      if (st.auto) st.yaw += 0.12 * dt;
    }
    for (const h of hotspots) {
      if (h.ring) {
        const s = 1 + 0.06 * Math.sin(time * 3 + h.dist);
        h.ring.scale.setScalar(s);
        h.disc.material.opacity = 0.14 + 0.08 * Math.sin(time * 3 + h.dist);
      }
    }
    if (!st.gliding) applyCam();
    if (navMode) {
      setOverlayMode(isPhoto());
      layoutArrows(dt);
      navArrows.setVisible(!st.gliding);
      camera.updateMatrixWorld();
      navArrows.update(dt, camera, renderer.domElement.getBoundingClientRect());
    }
    navCursor.update(dt);
  }

  /* ---------------- equirect export ---------------- */
  function aces() {
    return /* glsl */`
      vec3 panoRRTFit(vec3 v){ vec3 a = v*(v+0.0245786)-0.000090537; vec3 b = v*(0.983729*v+0.4329510)+0.238081; return a/b; }
      vec3 acesFilm(vec3 color, float exposure){
        const mat3 ACESInputMat = mat3(vec3(0.59719,0.07600,0.02840), vec3(0.35458,0.90834,0.13383), vec3(0.04823,0.01566,0.83777));
        const mat3 ACESOutputMat = mat3(vec3(1.60475,-0.10208,-0.00327), vec3(-0.53108,1.10813,-0.07276), vec3(-0.07367,-0.00605,1.07602));
        color *= exposure / 0.6;
        color = ACESInputMat * color; color = panoRRTFit(color); color = ACESOutputMat * color;
        return clamp(color, 0.0, 1.0);
      }
      vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(vec3(0.0031308), c)); }`;
  }
  async function exportEquirect() {
    let W = 4096, H = 2048;
    const maxT = renderer.capabilities.maxTextureSize || 4096;
    if (maxT < 4096) { W = 2048; H = 1024; }
    const prevTarget = renderer.getRenderTarget();
    const cubeRT = new THREE.WebGLCubeRenderTarget(1024, { type: THREE.HalfFloatType, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    const cubeCam = new THREE.CubeCamera(0.05, 2000, cubeRT);
    cubeCam.position.copy(camera.position);
    scene.add(cubeCam);
    const wasVis = group.visible; group.visible = false;
    const wasNav = navArrows.root.visible, wasCur = navCursor.group.visible; navArrows.root.visible = false; navCursor.group.visible = false;
    const eqRT = new THREE.WebGLRenderTarget(W, H, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, generateMipmaps: false, depthBuffer: false });
    const mat = new THREE.ShaderMaterial({
      uniforms: { tCube: { value: cubeRT.texture }, uYaw: { value: st.yaw }, uExposure: { value: renderer.toneMappingExposure } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: `uniform samplerCube tCube; uniform float uYaw; uniform float uExposure; varying vec2 vUv;
        ${aces()}
        void main(){
          float lon = (vUv.x - 0.5) * 6.28318530718;
          float lat = (vUv.y - 0.5) * 3.14159265359;
          float psi = uYaw - lon;
          vec3 dir = vec3(-sin(psi) * cos(lat), sin(lat), -cos(psi) * cos(lat));
          vec3 c = textureCube(tCube, dir).rgb;
          c = acesFilm(c, uExposure);
          gl_FragColor = vec4(toSRGB(c), 1.0);
        }`,
      depthTest: false, depthWrite: false, toneMapped: false, // own ACES; never get three's tonemapping prefix (name clashes)
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); quad.frustumCulled = false;
    const qScene = new THREE.Scene(); qScene.add(quad);
    const qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    let ok = false;
    try {
      cubeCam.update(renderer, scene);
      renderer.setRenderTarget(eqRT);
      renderer.render(qScene, qCam);
      const buf = new Uint8Array(W * H * 4);
      renderer.readRenderTargetPixels(eqRT, 0, 0, W, H, buf);
      renderer.setRenderTarget(prevTarget);
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const g = cv.getContext('2d');
      const img = g.createImageData(W, H);
      const row = W * 4;
      for (let y = 0; y < H; y++) img.data.set(buf.subarray((H - 1 - y) * row, (H - y) * row), y * row);
      g.putImageData(img, 0, 0);
      const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `eakin-rd-360-${(st.node && st.node.id) || 'view'}.png`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        ok = true;
      }
    } catch (e) {
      console.error('360 export failed', e);
    } finally {
      renderer.setRenderTarget(prevTarget);
      group.visible = wasVis; navArrows.root.visible = wasNav; navCursor.group.visible = wasCur;
      scene.remove(cubeCam);
      cubeRT.dispose(); eqRT.dispose(); mat.dispose(); quad.geometry.dispose();
    }
    return ok;
  }

  return {
    enter, exit, goTo, update, exportEquirect, setAuto,
    toggleAuto() { setAuto(!st.auto); },
    onDown, onMove, onUp, onWheel, onDblClick, renderOverlay,
    // V2: true while a path-traced 360 is shown (derived from pathtrace.viewing); setter = manual override only
    get photoreal() { return isPhoto(); }, set photoreal(v) { st.photoreal = !!v; },
    get navArrows() { return navArrows; }, get navMode() { return navMode; },
    setView(yaw, pitch) { if (isFinite(yaw)) st.yaw = yaw; if (isFinite(pitch)) st.pitch = Math.max(-1.4, Math.min(1.4, pitch)); st.vyaw = st.vpitch = 0; applyCam(); },
    goToId(id) { const n = env.getNodes().find((x) => x.id === id); return n ? goTo(n) : Promise.resolve(); },
    get active() { return st.active; },
    get fov() { return st.fov; }, get fovTarget() { return st.fovT; }, set fovTarget(v) { if (isFinite(v)) st.fovT = Math.max(FOV_MIN, Math.min(FOV_MAX, v)); },
    get node() { return st.node; },
    get yaw() { return st.yaw; },
    rebuildList: buildList,
  };
}
