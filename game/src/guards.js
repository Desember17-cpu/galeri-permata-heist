// guards.js — empat kurator keamanan.
// Status: patrol -> suspicious (?) -> alert (!) mengejar -> search -> patrol.
// Kerucut visi dihitung tiap frame oleh vision.js (membelok lewat kaca).
import { GUARD, GUARD_DEFS } from './config.js';
import { resolveCircle } from './level.js';
import { conePolygon, pointInCone } from './vision.js';
import { angleDiff, clamp } from './random.js';

export const STATE_PATROL = 'patrol';
export const STATE_SUSPICIOUS = 'suspicious';
export const STATE_ALERT = 'alert';
export const STATE_SEARCH = 'search';

export class Guard {
  constructor(def, index) {
    this.name = def.name;
    this.color = def.color;
    this.index = index;
    this.waypoints = def.waypoints;
    this.x = def.waypoints[0][0];
    this.z = def.waypoints[0][1];
    this.wpIndex = 1;
    this.angle = 0;
    this.state = STATE_PATROL;
    this.suspicion = 0; // 0..1 — penuh = alert
    this.stateTime = 0; // detik dalam status sekarang
    this.lastSeen = null; // {x, z} posisi terakhir pemain terlihat
    this.loseSight = 0; // detik sejak terakhir melihat pemain
    this.investigate = null; // {x, z} titik pengalih / suara
    this.poly = null; // poligon kerucut frame ini
    this.seenPlayer = false;
    this.caughtPlayer = false;
  }

  reset() {
    this.x = this.waypoints[0][0];
    this.z = this.waypoints[0][1];
    this.wpIndex = 1;
    this.angle = 0;
    this.state = STATE_PATROL;
    this.suspicion = 0;
    this.stateTime = 0;
    this.lastSeen = null;
    this.loseSight = 0;
    this.investigate = null;
    this.poly = null;
    this.seenPlayer = false;
    this.caughtPlayer = false;
  }

  /** Hitung ulang poligon kerucut dari posisi + arah hadap saat ini. */
  updateCone() {
    this.poly = conePolygon(this.x, this.z, this.angle, GUARD.halfAngle, GUARD.range);
  }

  sees(px, pz) {
    if (!this.poly) return false;
    return pointInCone(px, pz, this.poly);
  }

  /** Dipanggil saat pengalih (Q) dilempar: kurator terdekat menyelidiki. */
  lure(x, z) {
    if (this.state === STATE_ALERT) return;
    this.investigate = { x, z };
    this.state = STATE_SUSPICIOUS;
    this.stateTime = 0;
    this.suspicion = Math.max(this.suspicion, 0.55);
  }

  /** Jalan menuju (tx,tz) dengan kecepatan `speed`, tabrakan dinding dijaga. */
  moveToward(tx, tz, speed, dt) {
    const dx = tx - this.x;
    const dz = tz - this.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return true;
    const step = Math.min(d, speed * dt);
    const nx = this.x + (dx / d) * step;
    const nz = this.z + (dz / d) * step;
    const [rx, rz] = resolveCircle(nx, nz, GUARD.radius);
    this.x = rx;
    this.z = rz;
    this.angle = Math.atan2(dz, dx);
    return d - step < 0.05;
  }

  /** Putar hadapan menuju sudut target dengan kecepatan putar terbatas. */
  turnToward(targetAngle, dt, rate = 3.2) {
    const diff = angleDiff(this.angle, targetAngle);
    const maxTurn = rate * dt;
    this.angle += clamp(diff, -maxTurn, maxTurn);
  }

  step(dt, player, events) {
    this.stateTime += dt;
    this.seenPlayer = this.sees(player.x, player.z);
    if (this.seenPlayer) {
      this.lastSeen = { x: player.x, z: player.z };
      this.loseSight = 0;
      const rate = player.sneaking ? 0.55 : 1;
      this.suspicion = Math.min(1, this.suspicion + (dt / GUARD.suspicionTime) * rate);
    } else {
      this.loseSight += dt;
      this.suspicion = Math.max(0, this.suspicion - dt / 1.6);
    }

    if (this.state === STATE_PATROL) {
      const wp = this.waypoints[this.wpIndex];
      if (this.moveToward(wp[0], wp[1], GUARD.patrolSpeed, dt)) {
        this.wpIndex = (this.wpIndex + 1) % this.waypoints.length;
      }
      if (this.suspicion >= 1) {
        this.state = STATE_ALERT;
        this.stateTime = 0;
        events.push({ type: 'spotted', guard: this });
      } else if (this.suspicion > 0.35) {
        this.state = STATE_SUSPICIOUS;
        this.stateTime = 0;
        events.push({ type: 'suspicious', guard: this });
      }
    } else if (this.state === STATE_SUSPICIOUS) {
      // Berhenti, pandang ke arah yang dicurigai / titik pengalih.
      const target = this.investigate || this.lastSeen;
      if (target) {
        this.turnToward(Math.atan2(target.z - this.z, target.x - this.x), dt);
        if (this.investigate) {
          if (this.moveToward(target.x, target.z, GUARD.searchSpeed, dt)) {
            this.investigate = null;
          }
        }
      } else {
        this.turnToward(this.angle + dt * 0.8, dt, 0.8);
      }
      if (this.suspicion >= 1) {
        this.state = STATE_ALERT;
        this.stateTime = 0;
        events.push({ type: 'spotted', guard: this });
      } else if (this.stateTime > 2.5 && this.suspicion <= 0.05) {
        this.state = STATE_PATROL;
        this.stateTime = 0;
        this.investigate = null;
      }
    } else if (this.state === STATE_ALERT) {
      // Kejar posisi terakhir pemain terlihat.
      const target = this.lastSeen || { x: player.x, z: player.z };
      this.moveToward(target.x, target.z, GUARD.chaseSpeed, dt);
      const d = Math.hypot(player.x - this.x, player.z - this.z);
      if (d < GUARD.catchRadius) {
        this.caughtPlayer = true;
        events.push({ type: 'caught', guard: this });
      } else if (this.loseSight > GUARD.loseSightTime) {
        this.state = STATE_SEARCH;
        this.stateTime = 0;
        events.push({ type: 'lost', guard: this });
      }
    } else if (this.state === STATE_SEARCH) {
      // Cari di sekitar posisi terakhir terlihat, lalu kembali patroli.
      if (this.lastSeen) {
        const tx = this.lastSeen.x + Math.sin(this.stateTime * 1.7) * 1.2;
        const tz = this.lastSeen.z + Math.cos(this.stateTime * 1.3) * 1.2;
        this.moveToward(tx, tz, GUARD.searchSpeed, dt);
      }
      if (this.suspicion >= 1) {
        this.state = STATE_ALERT;
        this.stateTime = 0;
      } else if (this.stateTime > GUARD.searchTime) {
        this.state = STATE_PATROL;
        this.stateTime = 0;
        this.lastSeen = null;
      }
    }
    this.updateCone();
  }
}

export function createGuards() {
  return GUARD_DEFS.map((def, i) => new Guard(def, i));
}
