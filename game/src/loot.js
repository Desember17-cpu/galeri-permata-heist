// loot.js — tiga permata di atas podium + zona EXIT.
// Permata diambil dengan E saat cukup dekat; podium berpendar sampai diambil.
import { EXIT, LOOT } from './config.js';

export const PICKUP_RADIUS = 1.4;

export class Loot {
  constructor() {
    this.reset();
  }

  reset() {
    this.items = LOOT.map((def) => ({
      id: def.id,
      name: def.name,
      x: def.x,
      z: def.z,
      color: def.color,
      glow: def.glow,
      taken: false,
      spin: 0,
    }));
    this.takenCount = 0;
  }

  /** Permata terdekat yang masih ada dalam jangkauan ambil, atau null. */
  nearestInReach(px, pz) {
    let best = null;
    let bestD = PICKUP_RADIUS;
    for (const item of this.items) {
      if (item.taken) continue;
      const d = Math.hypot(item.x - px, item.z - pz);
      if (d < bestD) {
        bestD = d;
        best = item;
      }
    }
    return best;
  }

  /** Ambil permata `item`. Mengembalikan true bila berhasil. */
  take(item) {
    if (!item || item.taken) return false;
    item.taken = true;
    this.takenCount += 1;
    return true;
  }

  get allTaken() {
    return this.takenCount >= this.items.length;
  }

  /** Apakah pemain berada di zona EXIT. */
  atExit(px, pz) {
    return Math.hypot(px - EXIT.x, pz - EXIT.z) < EXIT.radius;
  }
}
