// VILNYI Lifestyle casino — where everything stands: the room's outline, the tables and machines ("stations") with
// their frames, and the positions printed on the felts (shared by the room builder and the play code).
export const X0 = 20.22, X1 = 41.6, H = 2.7, TOP = 0.8;
export const hw = (x) => 7.55 - (x - 20.3) * 0.1197;                 // half-width of the room (straight walls inside the hull)
export const WALL_A = Math.atan(0.1197);

// ------------------------------------------------------------------ stations: where the visitor can sit down and play
// frame: O (origin on the table top), U (unit vector of the player's right), V (unit vector of +v), look (the player's
// forward). D tables: v runs from the dealer's edge (0) to the player's (1.25); roulette / craps: v runs away from the player.
const st = (id, game, ox, oz, look, o = {}) => {
  const f = look, r = [-f[1], f[0]], vdir = o.vTowardPlayer ? [-f[0], -f[1]] : f;
  return { id, game, O: [ox, oz], U: r, V: vdir, look: f, ...o,
    P(u, v) { return [ox + r[0] * u + vdir[0] * v, oz + r[1] * u + vdir[1] * v]; } };
};
export const STATIONS = [
  st('bj1', 'bj', 26.4, -5.85, [0, -1], { vTowardPlayer: true, dealer: 'barman' }),
  st('bj2', 'bj', 30.0, -5.45, [0, -1], { vTowardPlayer: true, dealer: 'barwoman' }),
  st('bj3', 'bj', 33.6, -5.0, [0, -1], { vTowardPlayer: true, dealer: 'barman' }),
  st('rl1', 'roulette', 25.3, 4.2, [1, 0], { dealer: 'barwoman' }),
  st('rl2', 'roulette', 30.3, 3.9, [1, 0], { dealer: 'barman' }),
  st('bac', 'baccarat', 36.2, -0.75, [0, 1], { vTowardPlayer: true, dealer: 'barwoman' }),
  st('hld', 'holdem', 36.2, 0.75, [0, -1], { vTowardPlayer: true, dealer: 'barman' }),
  st('crp', 'craps', 39.3, 0, [1, 0], { dealer: 'barman' }),
];
// machines stand along the forward part of the side walls, backs to the wall
for (let i = 0; i < 6; i++) { const x = 34.7 + i * 0.86, z = hw(x) - 0.42, n = [Math.sin(WALL_A), Math.cos(WALL_A)]; STATIONS.push({ ...st('slot' + (i + 1), 'slots', x, z, n), machine: true, yaw: Math.PI + WALL_A, taken: i === 1 }); }      // (a guest plays the second one)
for (let i = 0; i < 4; i++) { const x = 36.9 + i * 0.9, z = -(hw(x) - 0.4), n = [Math.sin(WALL_A), -Math.cos(WALL_A)]; STATIONS.push({ ...st('vp' + (i + 1), 'vpoker', x, z, n), machine: true, yaw: -WALL_A }); }
export const CASHIER = { x: 21.25, z: 5.0, counterX: 22.1, z0: 3.3, z1: 6.7 };
// D table outline in (u, v)
export const D_OUT = (() => { const p = [[-1.15, 0], [1.15, 0]]; for (let i = 0; i <= 28; i++) { const a = i / 28 * Math.PI; p.push([1.15 * Math.cos(a), 0.1 + 1.15 * Math.sin(a)]); } return p; })();
// blackjack: bet circles of the three boxes, (u, v)
export const BJ_BOX = [[-0.27, 0.93], [0, 0.99], [0.27, 0.93]];
export const BAC_AREA = { player: [-0.37, 0.76, -0.125, 1.0], tie: [-0.105, 0.82, 0.105, 1.06], banker: [0.125, 0.76, 0.37, 1.0] };
export const BAC = { handU: 0.21, handV: 0.44, s: 1.3 };
export const HLD = { ante: [-0.11, 0.99], call: [0.11, 0.99], boardV: 0.5, dealerV: 0.2, playerV: 0.79, s: 1.25 };
export const RL_TABLE = { u0: -0.62, u1: 0.62, v0: -0.06, v1: 2.72, wheel: [0, 2.16], wheelR: 0.4 };
export const CR_TABLE = { u0: -1.25, u1: 1.25, v0: -0.06, v1: 1.3 };
export const MACHINE = { slots: { w: 0.62, d: 0.6, h: 1.78, sy: 1.2, sw: 0.5, sh: 0.5 }, vpoker: { w: 0.62, d: 0.56, h: 1.6, sy: 1.14, sw: 0.5, sh: 0.4 } };

