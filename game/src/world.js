// world.js — inti permainan: status, alarm, strike, menang/kalah.
// Satu langkah (step) menjalankan aturan asli: gerak pemain, AI kurator,
// CCTV, drone, laser, lalu alarm. Tidak ada jalan pintas untuk autopilot:
// autopilot hanya menekan tombol yang sama seperti pemain.
import { ALARM, EXIT, LASER, LASERS, STEP, STRIKES_MAX } from './config.js';
import { createGuards } from './guards.js';
import { createCameras, Drone } from './cameras.js';
import { Player } from './player.js';
import { Loot } from './loot.js';
import { laserState, segmentBlocked } from './level.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_WIN = 'win';
export const SCREEN_LOSE = 'lose';

export const EVENT_OVER = 1;

export function gradeFor(time, strikes) {
  if (strikes === 0 && time <= 90) return 'S';
  if (strikes === 0) return 'A';
  if (strikes === 1) return 'B';
  return 'C';
}

export class World {
  constructor() {
    this.player = new Player();
    this.loot = new Loot();
    this.guards = createGuards();
    this.cameras = createCameras();
    this.drone = new Drone();
    this.reset();
  }

  reset() {
    this.time = 0;
    this.alarm = 0;
    this.strikes = 0;
    this.screen = SCREEN_TITLE;
    this.grade = null;
    this.timesSeen = 0;
    this.laserTrips = 0;
    this.banner = null; // {text, timeLeft}
    this.bannerQueue = [];
    this.player.reset();
    this.loot.reset();
    for (const g of this.guards) g.reset();
    for (const c of this.cameras) c.reset();
    this.drone.reset();
    // Hitung kerucut awal supaya frame pertama sudah benar.
    for (const g of this.guards) g.updateCone();
  }

  startGame() {
    this.reset();
    this.screen = SCREEN_PLAY;
  }

  /** Status penjaga terburuk untuk HUD: 'TERLIHAT!' / 'CURIGA...' / 'AMAN'. */
  get alertStatus() {
    if (this.guards.some((g) => g.state === 'alert')) return 'TERLIHAT!';
    if (this.guards.some((g) => g.state === 'suspicious' || g.state === 'search')) return 'CURIGA...';
    if (this.cameras.some((c) => c.suspicion > 0.5) || this.drone.suspicion > 0.5) return 'CURIGA...';
    return 'AMAN';
  }

  get anySeen() {
    return (
      this.guards.some((g) => g.seenPlayer) ||
      this.cameras.some((c) => c.seenPlayer) ||
      this.drone.seenPlayer
    );
  }

  /**
   * Bahaya di titik (x,z) pada waktu t — dipakai autopilot untuk merencanakan
   * rute: 0 aman, 1 di dalam kerucut / lingkaran drone, 2 di garis laser aktif.
   */
  dangerAt(x, z, t) {
    for (const g of this.guards) {
      if (g.poly && g.poly.length > 2 && pointInPoly(x, z, g.poly)) return 1;
    }
    for (const c of this.cameras) {
      if (c.poly && c.poly.length > 2 && pointInPoly(x, z, c.poly)) return 1;
    }
    if (Math.hypot(x - this.drone.x, z - this.drone.z) < 3.4) return 1;
    for (const l of LASERS) {
      if (laserState(l, t) !== 'on') continue;
      if (distToSegment(x, z, l.x1, l.z1, l.x2, l.z2) < 0.7) return 2;
    }
    return 0;
  }

  setBanner(text, seconds = 2.5) {
    this.banner = { text, timeLeft: seconds };
  }

  /** Ketahuan: strike bertambah, pemain kembali ke pintu masuk. */
  doStrike(reason) {
    this.strikes += 1;
    this.alarm = ALARM.strikeReset;
    this.player.x = -15.5;
    this.player.z = 10.5;
    this.player.invulnerable = 2.5;
    this.player.decoyActive = null;
    for (const g of this.guards) {
      g.reset();
      g.updateCone();
    }
    for (const c of this.cameras) c.reset();
    this.drone.reset();
    if (this.strikes >= STRIKES_MAX) {
      this.screen = SCREEN_LOSE;
      this.setBanner('TERTANGKAP 3 KALI — PENCURIAN GAGAL', 4);
      return 'lose';
    }
    this.setBanner(reason, 3);
    return 'strike';
  }

  /**
   * Simulasi ambient di balik layar judul: kurator patroli, CCTV menyapu,
   * drone terbang — tanpa pemain di ruangan (tidak ada yang bisa terlihat).
   */
  stepAmbient(dt) {
    this.time += dt;
    const dummy = { x: -100, z: -100, sneaking: false };
    const events = [];
    for (const g of this.guards) g.step(dt, dummy, events);
    for (const c of this.cameras) c.step(dt, dummy);
    this.drone.step(dt, dummy);
  }

  /**
   * Satu langkah aturan. `input` = {move:{x,z}, sneak, interact, decoy}.
   * Mengembalikan bit EVENT_OVER bila permainan selesai.
   */
  step(dt, input) {
    if (this.screen !== SCREEN_PLAY) return 0;
    this.time += dt;
    if (this.banner) {
      this.banner.timeLeft -= dt;
      if (this.banner.timeLeft <= 0) this.banner = null;
    }

    // --- Pemain ---
    const prevX = this.player.x;
    const prevZ = this.player.z;
    const moveEvent = this.player.step(dt, input.move, input.sneak, this.time);
    if (moveEvent === 'laser') {
      this.laserTrips += 1;
      this.alarm = Math.min(100, this.alarm + ALARM.laserTrip);
      this.setBanner('LASER! Alarm berbunyi — semua kurator mengejarmu!', 2.5);
      // Laser membangunkan semua kurator ke titik pemain.
      for (const g of this.guards) {
        if (g.state !== 'alert') {
          g.lastSeen = { x: this.player.x, z: this.player.z };
          g.suspicion = 1;
        }
      }
    }
    if (moveEvent === 'step' && this.onStep) this.onStep(this.player.stepAlt);
    void prevX;
    void prevZ;

    if (input.decoy) {
      const thrown = this.player.throwDecoy();
      if (thrown) {
        let nearest = null;
        let nearestD = Infinity;
        for (const g of this.guards) {
          const d = Math.hypot(g.x - thrown.x, g.z - thrown.z);
          if (d < nearestD) {
            nearestD = d;
            nearest = g;
          }
        }
        if (nearest && nearestD < 14) {
          nearest.lure(thrown.x, thrown.z);
          this.setBanner(`${nearest.name} menyelidiki bunyi pengalih!`, 2);
        }
        if (this.onDecoy) this.onDecoy();
      }
    }

    if (input.interact) {
      const item = this.loot.nearestInReach(this.player.x, this.player.z);
      if (item) {
        this.loot.take(item);
        this.setBanner(`${item.name} didapat! (${this.loot.takenCount}/3)`, 2.5);
        if (this.onPickup) this.onPickup();
      }
    }

    // --- Kurator ---
    const events = [];
    for (const g of this.guards) g.step(dt, this.player, events);
    for (const e of events) {
      if (e.type === 'spotted') {
        this.timesSeen += 1;
        this.setBanner(`${e.guard.name} melihatmu!`, 2);
        if (this.onSpotted) this.onSpotted();
      } else if (e.type === 'suspicious') {
        if (this.onSuspicious) this.onSuspicious();
      } else if (e.type === 'caught') {
        if (this.player.invulnerable <= 0) {
          const res = this.doStrike(`${e.guard.name} menangkapmu! Strike ${this.strikes}/${STRIKES_MAX}`);
          if (this.onCaught) this.onCaught();
          if (res === 'lose') return EVENT_OVER;
          return 0;
        }
      }
    }

    // --- CCTV + drone ---
    for (const c of this.cameras) {
      const alert = c.step(dt, this.player);
      if (alert) {
        let nearest = null;
        let nearestD = Infinity;
        for (const g of this.guards) {
          const d = Math.hypot(g.x - this.player.x, g.z - this.player.z);
          if (d < nearestD) {
            nearestD = d;
            nearest = g;
          }
        }
        if (nearest) {
          nearest.lastSeen = { x: this.player.x, z: this.player.z };
          nearest.suspicion = 1;
          this.setBanner(`${c.name} merekam wajahmu — ${nearest.name} dikirim!`, 2.5);
        }
      }
    }
    this.drone.step(dt, this.player);

    // --- Alarm ---
    const seenByGuard = this.guards.some((g) => g.seenPlayer);
    const seenByCam = this.cameras.some((c) => c.seenPlayer);
    const seenByDrone = this.drone.seenPlayer;
    if (this.player.invulnerable <= 0) {
      if (seenByGuard || seenByCam) this.alarm += ALARM.riseGuard * dt;
      else if (seenByDrone) this.alarm += ALARM.riseDrone * dt;
      else this.alarm -= ALARM.decay * dt;
    } else {
      this.alarm -= ALARM.decay * dt;
    }
    this.alarm = Math.max(0, Math.min(100, this.alarm));
    if (this.alarm >= 100) {
      const res = this.doStrike(`Alarm 100%! Galeri dikunci — Strike ${this.strikes}/${STRIKES_MAX}`);
      if (this.onCaught) this.onCaught();
      if (res === 'lose') return EVENT_OVER;
    }

    // --- Menang: 3 permata + capai EXIT ---
    if (this.loot.allTaken && this.loot.atExit(this.player.x, this.player.z)) {
      this.screen = SCREEN_WIN;
      this.grade = gradeFor(this.time, this.strikes);
      this.setBanner('KABUR DENGAN 3 PERMATA!', 4);
      if (this.onWin) this.onWin();
      return EVENT_OVER;
    }
    return 0;
  }
}

function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const xi = poly[i][0];
    const zi = poly[i][1];
    const xj = poly[j][0];
    const zj = poly[j][1];
    const crosses = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function distToSegment(px, pz, x1, z1, x2, z2) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const len2 = dx * dx + dz * dz;
  if (len2 === 0) return Math.hypot(px - x1, pz - z1);
  let t = ((px - x1) * dx + (pz - z1) * dz) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), pz - (z1 + t * dz));
}
