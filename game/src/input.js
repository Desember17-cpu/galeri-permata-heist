// input.js — keyboard (WASD/panah, Shift menyelinap, E interaksi, Q pengalih,
// M bisu, R ulang, Enter mulai). Menyimpan status tombol per frame.
export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set(); // tombol yang baru ditekan sejak frame terakhir
    this.onKeyDown = (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
      }
      if (!e.repeat) this.pressed.add(e.key.toLowerCase());
      this.keys.add(e.key.toLowerCase());
    };
    this.onKeyUp = (e) => {
      this.keys.delete(e.key.toLowerCase());
    };
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  down(key) {
    return this.keys.has(key);
  }

  /** True sekali pada frame tombol ditekan; dikonsumsi setelah dibaca. */
  wasPressed(key) {
    return this.pressed.has(key);
  }

  /** Vektor gerak ternormalisasi dari WASD / panah. x = timur, z = selatan. */
  moveVector() {
    let x = 0;
    let z = 0;
    if (this.down('a') || this.down('arrowleft')) x -= 1;
    if (this.down('d') || this.down('arrowright')) x += 1;
    if (this.down('w') || this.down('arrowup')) z -= 1;
    if (this.down('s') || this.down('arrowdown')) z += 1;
    if (x !== 0 && z !== 0) {
      const inv = 1 / Math.hypot(x, z);
      x *= inv;
      z *= inv;
    }
    return { x, z };
  }

  get sneak() {
    return this.down('shift');
  }

  endFrame() {
    this.pressed.clear();
  }
}
