// core-fx.js — CORE helpers: tweening, WebAudio, water particles, scanner sweep, measure tool.
// Owner: CORE. No side effects on import.
import * as THREE from 'three';

/* ------------------------------------------------------------------ easings / tween */
export const easings = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => t * (2 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outSine: (t) => Math.sin((t * Math.PI) / 2),
  outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  outElastic: (t) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
  outBounce: (t) => {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
};

export function createTweener() {
  const active = [];
  // tween(obj, prop, to, dur, ease) — prop may be a dotted path ('rotation.y'). Resolves true when done, false if superseded.
  function tween(obj, prop, to, dur = 0.5, ease = 'inOutCubic') {
    let target = obj, key = prop;
    if (typeof prop === 'string' && prop.indexOf('.') >= 0) {
      const parts = prop.split('.');
      key = parts.pop();
      for (const p of parts) target = target ? target[p] : undefined;
    }
    if (!target || typeof target[key] !== 'number' || typeof to !== 'number' || !isFinite(to)) return Promise.resolve(false);
    for (let i = active.length - 1; i >= 0; i--) {
      const a = active[i];
      if (a.target === target && a.key === key) { active.splice(i, 1); a.resolve(false); }
    }
    const fn = typeof ease === 'function' ? ease : (easings[ease] || easings.inOutCubic);
    if (!(dur > 0)) { target[key] = to; return Promise.resolve(true); }
    return new Promise((resolve) => active.push({ target, key, from: target[key], to, dur, t: 0, ease: fn, resolve }));
  }
  function update(dt) {
    for (let i = active.length - 1; i >= 0; i--) {
      const a = active[i];
      if (!a) continue;
      a.t += dt;
      const k = Math.min(1, a.t / a.dur);
      let e;
      try { e = a.ease(k); } catch (_) { e = k; }
      a.target[a.key] = a.from + (a.to - a.from) * e;
      if (k >= 1) { const idx = active.indexOf(a); if (idx >= 0) active.splice(idx, 1); a.resolve(true); }
    }
  }
  return { tween, update, get busy() { return active.length > 0; } };
}

/* ------------------------------------------------------------------ audio */
export function createAudio(getCamera) {
  let ac = null, master = null, failed = false;
  const noiseBufs = {};
  const positionals = [];
  let muted = false;
  let gestured = false; // browsers block AudioContext before a user gesture — don't create it until then
  const tmpV = new THREE.Vector3(), tmpR = new THREE.Vector3(), tmpC = new THREE.Vector3();

  function ensure() {
    if (ac || failed) return ac;
    if (!gestured) return null;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { failed = true; return null; }
      ac = new AC();
      master = ac.createGain();
      master.gain.value = muted ? 0 : 0.85;
      master.connect(ac.destination);
    } catch (e) { failed = true; ac = null; }
    return ac;
  }
  function getNoise(type) {
    type = type === 'pink' || type === 'brown' ? type : 'white';
    if (noiseBufs[type]) return noiseBufs[type];
    const len = Math.floor(ac.sampleRate * 2);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (type === 'white') d[i] = w;
      else if (type === 'pink') {
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
      } else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    }
    noiseBufs[type] = buf;
    return buf;
  }
  const dummy = { stop() {}, setGain() {}, source: null, gain: null };

  function destFor(pos, expire) {
    if (!pos) return master;
    const g = api.positional(pos);
    if (g && expire) { const e = positionals.find((p) => p.g === g); if (e) e.expire = expire; }
    return g || master;
  }

  const api = {
    get ctx() { const c = ensure(); if (c && c.state === 'suspended' && !muted) c.resume().catch(() => {}); return c; },
    get master() { ensure(); return master; },
    get muted() { return muted; },
    setMuted(m) {
      muted = !!m; gestured = true;
      const c = ensure(); if (!c) return;
      // suspend the whole context so module sounds routed straight to ac.destination are muted too
      try { if (muted) c.suspend().catch(() => {}); else c.resume().catch(() => {}); } catch (_) {}
    },
    resume() { gestured = true; const c = ensure(); if (c && c.state === 'suspended' && !muted) c.resume().catch(() => {}); },
    // noise(dur, {type:'white'|'pink'|'brown', filter:'lowpass'|'highpass'|'bandpass'..., freq, q, gain, attack, release, pos})
    // dur <= 0 or Infinity → continuous until handle.stop()
    noise(dur = 0.5, o = {}) {
      const c = api.ctx; if (!c) return dummy;
      try {
        const t = c.currentTime;
        const src = c.createBufferSource(); src.buffer = getNoise(o.type); src.loop = true;
        src.playbackRate.value = o.rate || 1;
        const f = c.createBiquadFilter(); f.type = o.filter || 'lowpass'; f.frequency.value = o.freq || 2000; f.Q.value = o.q != null ? o.q : 0.7;
        const g = c.createGain(); const gain = o.gain != null ? o.gain : 0.25;
        const att = o.attack != null ? o.attack : 0.01, rel = o.release != null ? o.release : 0.08;
        const finite = dur > 0 && isFinite(dur);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + att);
        if (finite) {
          g.gain.setValueAtTime(gain, t + Math.max(att, dur - rel));
          g.gain.linearRampToValueAtTime(0, t + dur);
        }
        src.connect(f); f.connect(g); g.connect(destFor(o.pos, finite ? t + dur + 0.5 : 0));
        src.start(t);
        if (finite) src.stop(t + dur + 0.05);
        let stopped = false;
        return {
          source: src, gain: g, filter: f,
          setGain(v, tc = 0.05) { try { g.gain.setTargetAtTime(v, c.currentTime, tc); } catch (_) {} },
          stop(fade = 0.12) {
            if (stopped) return; stopped = true;
            try { const n = c.currentTime; g.gain.cancelScheduledValues(n); g.gain.setValueAtTime(g.gain.value, n); g.gain.linearRampToValueAtTime(0, n + fade); src.stop(n + fade + 0.05); } catch (_) {}
          },
        };
      } catch (e) { return dummy; }
    },
    // tone(freq, dur, {type, gain, attack, release, freqEnd, detune, pos})
    tone(freq = 440, dur = 0.3, o = {}) {
      const c = api.ctx; if (!c) return dummy;
      try {
        const t = c.currentTime;
        const osc = c.createOscillator(); osc.type = o.type || 'sine';
        osc.frequency.setValueAtTime(freq, t);
        if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.freqEnd), t + Math.max(0.01, dur));
        if (o.detune) osc.detune.value = o.detune;
        const g = c.createGain(); const gain = o.gain != null ? o.gain : 0.15;
        const att = o.attack != null ? o.attack : 0.005, rel = o.release != null ? o.release : Math.min(0.25, dur * 0.6);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + att);
        g.gain.setValueAtTime(gain, t + Math.max(att, dur - rel));
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(g); g.connect(destFor(o.pos, t + dur + 0.5));
        osc.start(t); osc.stop(t + dur + 0.05);
        return { source: osc, gain: g, setGain(v) { try { g.gain.setTargetAtTime(v, c.currentTime, 0.05); } catch (_) {} }, stop() { try { osc.stop(); } catch (_) {} } };
      } catch (e) { return dummy; }
    },
    // positional(obj|Vector3) → GainNode (connect your source into it). Gain/pan follow distance to the camera.
    positional(obj) {
      const c = api.ctx; if (!c || !obj) return null;
      try {
        const g = c.createGain(); g.gain.value = 0;
        let p = null;
        if (c.createStereoPanner) { p = c.createStereoPanner(); g.connect(p); p.connect(master); } else g.connect(master);
        const entry = { obj, g, p, expire: 0 };
        positionals.push(entry);
        if (positionals.length > 96) {
          const idx = positionals.findIndex((e) => e.expire > 0);
          positionals.splice(idx >= 0 ? idx : 0, 1);
        }
        g.disposePositional = () => { const i = positionals.indexOf(entry); if (i >= 0) positionals.splice(i, 1); try { g.disconnect(); } catch (_) {} };
        updateOne(entry, true);
        return g;
      } catch (e) { return null; }
    },
    update() {
      if (!ac || !positionals.length) return;
      const now = ac.currentTime;
      for (let i = positionals.length - 1; i >= 0; i--) {
        const e = positionals[i];
        if (e.expire && now > e.expire) { positionals.splice(i, 1); try { e.g.disconnect(); } catch (_) {} continue; }
        updateOne(e, false);
      }
    },
  };
  function updateOne(e, immediate) {
    const cam = getCamera && getCamera(); if (!cam) return;
    if (e.obj.isVector3) tmpV.copy(e.obj); else if (e.obj.getWorldPosition) e.obj.getWorldPosition(tmpV); else return;
    cam.getWorldPosition(tmpC);
    const d = tmpV.distanceTo(tmpC);
    const gain = 1 / (1 + 0.22 * d * d);
    tmpR.set(1, 0, 0).applyQuaternion(cam.quaternion);
    tmpV.sub(tmpC); const len = tmpV.length() || 1;
    const pan = Math.max(-1, Math.min(1, (tmpV.dot(tmpR) / len) * 0.85));
    try {
      if (immediate) { e.g.gain.value = gain; if (e.p) e.p.pan.value = pan; }
      else { e.g.gain.setTargetAtTime(gain, ac.currentTime, 0.08); if (e.p) e.p.pan.setTargetAtTime(pan, ac.currentTime, 0.08); }
    } catch (_) {}
  }
  return api;
}

// Rising synth "scanner" sweep.
export function scanSound(audio, dur = 2.5) {
  const c = audio.ctx; if (!c) return;
  try {
    const t = c.currentTime;
    const out = c.createGain(); out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(0.11, t + 0.2); out.gain.setValueAtTime(0.11, t + dur - 0.5);
    out.gain.linearRampToValueAtTime(0, t + dur + 0.3);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 6;
    lp.frequency.setValueAtTime(300, t); lp.frequency.exponentialRampToValueAtTime(5200, t + dur);
    lp.connect(out); out.connect(audio.master);
    const mk = (type, f0, f1, det, g) => {
      const o = c.createOscillator(); o.type = type; o.detune.value = det;
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const gg = c.createGain(); gg.gain.value = g; o.connect(gg); gg.connect(lp);
      o.start(t); o.stop(t + dur + 0.4);
    };
    mk('sawtooth', 110, 440, -7, 0.5); mk('sawtooth', 110, 440, 7, 0.5); mk('sine', 220, 1320, 0, 0.6);
    // LFO shimmer
    const lfo = c.createOscillator(); lfo.frequency.value = 9; const lg = c.createGain(); lg.gain.value = 0.035;
    lfo.connect(lg); lg.connect(out.gain); lfo.start(t); lfo.stop(t + dur + 0.4);
    audio.noise(dur, { type: 'white', filter: 'highpass', freq: 6000, gain: 0.025, attack: 0.3, release: 0.6 });
    setTimeout(() => { audio.tone(1760, 0.5, { type: 'sine', gain: 0.06 }); audio.tone(2637, 0.6, { type: 'sine', gain: 0.03 }); }, dur * 1000);
  } catch (_) {}
}

/* ------------------------------------------------------------------ particles */
export function createParticles(scene, floorAt, probeDown) {
  const UP = new THREE.Vector3(0, 1, 0);
  const dropGeo = new THREE.SphereGeometry(1, 6, 4);
  const dropMat = new THREE.MeshStandardMaterial({
    color: 0xd8ecff, roughness: 0.06, metalness: 0.0, transparent: true, opacity: 0.62, depthWrite: false, emissive: 0x18283a,
  });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), v = new THREE.Vector3();
  const emitters = new Set();

  const SPMAX = 700;
  const sp = { mesh: new THREE.InstancedMesh(dropGeo, dropMat, SPMAX), pos: new Float32Array(SPMAX * 3), vel: new Float32Array(SPMAX * 3), life: new Float32Array(SPMAX), fl: new Float32Array(SPMAX), n: 0 };
  sp.mesh.count = 0; sp.mesh.frustumCulled = false; sp.mesh.visible = false; sp.mesh.name = 'core_splash';
  sp.mesh.userData.floor = 'main';
  sp.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(sp.mesh);

  function splash(pos, o = {}) {
    if (!pos) return;
    const count = o.count != null ? o.count : 18, spd = o.speed != null ? o.speed : 0.9;
    for (let i = 0; i < count && sp.n < SPMAX; i++) {
      const k = sp.n++;
      sp.pos[k * 3] = pos.x; sp.pos[k * 3 + 1] = pos.y + 0.004; sp.pos[k * 3 + 2] = pos.z;
      const a = Math.random() * Math.PI * 2, h = (0.3 + Math.random() * 0.7) * spd;
      sp.vel[k * 3] = Math.cos(a) * h * 0.6; sp.vel[k * 3 + 1] = (0.4 + Math.random() * 0.9) * spd; sp.vel[k * 3 + 2] = Math.sin(a) * h * 0.6;
      sp.life[k] = 0.35 + Math.random() * 0.35; sp.fl[k] = pos.y;
    }
  }

  // water(origin, dir, {rate, spread, floorY, speed, max, size}) → {on, setOrigin, setDir, dispose, mesh, opts}
  function water(origin, dir, o = {}) {
    const max = Math.max(16, Math.min(1500, o.max || 500));
    const mesh = new THREE.InstancedMesh(dropGeo, dropMat, max);
    mesh.count = 0; mesh.frustumCulled = false; mesh.visible = false; mesh.name = 'core_water';
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const org = origin ? origin.clone() : new THREE.Vector3();
    const d = (dir ? dir.clone() : new THREE.Vector3(0, -1, 0)); if (d.lengthSq() < 1e-8) d.set(0, -1, 0); d.normalize();
    try { mesh.userData.floor = floorAt ? floorAt(org.x, org.y - 1.0, org.z) : 'main'; } catch (_) { mesh.userData.floor = 'main'; }
    scene.add(mesh);
    const E = {
      mesh, org, d, max, n: 0, acc: 0,
      pos: new Float32Array(max * 3), vel: new Float32Array(max * 3),
      opts: { rate: o.rate != null ? o.rate : 220, spread: o.spread != null ? o.spread : 0.08, speed: o.speed != null ? o.speed : 1.2, floorY: o.floorY, size: o.size || 1, splash: o.splash !== false },
      on: o.on !== false,
    };
    const handle = {
      get on() { return E.on; }, set on(val) { E.on = !!val; },
      mesh, opts: E.opts,
      setOrigin(vv) { if (vv) E.org.copy(vv); },
      setDir(vv) { if (vv && vv.lengthSq() > 1e-8) E.d.copy(vv).normalize(); },
      dispose() { emitters.delete(E); if (mesh.parent) mesh.parent.remove(mesh); mesh.dispose && mesh.dispose(); },
    };
    if (E.opts.floorY == null || !isFinite(E.opts.floorY)) {
      let y = null;
      try { y = probeDown ? probeDown(org) : null; } catch (_) { y = null; }
      E.opts.floorY = y != null ? y + 0.004 : org.y - 1.5;
    }
    E.handle = handle;
    emitters.add(E);
    return handle;
  }

  function writeDrop(mesh, i, px, py, pz, vx, vy, vz, r, lenMul) {
    p.set(px, py, pz); v.set(vx, vy, vz);
    const sp2 = v.length();
    if (sp2 > 1e-5) q.setFromUnitVectors(UP, v.multiplyScalar(1 / sp2)); else q.identity();
    s.set(r, Math.max(r * 1.4, Math.min(0.04, sp2 * 0.016)) * lenMul, r);
    m4.compose(p, q, s);
    mesh.setMatrixAt(i, m4);
  }

  function update(dt) {
    if (dt <= 0) return;
    const G = 9.81;
    let splashBudget = 6;
    for (const E of emitters) {
      const o = E.opts;
      if (E.on) {
        E.acc += o.rate * dt;
        while (E.acc >= 1 && E.n < E.max) {
          E.acc -= 1;
          const k = E.n++;
          E.pos[k * 3] = E.org.x + (Math.random() - 0.5) * 0.012;
          E.pos[k * 3 + 1] = E.org.y;
          E.pos[k * 3 + 2] = E.org.z + (Math.random() - 0.5) * 0.012;
          const spd = o.speed * (0.85 + Math.random() * 0.3);
          E.vel[k * 3] = (E.d.x + (Math.random() - 0.5) * 2 * o.spread) * spd;
          E.vel[k * 3 + 1] = (E.d.y + (Math.random() - 0.5) * 2 * o.spread) * spd;
          E.vel[k * 3 + 2] = (E.d.z + (Math.random() - 0.5) * 2 * o.spread) * spd;
          // pre-advance so a burst doesn't clump at the nozzle
          const pre = Math.random() * dt;
          E.pos[k * 3] += E.vel[k * 3] * pre; E.pos[k * 3 + 1] += E.vel[k * 3 + 1] * pre; E.pos[k * 3 + 2] += E.vel[k * 3 + 2] * pre;
        }
        if (E.acc > 1) E.acc = 1;
      } else E.acc = 0;
      for (let k = 0; k < E.n; k++) {
        const i3 = k * 3;
        E.vel[i3 + 1] -= G * dt;
        E.pos[i3] += E.vel[i3] * dt; E.pos[i3 + 1] += E.vel[i3 + 1] * dt; E.pos[i3 + 2] += E.vel[i3 + 2] * dt;
        if (E.pos[i3 + 1] < o.floorY) {
          if (o.splash && splashBudget > 0 && Math.random() < 0.12) {
            splashBudget--; p.set(E.pos[i3], o.floorY, E.pos[i3 + 2]); splash(p, { count: 3, speed: 0.6 });
          }
          const last = --E.n; // swap-remove
          if (k !== last) {
            E.pos[i3] = E.pos[last * 3]; E.pos[i3 + 1] = E.pos[last * 3 + 1]; E.pos[i3 + 2] = E.pos[last * 3 + 2];
            E.vel[i3] = E.vel[last * 3]; E.vel[i3 + 1] = E.vel[last * 3 + 1]; E.vel[i3 + 2] = E.vel[last * 3 + 2];
          }
          k--;
        }
      }
      for (let k = 0; k < E.n; k++) {
        const i3 = k * 3;
        writeDrop(E.mesh, k, E.pos[i3], E.pos[i3 + 1], E.pos[i3 + 2], E.vel[i3], E.vel[i3 + 1], E.vel[i3 + 2], 0.0032 * o.size, 1);
      }
      E.mesh.count = E.n; E.mesh.visible = E.n > 0;
      if (E.n > 0) E.mesh.instanceMatrix.needsUpdate = true;
    }
    // splashes
    for (let k = 0; k < sp.n; k++) {
      const i3 = k * 3;
      sp.life[k] -= dt;
      sp.vel[i3 + 1] -= G * dt;
      sp.pos[i3] += sp.vel[i3] * dt; sp.pos[i3 + 1] += sp.vel[i3 + 1] * dt; sp.pos[i3 + 2] += sp.vel[i3 + 2] * dt;
      if (sp.life[k] <= 0 || sp.pos[i3 + 1] < sp.fl[k] - 0.003) {
        const last = --sp.n;
        if (k !== last) {
          sp.pos[i3] = sp.pos[last * 3]; sp.pos[i3 + 1] = sp.pos[last * 3 + 1]; sp.pos[i3 + 2] = sp.pos[last * 3 + 2];
          sp.vel[i3] = sp.vel[last * 3]; sp.vel[i3 + 1] = sp.vel[last * 3 + 1]; sp.vel[i3 + 2] = sp.vel[last * 3 + 2];
          sp.life[k] = sp.life[last]; sp.fl[k] = sp.fl[last];
        }
        k--;
      }
    }
    for (let k = 0; k < sp.n; k++) {
      const i3 = k * 3;
      writeDrop(sp.mesh, k, sp.pos[i3], sp.pos[i3 + 1], sp.pos[i3 + 2], sp.vel[i3], sp.vel[i3 + 1], sp.vel[i3 + 2], 0.0026, 0.7);
    }
    sp.mesh.count = sp.n; sp.mesh.visible = sp.n > 0;
    if (sp.n > 0) sp.mesh.instanceMatrix.needsUpdate = true;
  }
  return { water, splash, update };
}

/* ------------------------------------------------------------------ scanner sweep (Matterport-like) */
export function createScanner(scene, plan) {
  const cx = plan.W / 2, cz = (plan.porch ? plan.porch.z1 : plan.D) / 2;
  const halfX = plan.W / 2 + 1.6, halfZ = cz + 1.4;
  const yFrom = plan.basementFloor - 0.15;
  const yTo = (plan.roofOuterY ? plan.roofOuterY(plan.ridgeZ) : 6.5) + 0.5;

  const planeMat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0x38e8ff) },
      uOpacity: { value: 0 },
      uCenter: { value: new THREE.Vector2(cx, cz) },
      uHalf: { value: new THREE.Vector2(halfX, halfZ) },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */`
      varying vec3 vW;
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uOpacity; uniform vec2 uCenter; uniform vec2 uHalf; uniform float uTime;
      varying vec3 vW;
      float gridLine(vec2 p){
        vec2 g = abs(fract(p - 0.5) - 0.5) / max(fwidth(p), vec2(1e-4));
        return 1.0 - min(min(g.x, g.y), 1.0);
      }
      void main(){
        float fine = gridLine(vW.xz * 5.0);
        float major = gridLine(vW.xz * 1.0);
        vec2 d = abs(vW.xz - uCenter) / uHalf;
        float m = max(d.x, d.y);
        float edge = 1.0 - smoothstep(0.78, 1.0, m);
        float rim = smoothstep(0.90, 0.985, m) * (1.0 - smoothstep(0.985, 1.0, m));
        float shimmer = 0.85 + 0.15 * sin(uTime * 12.0 + (vW.x + vW.z) * 3.0);
        float a = (0.07 + fine * 0.28 + major * 0.55) * edge * shimmer + rim * 0.6;
        gl_FragColor = vec4(uColor * (0.7 + fine * 0.6 + major), a * uOpacity);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  try { planeMat.extensions = { derivatives: true }; } catch (_) {}
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(halfX * 2, halfZ * 2), planeMat);
  plane.rotation.x = -Math.PI / 2;
  plane.position.set(cx, yFrom, cz);
  plane.visible = false; plane.renderOrder = 990; plane.frustumCulled = false;
  plane.userData.__core = true;
  scene.add(plane);

  // glow halo slab (soft band just below the grid plane)
  const haloMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0x2bd9ff) }, uOpacity: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv;
      void main(){ float a = pow(vUv.y, 2.5) * (1.0 - smoothstep(0.85,1.0,abs(vUv.x*2.0-1.0))); gl_FragColor = vec4(uColor, a * uOpacity * 0.35); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const halo = new THREE.Group(); halo.userData.__core = true; halo.visible = false;
  const hgH = 0.6;
  const mkWall = (w, rotY, x, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, hgH), haloMat);
    m.rotation.y = rotY; m.position.set(x, -hgH / 2, z); m.frustumCulled = false; m.renderOrder = 989; halo.add(m);
  };
  mkWall(halfX * 2, 0, cx, cz + halfZ); mkWall(halfX * 2, 0, cx, cz - halfZ);
  mkWall(halfZ * 2, Math.PI / 2, cx + halfX, cz); mkWall(halfZ * 2, Math.PI / 2, cx - halfX, cz);
  scene.add(halo);

  // point cloud sparkle
  let points = null;
  const ptsMat = new THREE.ShaderMaterial({
    uniforms: { uScanY: { value: -99 }, uOpacity: { value: 0 }, uSize: { value: 55 }, uMax: { value: 9 }, uTime: { value: 0 }, uColor: { value: new THREE.Color(0x7ff4ff) } },
    vertexShader: /* glsl */`
      uniform float uScanY; uniform float uSize; uniform float uMax; uniform float uTime;
      attribute float aRand;
      varying float vA;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float pass = uScanY - position.y;
        float a = pass > 0.0 ? exp(-pass * 1.8) : 0.0;
        a *= 0.55 + 0.45 * sin(uTime * 18.0 + aRand * 60.0);
        vA = a;
        gl_PointSize = clamp(uSize * (0.5 + aRand) / max(0.5, -mv.z), 1.0, uMax);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uOpacity; varying float vA;
      void main(){
        vec2 c = gl_PointCoord - 0.5; float d = length(c);
        if (d > 0.5) discard;
        float a = vA * uOpacity * (1.0 - d * 2.0);
        if (a < 0.003) discard;
        gl_FragColor = vec4(uColor, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });

  function prepare(count = 12000) {
    try {
      const region = new THREE.Box3(new THREE.Vector3(-1.2, yFrom - 0.1, -1.2), new THREE.Vector3(plan.W + 1.2, yTo, (plan.porch ? plan.porch.z1 : plan.D) + 0.6));
      const cands = []; let total = 0;
      const bb = new THREE.Box3(), sz = new THREE.Vector3();
      scene.traverse((o) => {
        if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !o.visible || o.userData.__core) return;
        const g = o.geometry; if (!g || !g.attributes || !g.attributes.position) return;
        if (!g.boundingBox) g.computeBoundingBox();
        if (!g.boundingBox) return;
        o.updateWorldMatrix(true, false);
        bb.copy(g.boundingBox).applyMatrix4(o.matrixWorld);
        if (!bb.intersectsBox(region)) return;
        bb.intersect(region); bb.getSize(sz);
        const area = Math.min(60, 2 * (sz.x * sz.y + sz.y * sz.z + sz.x * sz.z) + 0.02);
        cands.push({ o, area }); total += area;
      });
      if (!cands.length) return;
      const pos = new Float32Array(count * 3), rnd = new Float32Array(count);
      const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), w = new THREE.Vector3();
      let n = 0;
      for (const cd of cands) {
        const want = Math.round((count * cd.area) / total);
        const g = cd.o.geometry, P = g.attributes.position, I = g.index;
        const tris = Math.floor((I ? I.count : P.count) / 3);
        if (tris < 1) continue;
        for (let k = 0; k < want && n < count; k++) {
          const t = Math.floor(Math.random() * tris);
          const i0 = I ? I.getX(t * 3) : t * 3, i1 = I ? I.getX(t * 3 + 1) : t * 3 + 1, i2 = I ? I.getX(t * 3 + 2) : t * 3 + 2;
          a.fromBufferAttribute(P, i0); b.fromBufferAttribute(P, i1); c.fromBufferAttribute(P, i2);
          let u = Math.random(), v = Math.random(); if (u + v > 1) { u = 1 - u; v = 1 - v; }
          w.copy(a).multiplyScalar(1 - u - v).addScaledVector(b, u).addScaledVector(c, v).applyMatrix4(cd.o.matrixWorld);
          if (!region.containsPoint(w)) continue;
          pos[n * 3] = w.x; pos[n * 3 + 1] = w.y; pos[n * 3 + 2] = w.z; rnd[n] = Math.random(); n++;
        }
      }
      if (n < 10) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, n * 3), 3));
      geo.setAttribute('aRand', new THREE.BufferAttribute(rnd.subarray(0, n), 1));
      if (points) { scene.remove(points); points.geometry.dispose(); }
      points = new THREE.Points(geo, ptsMat);
      points.frustumCulled = false; points.visible = false; points.renderOrder = 991; points.userData.__core = true;
      scene.add(points);
    } catch (e) { console.warn('scanner prepare failed', e); }
  }

  let run = null;
  function scan(dur = 2.5) {
    if (run) run.resolve();
    return new Promise((resolve) => { run = { t: 0, dur, resolve, fadeT: 0 }; plane.visible = true; halo.visible = true; if (points) points.visible = true; });
  }
  let time = 0;
  function update(dt, pixelRatio) {
    time += dt;
    planeMat.uniforms.uTime.value = time; ptsMat.uniforms.uTime.value = time;
    ptsMat.uniforms.uSize.value = 55 * (pixelRatio || 1); ptsMat.uniforms.uMax.value = 9 * (pixelRatio || 1);
    if (!run) return;
    run.t += dt;
    const k = Math.min(1, run.t / run.dur);
    const e = easings.inOutSine(k);
    const y = yFrom + (yTo - yFrom) * e;
    plane.position.y = y; halo.position.y = y;
    const op = Math.min(1, run.t / 0.25) * (k < 1 ? 1 : 0);
    planeMat.uniforms.uOpacity.value = op * (1 - Math.max(0, (k - 0.9) / 0.1));
    haloMat.uniforms.uOpacity.value = planeMat.uniforms.uOpacity.value;
    ptsMat.uniforms.uScanY.value = y;
    if (k < 1) ptsMat.uniforms.uOpacity.value = Math.min(1, run.t / 0.3);
    else {
      run.fadeT += dt;
      ptsMat.uniforms.uOpacity.value = Math.max(0, 1 - run.fadeT / 1.2);
      plane.visible = false; halo.visible = false;
      if (run.fadeT >= 1.2) { if (points) points.visible = false; const r = run; run = null; r.resolve(); }
    }
  }
  return { prepare, scan, update, get active() { return !!run; } };
}

/* ------------------------------------------------------------------ measure tool */
export function createMeasure(scene, layer) {
  const group = new THREE.Group(); group.userData.__core = true; group.renderOrder = 995; scene.add(group);
  const mat = new THREE.MeshBasicMaterial({ color: 0x3fe6ff, depthTest: false, transparent: true, opacity: 0.95, toneMapped: false });
  const lineMat = new THREE.LineBasicMaterial({ color: 0x3fe6ff, depthTest: false, transparent: true, opacity: 0.9, toneMapped: false });
  const sph = new THREE.SphereGeometry(0.035, 16, 10);
  const tube = new THREE.CylinderGeometry(0.008, 0.008, 1, 8, 1);
  const segs = [];
  let pending = null;
  const UP = new THREE.Vector3(0, 1, 0);

  function fmt(m) {
    const totalIn = m / 0.0254;
    let ft = Math.floor(totalIn / 12), inch = Math.round(totalIn - ft * 12);
    if (inch === 12) { ft++; inch = 0; }
    return `${m.toFixed(2)} מ׳ · ${ft}′ ${inch}″`;
  }
  function marker(p) {
    const m = new THREE.Mesh(sph, mat); m.position.copy(p); m.renderOrder = 996; m.frustumCulled = false; group.add(m); return m;
  }
  function addPoint(p) {
    if (!p) return;
    if (!pending) { pending = { p: p.clone(), m: marker(p) }; return 1; }
    const a = pending.p, b = p.clone();
    const mb = marker(b);
    const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
    const line = new THREE.Line(geo, lineMat); line.renderOrder = 996; line.frustumCulled = false; group.add(line);
    const len = a.distanceTo(b);
    const t = new THREE.Mesh(tube, mat); t.renderOrder = 996; t.frustumCulled = false;
    t.position.copy(a).add(b).multiplyScalar(0.5);
    t.scale.set(1, Math.max(0.001, len), 1);
    if (len > 1e-6) t.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
    group.add(t);
    const el = document.createElement('div'); el.className = 'mlabel'; el.textContent = fmt(len);
    layer && layer.appendChild(el);
    segs.push({ a, b, objs: [pending.m, mb, line, t], el, mid: t.position.clone() });
    pending = null;
    return 2;
  }
  function clear() {
    for (const s of segs) { for (const o of s.objs) { group.remove(o); if (o.isLine) o.geometry.dispose(); } s.el.remove(); }
    segs.length = 0;
    if (pending) { group.remove(pending.m); pending = null; }
  }
  const v = new THREE.Vector3();
  function update(camera, w, h) {
    for (const s of segs) {
      v.copy(s.mid).project(camera);
      if (v.z > 1 || v.z < -1) { s.el.style.display = 'none'; continue; }
      s.el.style.display = '';
      s.el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -140%)`;
    }
  }
  return { addPoint, clear, update, setVisible(on) { group.visible = on; for (const s of segs) s.el.style.visibility = on ? '' : 'hidden'; }, get count() { return segs.length; }, get pending() { return !!pending; } };
}
