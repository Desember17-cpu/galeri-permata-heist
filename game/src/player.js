// player.js — pencuri: gerak WASD, menyelinap (Shift), interaksi (E),
// lempar pengalih (Q, terbatas). Tabrakan lingkaran-vs-dinding dijaga level.js.
import { PLAYER, TOOLS } from './config.js';
import { crossesActiveLaser, resolveCircle } from './level.js';
import { ALARM } from './config.js';

export class Player {
  constructor() {
    this.reset();
  }

  reset() {
    this.x = PLAYER.start.x;
    this.z = PLAYER.start.z;
    this.angle = -Math.PI / 2; // menghadap utara (ke dalam galeri)
    this.sneaking = false;
    this.moving = false;
    this.decoys = TOOLS.decoys;
    this.decoyActive = null; // {x, z, timeLeft} pengalih yang sedang aktif
    this.stepPhase = 0;
    this.stepAlt = false;
    this.invulnerable = 0; // detik kebal setelah ketahuan
  }

  /**
   * Gerakkan pemain satu langkah dt. `move` = {x, z} ternormalisasi.
   * Mengembalikan event: 'laser' bila memotong laser aktif.
   */
  step(dt, move, sneaking, time) {
    this.sneaking = sneaking;
    const speed = sneaking ? PLAYER.sneakSpeed : PLAYER.speed;
    const mx = move.x;
    const mz = move.z;
    this.moving = mx !== 0 || mz !== 0;
    if (this.moving) {
      this.angle = Math.atan2(mz, mx);
      const nx = this.x + mx * speed * dt;
      const nz = this.z + mz * speed * dt;
      const [rx, rz] = resolveCircle(nx, nz, PLAYER.radius);
      // Memotong laser aktif?
      if (this.invulnerable <= 0 && crossesActiveLaser(this.x, this.z, rx, rz, time)) {
        const [fx, fz] = [rx, rz];
        this.x = fx;
        this.z = fz;
        return 'laser';
      }
      this.x = rx;
      this.z = rz;
      this.stepPhase += dt * (sneaking ? 5 : 9);
      if (this.stepPhase > Math.PI) {
        this.stepPhase -= Math.PI;
        this.stepAlt = !this.stepAlt;
        return 'step';
      }
    }
    if (this.invulnerable > 0) this.invulnerable -= dt;
    if (this.decoyActive) {
      this.decoyActive.timeLeft -= dt;
      if (this.decoyActive.timeLeft <= 0) this.decoyActive = null;
    }
    return null;
  }

  /** Lempar pengalih ke depan pemain. Mengembalikan titik lempar atau null. */
  throwDecoy() {
    if (this.decoys <= 0) return null;
    this.decoys -= 1;
    const tx = this.x + Math.cos(this.angle) * TOOLS.decoyRange;
    const tz = this.z + Math.sin(this.angle) * TOOLS.decoyRange;
    const [rx, rz] = resolveCircle(tx, tz, 0.3);
    this.decoyActive = { x: rx, z: rz, timeLeft: TOOLS.decoyLureTime };
    return { x: rx, z: rz };
  }
}
