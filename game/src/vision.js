// vision.js — kerucut visi bervolume.
// Satu kerucut dihitung sebagai poligon 2D: sinar-sinar dari titik pengamat
// berhenti di dinding, dan MEMBELOK 20 derajat setelah menembus panel kaca
// (mekanik khas Galeri Permata). Poligon yang sama dipakai untuk menggambar
// mesh DAN untuk uji deteksi, jadi yang terlihat di layar persis yang berlaku.
import { GLASS_BEND } from './config.js';
import { rayBlocker, rayGlass } from './level.js';

const RAYS = 26; // jumlah sinar per kerucut

function rotate(dx, dz, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [dx * c - dz * s, dx * s + dz * c];
}

/**
 * Jejak satu sinar dari (ox,oz) arah (dx,dz) sejauh `range`: berhenti di
 * dinding, atau membelok setelah menembus panel kaca lalu lanjut.
 * Mengembalikan titik ujung [x, z].
 */
export function traceRay(ox, oz, dx, dz, range) {
  const wallT = rayBlocker(ox, oz, dx, dz);
  const glass = rayGlass(ox, oz, dx, dz, Math.min(range, wallT));
  if (glass) {
    const px = ox + dx * glass.t;
    const pz = oz + dz * glass.t;
    const [bdx, bdz] = rotate(dx, dz, GLASS_BEND);
    const rest = range - glass.t;
    const wallT2 = rayBlocker(px, pz, bdx, bdz);
    const end = Math.min(rest, wallT2);
    return [px + bdx * end, pz + bdz * end];
  }
  const end = Math.min(range, wallT);
  return [ox + dx * end, oz + dz * end];
}

/**
 * Poligon kerucut: daftar titik [x, z] berurutan (dimulai dari pengamat).
 * `angle` = arah hadap (radian, 0 = timur, + = ke selatan / searah jarum jam
 * dilihat dari atas), `halfAngle` = setengah lebar kerucut.
 */
export function conePolygon(ox, oz, angle, halfAngle, range) {
  const pts = [[ox, oz]];
  for (let i = 0; i <= RAYS; i += 1) {
    const a = angle - halfAngle + (2 * halfAngle * i) / RAYS;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    pts.push(traceRay(ox, oz, dx, dz, range));
  }
  return pts;
}

/** Uji titik-di-poligon (ray casting) pada bidang XZ. */
export function pointInPolygon(x, z, poly) {
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

/** Apakah titik (x,z) berada di dalam kerucut yang poligonnya sudah dihitung. */
export function pointInCone(x, z, poly) {
  return pointInPolygon(x, z, poly);
}
