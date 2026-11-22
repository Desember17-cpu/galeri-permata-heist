// Galeri Permata: Berlian Aurora — semua angka penyeimbang dan tata letak ruangan.
// Satu ruangan galeri marmer: tiga permata di atas podium, kurator berpatroli,
// kamera CCTV menyapu, drone melayang, dan laser silang antar etalase.
export const STEP = 1 / 60;
export const ROOM = { minX: -17, maxX: 17, minZ: -12, maxZ: 12 };
export const PLAYER = {
  radius: 0.45,
  speed: 6.0,
  sneakSpeed: 3.4,
  start: { x: -15.5, z: 10.5 },
};
export const GUARD = {
  radius: 0.5,
  patrolSpeed: 2.35,
  chaseSpeed: 3.5,
  searchSpeed: 2.6,
  range: 9.5,
  halfAngle: (34 * Math.PI) / 180,
  suspicionTime: 0.8, // detik terlihat terus-menerus sampai curiga penuh
  loseSightTime: 4.0, // detik tanpa melihat sebelum berhenti mengejar
  searchTime: 3.0,
  catchRadius: 1.0,
};
export const CAMERA = {
  range: 10.5,
  halfAngle: (28 * Math.PI) / 180,
  sweepSpeed: 0.55, // radian per detik
  sweepArc: (52 * Math.PI) / 180,
  suspicionTime: 1.2,
};
export const DRONE = {
  radius: 0.5,
  speed: 2.4,
  height: 3.4,
  visionRadius: 3.4,
  suspicionTime: 0.8,
};
export const ALARM = {
  riseGuard: 30, // per detik saat terlihat penjaga / kamera
  riseDrone: 20, // per detik saat terlihat drone
  decay: 11, // per detik saat tidak terlihat siapa pun
  laserTrip: 45, // sekali saat memotong laser aktif
  strikeReset: 30, // alarm setelah ketahuan
};
export const GLASS_BEND = (20 * Math.PI) / 180; // kerucut membelok 20 derajat lewat kaca
export const LASER = { period: 7, onTime: 4, warnTime: 0.6 };
export const TOOLS = { decoys: 3, decoyRange: 4.2, decoyLureTime: 4.0 };
export const STRIKES_MAX = 3;

// Dinding dan etalase: kotak AABB {x, z, w, d} — menghalangi gerak DAN pandangan.
export const WALLS = [
  // Dinding luar (tebal 1)
  { x: 0, z: -12.5, w: 36, d: 1 }, // utara
  { x: 0, z: 12.5, w: 36, d: 1 }, // selatan
  { x: -17.5, z: 0, w: 1, d: 26 }, // barat
  { x: 17.5, z: 0, w: 1, d: 26 }, // timur
  // Dinding dalam: memisahkan galeri jadi sayap, selalu menyisakan celah jalan
  { x: -4, z: -8, w: 1, d: 8 }, // sayap barat-utara (celah z -4..0)
  { x: 4, z: 8, w: 1, d: 8 }, // sayap timur-selatan (celah z 0..4)
  { x: -9, z: 4.5, w: 8, d: 1 }, // sekat barat-selatan (celah x -5..-1)
  { x: 9, z: -4.5, w: 8, d: 1 }, // sekat timur-utara (celah x 1..5)
];
// Etalase kaca rendah: menghalangi gerak + pandangan, permata kecil di atasnya.
export const CASES = [
  { x: -10, z: -6, w: 4, d: 2 },
  { x: 0, z: -6, w: 4, d: 2 },
  { x: 10, z: -6, w: 4, d: 2 },
  { x: -10, z: 2, w: 4, d: 2 },
  { x: 10, z: 2, w: 4, d: 2 },
  { x: 0, z: 6, w: 6, d: 2 },
];
// Pilar marmer: menghalangi gerak + pandangan.
export const PILLARS = [
  { x: -14, z: -9, w: 1.6, d: 1.6 },
  { x: 14, z: -9, w: 1.6, d: 1.6 },
  { x: -14, z: 9, w: 1.6, d: 1.6 },
  { x: 14, z: 9, w: 1.6, d: 1.6 },
];
// Panel kaca bias: menghalangi gerak, TIDAK menghalangi pandangan, tapi membelokkan
// kerucut visi penjaga 20 derajat setelah melewatinya. Segmen {x1,z1,x2,z2}.
export const GLASS_PANELS = [
  { x1: -8, z1: -2, x2: -8, z2: 2 }, // vertikal, sayap barat
  { x1: 8, z1: -2, x2: 8, z2: 2 }, // vertikal, sayap timur
  { x1: -2, z1: -2, x2: 2, z2: -2 }, // horizontal, lorong utara
];
// Laser silang antar etalase: segmen {x1,z1,x2,z2, offset} — offset menggeser siklus.
export const LASERS = [
  { x1: -6, z1: -3.5, x2: 6, z2: -3.5, offset: 0 }, // lorong utara
  { x1: 6.5, z1: 2, x2: 6.5, z2: 8, offset: 3.5 }, // lorong tengah-selatan
];
// Tiga permata yang harus dicuri.
export const LOOT = [
  { id: 'aurora', name: 'Berlian Aurora', x: 0, z: -9.5, color: 0x7df9ff, glow: 0x66e0ff },
  { id: 'ruby', name: 'Ruby Maharani', x: -12.5, z: -9.5, color: 0xff2d55, glow: 0xff5c7a },
  { id: 'safir', name: 'Safir Samudra', x: 13, z: 6, color: 0x2d7bff, glow: 0x5c9dff },
];
export const EXIT = { x: 15.5, z: -10.5, radius: 1.7 };
// Empat kurator keamanan dengan rute patroli di ruang terbuka (tanpa menembus dinding).
export const GUARD_DEFS = [
  {
    name: 'Kurator Sari', color: 0x2b3a67,
    waypoints: [[-12, -9], [-5.5, -9], [-5.5, -3.5], [-12, -3.5]],
  },
  {
    name: 'Kurator Bimo', color: 0x3a2b67,
    waypoints: [[6, -8], [12.8, -8], [12.8, -3.5], [6, -3.5]],
  },
  {
    name: 'Kurator Dewi', color: 0x673a2b,
    waypoints: [[-12, 6], [-5.5, 6], [-5.5, 10], [-12, 10]],
  },
  {
    name: 'Kurator Arka', color: 0x2b6750,
    waypoints: [[6, 4], [15.5, 4], [15.5, 10], [6, 10]],
  },
];
// Dua kamera CCTV di dinding, menyapu lorong utama.
export const CAMERA_DEFS = [
  { name: 'CCTV Utara', x: 0, z: -11.9, baseAngle: Math.PI / 2, phase: 0 },
  { name: 'CCTV Selatan', x: -15.5, z: 11.9, baseAngle: -Math.PI / 2, phase: 1.6 },
];
// Satu drone patroli melayang di atas galeri tengah.
export const DRONE_LOOP = [[-6, -4], [6, -4], [6, 8], [-6, 8]];

// Semua AABB penghalang (dinding + etalase + pilar) dalam satu daftar.
export const BLOCKERS = [...WALLS, ...CASES, ...PILLARS];
