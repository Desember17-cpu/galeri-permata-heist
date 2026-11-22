// shots.js — adegan ?shot=start|play|climax|end.
// Setiap adegan memainkan aturan asli dari state segar dengan autopilot
// (A* di grid + baca kerucut/laser), seed tetap sehingga frame deterministik.
// 'climax' membeku saat alarm tinggi + kurator mengejar: frame klimaks mid-heist.
// 'end' memainkan sampai WIN/LOSE murni — grade + statistik asli, tanpa dipaksa.
import { STEP } from './config.js';
import { EVENT_OVER, SCREEN_PLAY, SCREEN_TITLE } from './world.js';
import { pointBlocked } from './level.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 16;
const CLIMAX_MIN_SECONDS = 8;
const CLIMAX_MAX_SECONDS = 60;
const END_LIMIT_SECONDS = 600;
const REPLAN_SECONDS = 0.35;
const CELL = 1.0;
const GRID_X0 = -17;
const GRID_Z0 = -12;
const GRID_W = 35;
const GRID_H = 25;

function cellCenter(ix, iz) {
  return { x: GRID_X0 + ix * CELL + CELL / 2, z: GRID_Z0 + iz * CELL + CELL / 2 };
}

function toCell(x, z) {
  return {
    ix: Math.max(0, Math.min(GRID_W - 1, Math.floor((x - GRID_X0) / CELL))),
    iz: Math.max(0, Math.min(GRID_H - 1, Math.floor((z - GRID_Z0) / CELL))),
  };
}

function walkable(ix, iz) {
  const c = cellCenter(ix, iz);
  return !pointBlocked(c.x, c.z, 0.55);
}

/**
 * A* 8-arah dari (sx,sz) ke (tx,tz). Biaya sel = 1 (+0.41 diagonal) +
 * penalti bahaya dari world.dangerAt (kerucut/laser) — autopilot memilih
 * rute yang menghindari pandangan, bukan menembusnya. Pilot `bold` (berani)
 * hampir mengabaikan kerucut: ia menerobos seperti pemain yang terburu-buru.
 * Mengembalikan daftar titik [x, z] atau null.
 */
function findPath(world, sx, sz, tx, tz, time, bold) {
  const start = toCell(sx, sz);
  const goal = toCell(tx, tz);
  const key = (ix, iz) => iz * GRID_W + ix;
  const open = [{ ix: start.ix, iz: start.iz, g: 0, f: 0, parent: null }];
  const best = new Map();
  best.set(key(start.ix, start.iz), 0);
  const closed = new Set();
  const h = (ix, iz) => Math.hypot(ix - goal.ix, iz - goal.iz);
  let goalNode = null;
  while (open.length > 0) {
    let bi = 0;
    for (let i = 1; i < open.length; i += 1) {
      if (open[i].f < open[bi].f) bi = i;
    }
    const cur = open.splice(bi, 1)[0];
    const ck = key(cur.ix, cur.iz);
    if (closed.has(ck)) continue;
    closed.add(ck);
    if (cur.ix === goal.ix && cur.iz === goal.iz) {
      goalNode = cur;
      break;
    }
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dz === 0) continue;
        const nx = cur.ix + dx;
        const nz = cur.iz + dz;
        if (nx < 0 || nz < 0 || nx >= GRID_W || nz >= GRID_H) continue;
        if (!walkable(nx, nz)) continue;
        if (dx !== 0 && dz !== 0 && (!walkable(cur.ix + dx, cur.iz) || !walkable(cur.ix, cur.iz + dz))) continue;
        const nk = key(nx, nz);
        if (closed.has(nk)) continue;
        const c = cellCenter(nx, nz);
        const danger = world.dangerAt(c.x, c.z, time);
        const stepCost = (dx !== 0 && dz !== 0 ? 1.41 : 1) +
          (danger === 2 ? (bold ? 5 : 100) : danger === 1 ? (bold ? 0 : 45) : 0);
        const g = cur.g + stepCost;
        if (best.has(nk) && best.get(nk) <= g) continue;
        best.set(nk, g);
        open.push({ ix: nx, iz: nz, g, f: g + h(nx, nz), parent: cur });
      }
    }
  }
  if (!goalNode) return null;
  const path = [];
  let node = goalNode;
  while (node) {
    const c = cellCenter(node.ix, node.iz);
    path.unshift([c.x, c.z]);
    node = node.parent;
  }
  return path;
}

class Autopilot {
  constructor(world, bold = false) {
    this.world = world;
    this.bold = bold; // true = menerobos kerucut seperti pemain terburu-buru
    this.path = null;
    this.pathIndex = 0;
    this.replanIn = 0;
    this.target = null; // {x, z, kind}
  }

  currentTarget() {
    const w = this.world;
    if (!w.loot.allTaken) {
      let best = null;
      let bestD = Infinity;
      for (const item of w.loot.items) {
        if (item.taken) continue;
        const d = Math.hypot(item.x - w.player.x, item.z - w.player.z);
        if (d < bestD) {
          bestD = d;
          best = item;
        }
      }
      return { x: best.x, z: best.z, kind: 'loot', item: best };
    }
    return { x: 15.5, z: -10.5, kind: 'exit' };
  }

  /** Input untuk satu langkah: gerak + interaksi bila di dekat permata. */
  input(dt) {
    const w = this.world;
    const p = w.player;
    this.replanIn -= dt;
    const target = this.currentTarget();
    const targetChanged = !this.target || this.target.kind !== target.kind ||
      (target.item && this.target.item !== target.item);
    if (targetChanged || this.replanIn <= 0 || !this.path) {
      this.target = target;
      this.path = findPath(w, p.x, p.z, target.x, target.z, w.time, this.bold);
      this.pathIndex = 0;
      this.replanIn = REPLAN_SECONDS;
    }
    const interact = !!w.loot.nearestInReach(p.x, p.z);
    if (!this.path || this.pathIndex >= this.path.length) {
      return { move: { x: 0, z: 0 }, sneak: false, interact, decoy: false };
    }
    // Lewati waypoint yang sudah tercapai.
    while (this.pathIndex < this.path.length) {
      const wp = this.path[this.pathIndex];
      if (Math.hypot(wp[0] - p.x, wp[1] - p.z) < 0.4) this.pathIndex += 1;
      else break;
    }
    if (this.pathIndex >= this.path.length) {
      return { move: { x: 0, z: 0 }, sneak: false, interact, decoy: false };
    }
    const wp = this.path[this.pathIndex];
    const hereDanger = w.dangerAt(p.x, p.z, w.time);
    const nextDanger = w.dangerAt(wp[0], wp[1], w.time);
    // Pilot hati-hati menunggu di tempat aman bila langkah berikut masuk
    // kerucut/laser; pilot berani menerobos tanpa menunggu.
    if (!this.bold && hereDanger === 0 && nextDanger > 0) {
      return { move: { x: 0, z: 0 }, sneak: true, interact, decoy: false };
    }
    const dx = wp[0] - p.x;
    const dz = wp[1] - p.z;
    const d = Math.hypot(dx, dz) || 1;
    return { move: { x: dx / d, z: dz / d }, sneak: false, interact, decoy: false };
  }
}

function runAutopilot(world, seconds) {
  const pilot = new Autopilot(world);
  let over = false;
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    if (world.step(STEP, pilot.input(STEP)) & EVENT_OVER) {
      over = true;
      break;
    }
  }
  return over;
}

/**
 * Siapkan dunia untuk ?shot=... dan kembalikan layar yang harus digambar.
 * 'play': beku setelah permata pertama didapat (mid-game, masih bermain).
 * 'climax': pilot BERANI menerobos kerucut; beku saat alarm >= 50, kurator
 *   mengejar, atau strike — klimaks mid-heist yang sesungguhnya.
 * 'end': pilot hati-hati memainkan sampai WIN/LOSE murni.
 */
export function stageShot(name, world) {
  world.reset();
  if (name === 'play') {
    world.startGame();
    const pilot = new Autopilot(world, false);
    const steps = Math.floor(PLAY_SECONDS / STEP);
    for (let i = 0; i < steps; i += 1) {
      if (world.step(STEP, pilot.input(STEP)) & EVENT_OVER) break;
      if (world.loot.takenCount >= 1 && world.time >= 8) break;
    }
    return { screen: world.screen, autopilot: null };
  }
  if (name === 'climax') {
    world.startGame();
    const pilot = new Autopilot(world, true);
    let frozen = null;
    const steps = Math.floor(CLIMAX_MAX_SECONDS / STEP);
    for (let i = 0; i < steps; i += 1) {
      if (world.step(STEP, pilot.input(STEP)) & EVENT_OVER) {
        frozen = { reason: 'over', time: world.time };
        break;
      }
      const alertNow = world.guards.some((g) => g.state === 'alert');
      if (world.time >= CLIMAX_MIN_SECONDS &&
          (world.alarm >= 50 || alertNow || world.strikes > 0)) {
        frozen = { reason: alertNow ? 'alert' : world.strikes > 0 ? 'strike' : 'alarm', time: world.time, alarm: world.alarm };
        break;
      }
      // Cadangan: bila pilot berani tetap lolos tanpa ketahuan, beku saat
      // permata kedua didapat — masih mid-heist, bukan layar akhir.
      if (world.loot.takenCount >= 2 && world.time >= 12) {
        frozen = { reason: 'loot2', time: world.time, alarm: world.alarm };
        break;
      }
    }
    if (!frozen) frozen = { reason: 'timeout', time: world.time, alarm: world.alarm };
    return { screen: SCREEN_PLAY, autopilot: null, climax: frozen };
  }
  if (name === 'end') {
    world.startGame();
    const over = runAutopilot(world, END_LIMIT_SECONDS);
    const result = {
      screen: world.screen,
      grade: world.grade,
      time: world.time,
      strikes: world.strikes,
      loot: world.loot.takenCount,
      timesSeen: world.timesSeen,
      laserTrips: world.laserTrips,
      over,
    };
    return { screen: world.screen, autopilot: null, end: result };
  }
  // start (default): dunia hidup 5 detik di balik layar judul.
  for (let i = 0; i < START_SECONDS / STEP; i += 1) world.stepAmbient(STEP);
  return { screen: SCREEN_TITLE, autopilot: null };
}
