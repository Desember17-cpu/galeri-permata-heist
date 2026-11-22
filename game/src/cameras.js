// cameras.js — pengawasan elektronik: 2 CCTV menyapu + 1 drone patroli.
// CCTV: kerucut menyapu seperti penjaga; bila melihat pemain cukup lama,
// alarm naik dan kurator terdekat dikirim menyelidiki.
// Drone: melayang di atas galeri, lingkaran visi di lantai; melihat pemain
// dari atas (melewati etalase rendah) tapi tidak menembus dinding tinggi.
import { CAMERA, CAMERA_DEFS, DRONE, DRONE_LOOP } from './config.js';
import { resolveCircle } from './level.js';
import { conePolygon, pointInCone } from './vision.js';

export class Cctv {
  constructor(def) {
    this.name = def.name;
    this.x = def.x;
    this.z = def.z;
    this.baseAngle = def.baseAngle;
    this.phase = def.phase;
    this.angle = def.baseAngle;
    this.time = 0;
    this.suspicion = 0;
    this.poly = null;
    this.seenPlayer = false;
    this.alertSent = false;
  }

  reset() {
    this.time = 0;
    this.angle = this.baseAngle;
    this.suspicion = 0;
    this.poly = null;
    this.seenPlayer = false;
    this.alertSent = false;
  }

  step(dt, player) {
    this.time += dt;
    // Menyapu bolak-balik mengikuti sinus.
    this.angle = this.baseAngle + Math.sin(this.time * CAMERA.sweepSpeed + this.phase) * CAMERA.sweepArc;
    this.poly = conePolygon(this.x, this.z, this.angle, CAMERA.halfAngle, CAMERA.range);
    this.seenPlayer = pointInCone(player.x, player.z, this.poly);
    if (this.seenPlayer) {
      this.suspicion = Math.min(1, this.suspicion + dt / CAMERA.suspicionTime);
    } else {
      this.suspicion = Math.max(0, this.suspicion - dt / 1.5);
    }
    if (this.suspicion >= 1 && !this.alertSent) {
      this.alertSent = true;
      return true; // minta kurator terdekat menyelidiki
    }
    if (this.suspicion < 0.2) this.alertSent = false;
    return false;
  }
}

export class Drone {
  constructor() {
    this.loop = DRONE_LOOP;
    this.x = DRONE_LOOP[0][0];
    this.z = DRONE_LOOP[0][1];
    this.wpIndex = 1;
    this.angle = 0;
    this.suspicion = 0;
    this.seenPlayer = false;
    this.bobPhase = 0;
  }

  reset() {
    this.x = DRONE_LOOP[0][0];
    this.z = DRONE_LOOP[0][1];
    this.wpIndex = 1;
    this.angle = 0;
    this.suspicion = 0;
    this.seenPlayer = false;
    this.bobPhase = 0;
  }

  step(dt, player) {
    this.bobPhase += dt;
    const wp = this.loop[this.wpIndex];
    const dx = wp[0] - this.x;
    const dz = wp[1] - this.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.1) {
      this.wpIndex = (this.wpIndex + 1) % this.loop.length;
    } else {
      const stepLen = Math.min(d, DRONE.speed * dt);
      this.x += (dx / d) * stepLen;
      this.z += (dz / d) * stepLen;
      this.angle = Math.atan2(dz, dx);
    }
    // Visi dari atas: lingkaran di lantai di bawah drone.
    const pd = Math.hypot(player.x - this.x, player.z - this.z);
    this.seenPlayer = pd < DRONE.visionRadius;
    if (this.seenPlayer) {
      this.suspicion = Math.min(1, this.suspicion + dt / DRONE.suspicionTime);
    } else {
      this.suspicion = Math.max(0, this.suspicion - dt / 1.5);
    }
  }

  /** Ketinggian visual (naik-turun lembut). */
  get height() {
    return DRONE.height + Math.sin(this.bobPhase * 2) * 0.25;
  }
}

export function createCameras() {
  return CAMERA_DEFS.map((def) => new Cctv(def));
}
