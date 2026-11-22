// level.js — geometri galeri: tabrakan lingkaran-vs-AABB, raycast 2D untuk
// kerucut visi, panel kaca bias, dan siklus laser. Semua hitung di bidang XZ.
import { BLOCKERS, GLASS_PANELS, LASER, LASERS, ROOM } from './config.js';

/** Apakah titik (x,z) berada di dalam AABB (dengan margin radius). */
export function pointBlocked(x, z, margin) {
  if (x < ROOM.minX + margin || x > ROOM.maxX - margin) return true;
  if (z < ROOM.minZ + margin || z > ROOM.maxZ - margin) return true;
  for (const b of BLOCKERS) {
    if (x > b.x - b.w / 2 - margin && x < b.x + b.w / 2 + margin &&
        z > b.z - b.d / 2 - margin && z < b.z + b.d / 2 + margin) return true;
  }
  return false;
}

/**
 * Geser lingkaran (x,z,r) keluar dari semua AABB + dinding luar.
 * Mengembalikan posisi baru [x, z].
 */
export function resolveCircle(x, z, r) {
  // Dinding luar dulu.
  x = Math.max(ROOM.minX + r, Math.min(ROOM.maxX - r, x));
  z = Math.max(ROOM.minZ + r, Math.min(ROOM.maxZ - r, z));
  for (const b of BLOCKERS) {
    const hx = b.w / 2;
    const hz = b.d / 2;
    const cx = Math.max(b.x - hx, Math.min(b.x + hx, x));
    const cz = Math.max(b.z - hz, Math.min(b.z + hz, z));
    const dx = x - cx;
    const dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r || d2 === 0) {
      if (d2 === 0) {
        // Tepat di tengah kotak: dorong ke sisi terdekat.
        const px = hx + r - Math.abs(x - b.x);
        const pz = hz + r - Math.abs(z - b.z);
        if (px < pz) x = b.x + (x >= b.x ? hx + r : -hx - r);
        else z = b.z + (z >= b.z ? hz + r : -hz - r);
      }
      continue;
    }
    const d = Math.sqrt(d2);
    x = cx + (dx / d) * r;
    z = cz + (dz / d) * r;
  }
  return [x, z];
}

/**
 * Ray vs AABB (slab test) di bidang XZ. Ray dari (ox,oz) arah (dx,dz) ternormalisasi.
 * Mengembalikan jarak t >= 0 ke titik tabrakan pertama, atau Infinity.
 */
export function rayBox(ox, oz, dx, dz, b) {
  let tmin = 0;
  let tmax = Infinity;
  const minX = b.x - b.w / 2;
  const maxX = b.x + b.w / 2;
  const minZ = b.z - b.d / 2;
  const maxZ = b.z + b.d / 2;
  if (Math.abs(dx) < 1e-9) {
    if (ox < minX || ox > maxX) return Infinity;
  } else {
    let t1 = (minX - ox) / dx;
    let t2 = (maxX - ox) / dx;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  if (Math.abs(dz) < 1e-9) {
    if (oz < minZ || oz > maxZ) return Infinity;
  } else {
    let t1 = (minZ - oz) / dz;
    let t2 = (maxZ - oz) / dz;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}

/** Jarak ray ke penghalang terdekat (dinding/etalase/pilar), atau Infinity. */
export function rayBlocker(ox, oz, dx, dz) {
  let best = Infinity;
  for (const b of BLOCKERS) {
    const t = rayBox(ox, oz, dx, dz, b);
    if (t < best) best = t;
  }
  return best;
}

/**
 * Ray vs segmen panel kaca. Mengembalikan {t, panel} untuk tabrakan pertama,
 * atau null bila tidak ada.
 */
export function rayGlass(ox, oz, dx, dz, maxT) {
  let best = null;
  for (const p of GLASS_PANELS) {
    const ex = p.x2 - p.x1;
    const ez = p.z2 - p.z1;
    const denom = dx * ez - dz * ex;
    if (Math.abs(denom) < 1e-9) continue; // sejajar
    const rx = p.x1 - ox;
    const rz = p.z1 - oz;
    const t = (rx * ez - rz * ex) / denom;
    const u = (rx * dz - rz * dx) / denom;
    if (t > 0.001 && t < maxT && u >= 0 && u <= 1) {
      if (!best || t < best.t) best = { t, panel: p };
    }
  }
  return best;
}

/** Apakah segmen (ax,az)-(bx,bz) memotong AABB mana pun (untuk LOS). */
export function segmentBlocked(ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz);
  if (len < 1e-9) return false;
  const t = rayBlocker(ax, az, dx / len, dz / len);
  return t < len - 0.05;
}

/** Apakah segmen memotong panel kaca (dipakai untuk garis laser vs kaca: tidak). */
export function segmentCrossesGlass(ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz);
  if (len < 1e-9) return false;
  return rayGlass(ax, az, dx / len, dz / len, len) !== null;
}

// ---- Laser ----

/** Status laser pada waktu permainan t (detik): 'on' | 'warn' | 'off'. */
export function laserState(laser, t) {
  const phase = (t + laser.offset) % LASER.period;
  if (phase < LASER.onTime) return 'on';
  if (phase < LASER.onTime + LASER.warnTime) return 'warn';
  return 'off';
}

export function anyLaserOn(t) {
  return LASERS.some((l) => laserState(l, t) === 'on');
}

/**
 * Apakah segmen gerak (ax,az)-(bx,bz) memotong laser yang sedang aktif.
 * Dipakai saat pemain bergerak: memotong sinar = alarm melonjak.
 */
export function crossesActiveLaser(ax, az, bx, bz, t) {
  for (const l of LASERS) {
    if (laserState(l, t) !== 'on') continue;
    const dx = bx - ax;
    const dz = bz - az;
    const ex = l.x2 - l.x1;
    const ez = l.z2 - l.z1;
    const denom = dx * ez - dz * ex;
    if (Math.abs(denom) < 1e-9) continue;
    const rx = l.x1 - ax;
    const rz = l.z1 - az;
    const s = (rx * ez - rz * ex) / denom;
    const u = (rx * dz - rz * dx) / denom;
    if (s >= 0 && s <= 1 && u >= 0 && u <= 1) return l;
  }
  return null;
}
