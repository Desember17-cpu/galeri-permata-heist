// render.js — semua yang terlihat: scene Three.js galeri, HUD DOM, minimap.
// Kamera oblique top-down tetap membingkai seluruh ruangan.
import * as THREE from 'three';
import { BLOCKERS, CASES, EXIT, GLASS_PANELS, LASERS, LOOT, PILLARS, ROOM, WALLS } from './config.js';
import { SCREEN_LOSE, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './world.js';
import { laserState } from './level.js';
import { mulberry32 } from './random.js';

const CONE_COLORS = {
  patrol: 0xffd34d,
  suspicious: 0xff8c1a,
  alert: 0xff2d2d,
  search: 0xff8c1a,
};

function marbleTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const g = c.getContext('2d');
  const rnd = mulberry32(7);
  g.fillStyle = '#e9eef4';
  g.fillRect(0, 0, 512, 512);
  const tile = 64;
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const shade = (x + y) % 2 === 0 ? '#eef2f7' : '#dfe7f0';
      g.fillStyle = shade;
      g.fillRect(x * tile, y * tile, tile, tile);
      // Urat marmer tipis.
      g.strokeStyle = 'rgba(120,150,180,0.18)';
      g.lineWidth = 1;
      g.beginPath();
      let px = x * tile + rnd() * tile;
      let py = y * tile;
      g.moveTo(px, py);
      for (let s = 0; s < 4; s += 1) {
        px += (rnd() - 0.5) * 40;
        py += tile / 4;
        g.lineTo(px, py);
      }
      g.stroke();
      g.strokeStyle = '#c3cfdb';
      g.lineWidth = 2;
      g.strokeRect(x * tile + 1, y * tile + 1, tile - 2, tile - 2);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 3);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function textTexture(text, font, color, bg) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 192;
  const g = c.getContext('2d');
  if (bg) {
    g.fillStyle = bg;
    g.fillRect(0, 0, 1024, 192);
  }
  g.fillStyle = color;
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 512, 100);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function markTexture(symbol, color) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.beginPath();
  g.arc(64, 64, 56, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#101018';
  g.font = 'bold 84px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(symbol, 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Mesh kerucut dari poligon 2D (bidang XZ). Geometri dialokasikan sekali
 * (kipas segitiga dengan jumlah titik tetap) dan posisinya ditulis ulang
 * tiap frame — tanpa alokasi baru, supaya render tetap cepat. */
const CONE_RAYS = 26;

function createConeMesh(color) {
  const geo = new THREE.BufferGeometry();
  const verts = new Float32Array((CONE_RAYS + 2) * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  const idx = [];
  for (let i = 1; i <= CONE_RAYS; i += 1) idx.push(0, i, i + 1);
  geo.setIndex(idx);
  const mat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.07;
  mesh.frustumCulled = false;
  return mesh;
}

function updateConeMesh(mesh, poly, color) {
  const pos = mesh.geometry.attributes.position;
  pos.setXYZ(0, poly[0][0], 0, poly[0][1]);
  for (let i = 0; i <= CONE_RAYS; i += 1) {
    const p = poly[Math.min(i + 1, poly.length - 1)];
    pos.setXYZ(i + 1, p[0], 0, p[1]);
  }
  pos.needsUpdate = true;
  mesh.geometry.computeBoundingSphere();
  mesh.material.color.setHex(color);
  mesh.visible = true;
}

export class Renderer {
  constructor(world, hud) {
    this.world = world;
    this.hud = hud; // elemen DOM dari index.html
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0e1a);
    this.camera = new THREE.PerspectiveCamera(46, 1280 / 800, 0.1, 200);
    this.camera.position.set(0, 30, 17);
    this.camera.lookAt(0, 0, -0.5);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(1280, 800);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.id = 'scene';
    document.getElementById('stage').appendChild(this.renderer.domElement);

    this.buildLights();
    this.buildRoom();
    this.buildPlayer();
    this.buildGuards();
    this.buildSurveillance();
    this.buildLoot();
    this.buildLasers();
    this.buildGlass();
    this.buildExit();
    this.lastSecond = -1;
  }

  buildLights() {
    const amb = new THREE.AmbientLight(0x8fa3c7, 0.7);
    this.scene.add(amb);
    const sun = new THREE.DirectionalLight(0xfff2d9, 1.8);
    sun.position.set(10, 26, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -22;
    sun.shadow.camera.right = 22;
    sun.shadow.camera.top = 18;
    sun.shadow.camera.bottom = -18;
    sun.shadow.camera.far = 70;
    this.scene.add(sun);
    // Sorot cyan di atas Berlian Aurora + sorot magenta di lorong selatan.
    const cyan = new THREE.PointLight(0x36c8ff, 60, 22, 1.6);
    cyan.position.set(0, 6, -9.5);
    this.scene.add(cyan);
    const magenta = new THREE.PointLight(0xff4fd8, 45, 20, 1.6);
    magenta.position.set(0, 6, 6);
    this.scene.add(magenta);
  }

  buildRoom() {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM.maxX - ROOM.minX + 2, ROOM.maxZ - ROOM.minZ + 2),
      new THREE.MeshStandardMaterial({ map: marbleTexture(), roughness: 0.35, metalness: 0.05 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Karpet merah-galeri di lorong tengah.
    const carpet = new THREE.Mesh(
      new THREE.PlaneGeometry(4.4, 22),
      new THREE.MeshStandardMaterial({ color: 0x8e1f3c, roughness: 0.9 }),
    );
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.set(0, 0.02, 0);
    carpet.receiveShadow = true;
    this.scene.add(carpet);
    for (const sx of [-2.25, 2.25]) {
      const trim = new THREE.Mesh(
        new THREE.PlaneGeometry(0.18, 22),
        new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.4, metalness: 0.6 }),
      );
      trim.rotation.x = -Math.PI / 2;
      trim.position.set(sx, 0.03, 0);
      this.scene.add(trim);
    }

    // Dinding: navy gelap + lis emas di atas.
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x1b2340, roughness: 0.7 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.35, metalness: 0.7 });
    for (const w of WALLS) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(w.w, 3, w.d), wallMat);
      box.position.set(w.x, 1.5, w.z);
      box.castShadow = true;
      box.receiveShadow = true;
      this.scene.add(box);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(w.w + 0.06, 0.14, w.d + 0.06), trimMat);
      trim.position.set(w.x, 3.05, w.z);
      this.scene.add(trim);
    }
    // Pilar marmer.
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0xf2f5f8, roughness: 0.3 });
    for (const p of PILLARS) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(p.w, 3.4, p.d), pillarMat);
      box.position.set(p.x, 1.7, p.z);
      box.castShadow = true;
      box.receiveShadow = true;
      this.scene.add(box);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(p.w + 0.3, 0.2, p.d + 0.3), trimMat);
      cap.position.set(p.x, 3.45, p.z);
      this.scene.add(cap);
    }
    // Etalase: alas gelap + kaca + permata kecil hiasan.
    const caseBase = new THREE.MeshStandardMaterial({ color: 0x232a3d, roughness: 0.5 });
    const caseGlass = new THREE.MeshStandardMaterial({
      color: 0x9fd8ff, transparent: true, opacity: 0.25, roughness: 0.1, metalness: 0.2,
    });
    const gemMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x88ccff, emissiveIntensity: 0.9, roughness: 0.15 });
    for (const c of CASES) {
      const base = new THREE.Mesh(new THREE.BoxGeometry(c.w, 1.0, c.d), caseBase);
      base.position.set(c.x, 0.5, c.z);
      base.castShadow = true;
      base.receiveShadow = true;
      this.scene.add(base);
      const glass = new THREE.Mesh(new THREE.BoxGeometry(c.w - 0.2, 0.5, c.d - 0.2), caseGlass);
      glass.position.set(c.x, 1.25, c.z);
      this.scene.add(glass);
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), gemMat);
      gem.position.set(c.x, 1.25, c.z);
      this.scene.add(gem);
      this.scene.userData.spinGems = this.scene.userData.spinGems || [];
      this.scene.userData.spinGems.push(gem);
    }
    // Papan nama galeri di dinding utara.
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(13, 2.2),
      new THREE.MeshBasicMaterial({ map: textTexture('✦ GALERI PERMATA ✦', 'bold 92px Georgia, serif', '#ffd97a', '#141a2e') }),
    );
    sign.position.set(0, 1.7, -11.95);
    this.scene.add(sign);
  }

  buildPlayer() {
    const g = new THREE.Group();
    const jacket = new THREE.MeshStandardMaterial({ color: 0x00e5ff, roughness: 0.4 });
    const pants = new THREE.MeshStandardMaterial({ color: 0x101018, roughness: 0.6 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xf2c89b, roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.9, 12), jacket);
    body.position.y = 0.75;
    body.castShadow = true;
    g.add(body);
    const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.5, 12), pants);
    legs.position.y = 0.25;
    g.add(legs);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), skin);
    head.position.y = 1.45;
    head.castShadow = true;
    g.add(head);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.34, 0.14, 12),
      new THREE.MeshStandardMaterial({ color: 0xff2d78, roughness: 0.4 }));
    cap.position.y = 1.68;
    g.add(cap);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xff2d78, roughness: 0.4 }));
    brim.position.set(0, 1.62, 0.3);
    g.add(brim);
    // Cincin hijau terang di bawah pemain — pemain selalu mudah ditemukan.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.72, 32),
      new THREE.MeshBasicMaterial({ color: 0x39ff88, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    g.add(ring);
    this.playerRing = ring;
    // Panah kecil di atas kepala.
    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.22, 0.5, 4),
      new THREE.MeshBasicMaterial({ color: 0x39ff88 }),
    );
    arrow.position.y = 2.15;
    arrow.rotation.x = Math.PI;
    g.add(arrow);
    this.playerArrow = arrow;
    this.playerGroup = g;
    this.scene.add(g);
  }

  buildGuards() {
    this.guardMeshes = [];
    const qTex = markTexture('?', '#ffb020');
    const eTex = markTexture('!', '#ff2d2d');
    for (const guard of this.world.guards) {
      const g = new THREE.Group();
      const uniform = new THREE.MeshStandardMaterial({ color: guard.color, roughness: 0.55 });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.44, 1.0, 12), uniform);
      body.position.y = 0.8;
      body.castShadow = true;
      g.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12),
        new THREE.MeshStandardMaterial({ color: 0xe8b98a, roughness: 0.6 }));
      head.position.y = 1.55;
      head.castShadow = true;
      g.add(head);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.34, 0.16, 12),
        new THREE.MeshStandardMaterial({ color: 0x141a2e, roughness: 0.4 }));
      cap.position.y = 1.78;
      g.add(cap);
      // Senter kecil di tangan: kerucut cahaya putih tipis ke depan.
      const lamp = new THREE.Mesh(
        new THREE.ConeGeometry(0.12, 0.5, 8),
        new THREE.MeshBasicMaterial({ color: 0xfff2b0 }),
      );
      lamp.rotation.x = Math.PI / 2;
      lamp.position.set(0, 1.0, 0.5);
      g.add(lamp);
      const markQ = new THREE.Sprite(new THREE.SpriteMaterial({ map: qTex, transparent: true, depthTest: false }));
      markQ.scale.set(1.1, 1.1, 1);
      markQ.position.y = 2.5;
      markQ.visible = false;
      g.add(markQ);
      const markE = new THREE.Sprite(new THREE.SpriteMaterial({ map: eTex, transparent: true, depthTest: false }));
      markE.scale.set(1.1, 1.1, 1);
      markE.position.y = 2.5;
      markE.visible = false;
      g.add(markE);
      this.scene.add(g);
      this.guardMeshes.push({ group: g, cone: null, markQ, markE });
    }
  }

  buildSurveillance() {
    this.cameraMeshes = [];
    for (const cam of this.world.cameras) {
      const g = new THREE.Group();
      const mount = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.5),
        new THREE.MeshStandardMaterial({ color: 0x2a2f45, roughness: 0.5, metalness: 0.4 }));
      mount.position.set(cam.x, 2.6, cam.z);
      g.add(mount);
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.5, 10),
        new THREE.MeshStandardMaterial({ color: 0x11141f, roughness: 0.3, metalness: 0.6 }));
      lens.rotation.x = Math.PI / 2;
      lens.position.set(cam.x, 2.6, cam.z);
      g.add(lens);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xff2d2d }));
      dot.position.set(cam.x, 2.85, cam.z);
      g.add(dot);
      this.scene.add(g);
      this.cameraMeshes.push({ group: g, cone: null, dot });
    }
    // Drone: oktahedron gelap + lampu merah + lingkaran visi di lantai.
    const d = new THREE.Group();
    const body = new THREE.Mesh(new THREE.OctahedronGeometry(0.55),
      new THREE.MeshStandardMaterial({ color: 0x232a3d, roughness: 0.35, metalness: 0.7 }));
    body.castShadow = true;
    d.add(body);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xff2d2d }));
    eye.position.set(0, 0, 0.5);
    d.add(eye);
    this.droneEye = eye;
    const ringGeo = new THREE.RingGeometry(3.1, 3.4, 48);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: 0xff2d2d, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false,
    }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    this.droneRing = ring;
    this.scene.add(ring);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(3.4, 48), new THREE.MeshBasicMaterial({
      color: 0xff2d2d, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false,
    }));
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.06;
    this.droneDisc = disc;
    this.scene.add(disc);
    this.droneGroup = d;
    this.scene.add(d);
  }
  buildLoot() {
    this.lootMeshes = [];
    for (const item of this.world.loot.items) {
      const g = new THREE.Group();
      const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 1.1, 16),
        new THREE.MeshStandardMaterial({ color: 0xf2f5f8, roughness: 0.3 }));
      pedestal.position.y = 0.55;
      pedestal.castShadow = true;
      pedestal.receiveShadow = true;
      g.add(pedestal);
      const trim = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.05, 8, 24),
        new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.3, metalness: 0.7 }));
      trim.rotation.x = Math.PI / 2;
      trim.position.y = 1.1;
      g.add(trim);
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.55),
        new THREE.MeshStandardMaterial({
          color: item.color, emissive: item.glow, emissiveIntensity: 1.4, roughness: 0.1, metalness: 0.1,
        }));
      gem.position.y = 1.9;
      gem.castShadow = true;
      g.add(gem);
      const light = new THREE.PointLight(item.glow, 22, 10, 1.8);
      light.position.y = 2.6;
      g.add(light);
      // Label nama permata mengambang di atas podium.
      const label = new THREE.Mesh(
        new THREE.PlaneGeometry(3.4, 0.64),
        new THREE.MeshBasicMaterial({
          map: textTexture(item.name.toUpperCase(), 'bold 64px Georgia, serif', '#ffffff', null),
          transparent: true,
        }),
      );
      label.position.y = 3.1;
      label.rotation.x = -Math.PI / 3.2;
      g.add(label);
      g.position.set(item.x, 0, item.z);
      this.scene.add(g);
      this.lootMeshes.push({ group: g, gem, light, label, item });
    }
  }

  buildLasers() {
    this.laserMeshes = [];
    const postMat = new THREE.MeshStandardMaterial({ color: 0x2a2f45, roughness: 0.4, metalness: 0.6 });
    for (const l of LASERS) {
      const g = new THREE.Group();
      for (const [px, pz] of [[l.x1, l.z1], [l.x2, l.z2]]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 1.3, 10), postMat);
        post.position.set(px, 0.65, pz);
        post.castShadow = true;
        g.add(post);
        const tip = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10),
          new THREE.MeshBasicMaterial({ color: 0xff2d2d }));
        tip.position.set(px, 1.35, pz);
        g.add(tip);
      }
      const len = Math.hypot(l.x2 - l.x1, l.z2 - l.z1);
      const beam = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.08),
        new THREE.MeshBasicMaterial({ color: 0xff2d2d, transparent: true, opacity: 0.9 }));
      beam.position.set((l.x1 + l.x2) / 2, 1.35, (l.z1 + l.z2) / 2);
      beam.rotation.y = -Math.atan2(l.z2 - l.z1, l.x2 - l.x1);
      g.add(beam);
      // Sinar kedua sejajar, 0.5 lebih rendah — "silang" antar etalase.
      const beam2 = beam.clone();
      beam2.position.y = 0.85;
      beam2.material = beam.material.clone();
      g.add(beam2);
      this.scene.add(g);
      this.laserMeshes.push({ group: g, beam, beam2, def: l });
    }
  }

  buildGlass() {
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x7df9ff, transparent: true, opacity: 0.3, roughness: 0.08, metalness: 0.1,
      side: THREE.DoubleSide,
    });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.35, metalness: 0.7 });
    for (const p of GLASS_PANELS) {
      const len = Math.hypot(p.x2 - p.x1, p.z2 - p.z1);
      const cx = (p.x1 + p.x2) / 2;
      const cz = (p.z1 + p.z2) / 2;
      const angle = Math.atan2(p.z2 - p.z1, p.x2 - p.x1);
      const pane = new THREE.Mesh(new THREE.BoxGeometry(len, 2.2, 0.12), glassMat);
      pane.position.set(cx, 1.1, cz);
      pane.rotation.y = -angle;
      this.scene.add(pane);
      const top = new THREE.Mesh(new THREE.BoxGeometry(len + 0.1, 0.1, 0.2), frameMat);
      top.position.set(cx, 2.25, cz);
      top.rotation.y = -angle;
      this.scene.add(top);
      const bottom = new THREE.Mesh(new THREE.BoxGeometry(len + 0.1, 0.12, 0.24), frameMat);
      bottom.position.set(cx, 0.06, cz);
      bottom.rotation.y = -angle;
      this.scene.add(bottom);
    }
  }

  buildExit() {
    const g = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4),
      new THREE.MeshStandardMaterial({ color: 0x0d5c2e, emissive: 0x1fae54, emissiveIntensity: 0.5, roughness: 0.5 }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.04;
    g.add(pad);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.7, 40),
      new THREE.MeshBasicMaterial({ color: 0x39ff88, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    g.add(ring);
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 0.9),
      new THREE.MeshBasicMaterial({
        map: textTexture('⬆ EXIT — PINTU DARURAT', 'bold 56px sans-serif', '#39ff88', null),
        transparent: true,
      }),
    );
    label.position.y = 0.06;
    label.rotation.x = -Math.PI / 2;
    label.rotation.z = Math.PI / 2;
    g.add(label);
    const light = new THREE.PointLight(0x39ff88, 18, 9, 1.8);
    light.position.y = 2.5;
    g.add(light);
    g.position.set(EXIT.x, 0, EXIT.z);
    this.scene.add(g);
    // Keset pintu masuk selatan-barat.
    const mat = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.6),
      new THREE.MeshStandardMaterial({ color: 0x141a2e, roughness: 0.9 }));
    mat.rotation.x = -Math.PI / 2;
    mat.position.set(-15.5, 0.04, 11.4);
    this.scene.add(mat);
  }

  /** Tulis ulang mesh kerucut dari poligon (dibuat sekali, dipakai ulang). */
  setCone(slot, poly, color) {
    if (!poly || poly.length < 3) {
      if (slot.cone) slot.cone.visible = false;
      return;
    }
    if (!slot.cone) {
      slot.cone = createConeMesh(color);
      this.scene.add(slot.cone);
    }
    updateConeMesh(slot.cone, poly, color);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  /** Gambar satu frame + perbarui HUD + minimap. */
  draw(time) {
    const w = this.world;
    const p = w.player;
    this.playerGroup.position.set(p.x, 0, p.z);
    this.playerGroup.rotation.y = -p.angle + Math.PI / 2;
    this.playerArrow.position.y = 2.15 + Math.sin(time * 3) * 0.12;
    this.playerRing.material.opacity = p.invulnerable > 0 ? 0.35 + 0.3 * Math.sin(time * 12) : 0.9;

    for (let i = 0; i < w.guards.length; i += 1) {
      const guard = w.guards[i];
      const slot = this.guardMeshes[i];
      slot.group.position.set(guard.x, 0, guard.z);
      slot.group.rotation.y = -guard.angle + Math.PI / 2;
      this.setCone(slot, guard.poly, CONE_COLORS[guard.state]);
      slot.markQ.visible = guard.state === 'suspicious' || guard.state === 'search';
      slot.markE.visible = guard.state === 'alert';
    }
    for (let i = 0; i < w.cameras.length; i += 1) {
      const cam = w.cameras[i];
      const slot = this.cameraMeshes[i];
      slot.group.rotation.y = -cam.angle + Math.PI / 2;
      this.setCone(slot, cam.poly, cam.suspicion > 0.5 ? 0xff6b2d : 0xffe9a8);
      slot.dot.material.color.setHex(cam.seenPlayer ? 0xff2d2d : 0x39ff88);
    }
    this.droneGroup.position.set(w.drone.x, w.drone.height, w.drone.z);
    this.droneGroup.rotation.y = -w.drone.angle + Math.PI / 2;
    this.droneEye.material.color.setHex(w.drone.seenPlayer ? 0xff2d2d : 0xff6b2d);
    this.droneRing.position.set(w.drone.x, 0.06, w.drone.z);
    this.droneDisc.position.set(w.drone.x, 0.06, w.drone.z);
    this.droneRing.material.opacity = w.drone.seenPlayer ? 0.6 : 0.3;
    this.droneDisc.material.opacity = w.drone.seenPlayer ? 0.16 : 0.07;

    for (const slot of this.lootMeshes) {
      slot.gem.rotation.y += 0.03;
      slot.gem.position.y = 1.9 + Math.sin(time * 2 + slot.item.x) * 0.12;
      const visible = !slot.item.taken;
      slot.gem.visible = visible;
      slot.label.visible = visible;
      slot.light.visible = visible;
    }
    for (const gem of this.scene.userData.spinGems || []) gem.rotation.y += 0.02;

    for (const slot of this.laserMeshes) {
      const state = laserState(slot.def, w.time);
      const blink = state === 'warn' ? Math.sin(time * 20) > 0 : state === 'on';
      slot.beam.visible = blink;
      slot.beam2.visible = blink;
      slot.beam.material.opacity = state === 'on' ? 0.9 : 0.5;
      slot.beam2.material.opacity = slot.beam.material.opacity;
    }

    if (p.decoyActive) {
      if (!this.decoyMesh) {
        this.decoyMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.3),
          new THREE.MeshStandardMaterial({ color: 0xffd34d, emissive: 0xffb020, emissiveIntensity: 1.6 }));
        this.scene.add(this.decoyMesh);
      }
      this.decoyMesh.visible = true;
      this.decoyMesh.position.set(p.decoyActive.x, 0.6 + Math.sin(time * 6) * 0.1, p.decoyActive.z);
      this.decoyMesh.rotation.y += 0.08;
    } else if (this.decoyMesh) {
      this.decoyMesh.visible = false;
    }

    this.updateHud();
    this.drawMinimap();
    this.renderer.render(this.scene, this.camera);
  }

  updateHud() {
    const w = this.world;
    const h = this.hud;
    h.loot.textContent = `◆ ${w.loot.takenCount}/3 Permata`;
    const mins = Math.floor(w.time / 60);
    const secs = Math.floor(w.time % 60);
    h.time.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    h.decoys.textContent = `◉ Pengalih: ${w.player.decoys}`;
    h.alarmFill.style.width = `${w.alarm}%`;
    const status = w.alertStatus;
    h.alarmStatus.textContent = status;
    h.alarmStatus.style.color = status === 'TERLIHAT!' ? '#ff5c5c' : status === 'CURIGA...' ? '#ffb020' : '#39ff88';
    h.alarmFill.style.background = status === 'TERLIHAT!' ? '#ff2d2d' : status === 'CURIGA...' ? '#ffb020' : '#39ff88';
    h.laserState.textContent = `▦ Laser: ${LASERS.some((l) => laserState(l, w.time) === 'on') ? 'AKTIF' : 'MATI'}`;
    h.laserState.style.color = LASERS.some((l) => laserState(l, w.time) === 'on') ? '#ff5c5c' : '#39ff88';
    h.guards.innerHTML = w.guards.map((g) => {
      const mark = g.state === 'alert' ? '!' : g.state === 'patrol' ? '○' : '?';
      const cls = g.state === 'alert' ? 'g-alert' : g.state === 'patrol' ? '' : 'g-susp';
      return `<span class="${cls}">${g.name} ${mark}</span>`;
    }).join(' · ') + ` · <span class="${w.drone.seenPlayer ? 'g-alert' : ''}">Drone ${w.drone.seenPlayer ? '!' : '○'}</span>`;
    const near = w.loot.nearestInReach(w.player.x, w.player.z);
    if (w.screen === SCREEN_PLAY && near) {
      h.hint.textContent = `Tekan E — ambil ${near.name}`;
      h.hint.style.display = 'block';
    } else if (w.screen === SCREEN_PLAY) {
      h.hint.textContent = 'WASD gerak · Shift menyelinap · E interaksi · Q lempar pengalih';
      h.hint.style.display = 'block';
    } else {
      h.hint.style.display = 'none';
    }
    if (w.banner) {
      h.banner.textContent = w.banner.text;
      h.banner.style.display = 'block';
    } else {
      h.banner.style.display = 'none';
    }
    // Layar overlay.
    h.titleScreen.style.display = w.screen === SCREEN_TITLE ? 'flex' : 'none';
    h.winScreen.style.display = w.screen === SCREEN_WIN ? 'flex' : 'none';
    h.loseScreen.style.display = w.screen === SCREEN_LOSE ? 'flex' : 'none';
    if (w.screen === SCREEN_WIN) {
      h.winGrade.textContent = w.grade || '—';
      h.winStats.textContent = `Grade ${w.grade} · Waktu ${h.time.textContent} · Ketahuan ${w.strikes}x · Laser ${w.laserTrips}x · Terlihat ${w.timesSeen}x`;
    }
    if (w.screen === SCREEN_LOSE) {
      h.loseStats.textContent = `Permata ${w.loot.takenCount}/3 · Waktu ${h.time.textContent} · Terlihat ${w.timesSeen}x`;
    }
  }

  drawMinimap() {
    const c = this.hud.minimap;
    const g = c.getContext('2d');
    const W = c.width;
    const H = c.height;
    const sx = W / 36;
    const sz = H / 26;
    const X = (x) => (x + 18) * sx;
    const Z = (z) => (z + 13) * sz;
    g.fillStyle = '#0d1326';
    g.fillRect(0, 0, W, H);
    // Lantai.
    g.fillStyle = '#1c2547';
    g.fillRect(X(ROOM.minX), Z(ROOM.minZ), (ROOM.maxX - ROOM.minX) * sx, (ROOM.maxZ - ROOM.minZ) * sz);
    // Penghalang.
    g.fillStyle = '#4a5878';
    for (const b of BLOCKERS) {
      g.fillRect(X(b.x - b.w / 2), Z(b.z - b.d / 2), b.w * sx, b.d * sz);
    }
    // Panel kaca.
    g.strokeStyle = '#7df9ff';
    g.lineWidth = 2;
    for (const p of GLASS_PANELS) {
      g.beginPath();
      g.moveTo(X(p.x1), Z(p.z1));
      g.lineTo(X(p.x2), Z(p.z2));
      g.stroke();
    }
    // Laser.
    const w = this.world;
    for (const l of LASERS) {
      const state = laserState(l, w.time);
      if (state === 'off') continue;
      g.strokeStyle = state === 'on' ? '#ff2d2d' : '#ff8c1a';
      g.lineWidth = state === 'on' ? 3 : 1.5;
      g.beginPath();
      g.moveTo(X(l.x1), Z(l.z1));
      g.lineTo(X(l.x2), Z(l.z2));
      g.stroke();
    }
    // EXIT.
    g.fillStyle = '#39ff88';
    g.fillRect(X(EXIT.x) - 5, Z(EXIT.z) - 5, 10, 10);
    // Loot.
    for (const item of w.loot.items) {
      if (item.taken) continue;
      g.fillStyle = '#ffd34d';
      g.beginPath();
      g.arc(X(item.x), Z(item.z), 4, 0, Math.PI * 2);
      g.fill();
    }
    // Kerucut penjaga (bayangan).
    for (const guard of w.guards) {
      if (!guard.poly) continue;
      g.fillStyle = guard.state === 'alert' ? 'rgba(255,45,45,0.35)' : 'rgba(255,211,77,0.22)';
      g.beginPath();
      g.moveTo(X(guard.poly[0][0]), Z(guard.poly[0][1]));
      for (let i = 1; i < guard.poly.length; i += 1) g.lineTo(X(guard.poly[i][0]), Z(guard.poly[i][1]));
      g.closePath();
      g.fill();
    }
    // Penjaga.
    for (const guard of w.guards) {
      g.fillStyle = guard.state === 'alert' ? '#ff2d2d' : '#ff8c1a';
      g.beginPath();
      g.arc(X(guard.x), Z(guard.z), 4, 0, Math.PI * 2);
      g.fill();
    }
    // Drone.
    g.fillStyle = '#ff5c7a';
    g.beginPath();
    g.arc(X(w.drone.x), Z(w.drone.z), 4, 0, Math.PI * 2);
    g.fill();
    // Pemain.
    g.fillStyle = '#39ff88';
    g.beginPath();
    g.arc(X(w.player.x), Z(w.player.z), 5, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#ffffff';
    g.lineWidth = 1.5;
    g.stroke();
  }
}
