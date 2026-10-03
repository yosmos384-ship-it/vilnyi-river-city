// VILNYI Lifestyle yacht — where the party crowd stands, swims, lies and dances (yacht-local metres).
// mix: what the painter draws (yacht-crowd.js) — kind 'stand' | 'dance' | 'lounge' | 'swim', sex 'w' (default) | 'm', heels.
// A spec with `key` can be shown a second time, mirrored and far away, by a spec whose mix has `twin: key` (no atlas cost).
// Everyone keeps off the walking routes: the bar fronts, the lanes beside the pool, the doors, the middle of the dance floor.
const W = (kind, o) => ({ kind, ...o }), M = (kind, o) => ({ kind, sex: 'm', ...o });
const swim = (x, z, mix, o = {}) => ({ mix, x, z, anim: 'swim', water: 0.43, wl: 1.16, drift: [0.45, 0.3], ...o });
const spa = (x, z, mix, o = {}) => ({ mix, x, z, anim: 'swim', water: 0.46, wl: 1.24, drift: [0.05, 0.05], ...o });
const bed = (x, z, face, mix) => ({ mix, x, z, anim: 'sunbathe', bed: [x, z, face] });
const st = (x, z, mix, o = {}) => ({ mix, x, z, anim: 'chat', ...o });
const dn = (x, z, mix, o = {}) => ({ mix, x, z, anim: 'dance', floor: true, ...o });
const H = { heels: true };
export const CROWD = {
  sundeck: [
    // in the pool
    swim(-25.6, -1.1, W('swim')), swim(-24.3, 1.2, W('swim'), { wl: 1.06 }), swim(-22.7, -0.5, M('swim'), { wl: 1.2 }), swim(-21.4, 1.3, W('swim')), swim(-20.2, -1.3, W('swim'), { wl: 1.02 }),
    swim(-19.0, 0.5, W('swim'), { drift: [0.3, 0.3] }), swim(-23.4, 1.5, M('swim'), { wl: 1.24, drift: [0.3, 0.25] }),
    // in the whirlpool
    spa(-30.82, 0.54, W('swim')), spa(-32.41, 0.49, W('swim'), { wl: 1.2 }), spa(-31.89, -0.9, W('swim')),
    // on the sunbeds
    bed(-23.7, 5.6, 'nz', W('lounge')), bed(-19.1, 5.6, 'nz', W('lounge')), bed(-26, -5.6, 'pz', W('lounge')), bed(-21.4, -5.6, 'pz', M('lounge')), bed(-19.1, -5.6, 'pz', W('lounge')), bed(-34.2, 3.6, 'px', W('lounge')),
    // at the bar (the middle of the counter stays free)
    st(-9.6, -1.5, W('stand', { key: 'b1' }), { glass: true }), st(-8.75, -1.25, M('stand', { key: 'b2' }), { glass: true }), st(-5.6, -1.6, W('stand', { key: 'b3' }), { glass: true }),
    // by the forward end of the pool
    st(-16.0, -1.25, W('stand'), { glass: true }), st(-15.45, -0.2, W('stand')), st(-16.1, 0.9, M('stand'), { glass: true }),
    // forward on the port side, and aft by the whirlpool
    st(-11.6, -5.5, W('stand', { key: 'f1' })), st(-10.7, -6.1, W('stand'), { glass: true }),
    st(-28.5, -6.0, W('stand', { key: 'a1' }), { glass: true }), st(-29.4, -5.6, W('stand', { key: 'a2' })),
    // by the starboard lounge
    st(-12.4, 2.7, W('stand'), { glass: true }), st(-11.5, 2.25, W('stand')),
    // seen a second time, mirrored, at the other end of the deck
    st(-13.3, -2.0, W('stand', { twin: 'a1' })), st(-12.5, -2.65, W('stand', { twin: 'a2' }), { glass: true }),
    st(-29.0, 6.0, W('stand', { twin: 'b1' })), st(-29.9, 5.55, M('stand', { twin: 'b2' }), { glass: true }),
    st(-22.55, 5.25, W('stand', { twin: 'b3' })), st(-22.55, -5.25, W('stand', { twin: 'f1' }), { glass: true }),
  ],
  beach: [
    // dance floor: two rings round a free middle, lanes left open from the aft doors and from the bar
    dn(-46.7, 0.0, W('dance', H)), dn(-47.25, 1.29, W('dance', H)), dn(-49.63, 1.4, M('dance')), dn(-47.25, -1.29, W('dance', H)), dn(-48.55, -1.8, W('dance', H)), dn(-49.83, -1.22, W('dance', H)),
    dn(-45.9, 1.0, W('dance', H)), dn(-46.3, 2.4, W('dance')), dn(-47.45, 2.6, W('dance', H)), dn(-49.7, 2.6, W('dance', H)), dn(-50.9, 1.5, W('dance', H)),
    dn(-50.9, -1.4, W('dance', H)), dn(-50.0, -2.6, W('dance')), dn(-47.3, -2.6, M('dance')), dn(-45.9, -1.2, W('dance', H)), dn(-46.1, -2.4, W('dance', H)),
    // at the bar (ends), in front of the DJ, by the lounge, in front of the stage
    st(-51.2, 3.7, W('stand', H), { glass: true }), st(-50.45, 3.5, M('stand'), { glass: true }), st(-46.1, 3.6, W('stand', H), { glass: true }), st(-45.4, 3.85, W('stand', H), { glass: true }),
    dn(-49.6, -4.1, W('dance', H), { floor: false }), dn(-48.4, -4.25, M('dance'), { floor: false }), dn(-47.3, -4.1, W('dance', H), { floor: false }),
    st(-54.6, 2.5, W('stand', H), { glass: true }), st(-53.7, 2.9, W('stand', H)),
    dn(-41.4, 1.3, W('dance', H), { floor: false }), dn(-41.2, -1.0, M('dance'), { floor: false, glass: true }),
  ],
};
