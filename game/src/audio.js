// audio.js — semua suara disintesis WebAudio sendiri, tanpa file audio.
// Langkah kaki, ambil permata, sting alarm, bunyi pengalih, ambient galeri.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.ambientNodes = null;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
  }

  tone(freq, dur, type, vol, when = 0, slideTo = null) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  /** Derap langkah pelan (bergantian kiri-kanan). */
  step(alternate) {
    this.tone(alternate ? 150 : 120, 0.07, 'triangle', 0.08);
  }

  /** Arpeggio cerah saat permata diambil. */
  pickup() {
    this.tone(880, 0.12, 'sine', 0.22);
    this.tone(1174, 0.12, 'sine', 0.2, 0.08);
    this.tone(1568, 0.22, 'sine', 0.22, 0.16);
  }

  /** Sting alarm dua nada saat ketahuan. */
  alarmSting() {
    this.tone(620, 0.18, 'square', 0.14);
    this.tone(466, 0.3, 'square', 0.14, 0.16);
  }

  /** Bunyi laser saat memotong sinar. */
  laserZap() {
    this.tone(1400, 0.25, 'sawtooth', 0.16, 0, 220);
  }

  /** Bunyi lempar pengalih: denting kaca kecil. */
  decoy() {
    this.tone(2093, 0.1, 'sine', 0.16);
    this.tone(1568, 0.14, 'sine', 0.12, 0.07);
  }

  /** Bunyi curiga: satu nada tanya. */
  suspicious() {
    this.tone(740, 0.14, 'triangle', 0.12, 0, 988);
  }

  /** Fanfare menang: tiga nada naik. */
  win() {
    this.tone(523, 0.16, 'sine', 0.2);
    this.tone(659, 0.16, 'sine', 0.2, 0.14);
    this.tone(784, 0.34, 'sine', 0.22, 0.28);
  }

  /** Nada kalah: turun. */
  lose() {
    this.tone(392, 0.2, 'triangle', 0.18);
    this.tone(311, 0.2, 'triangle', 0.18, 0.18);
    this.tone(233, 0.45, 'triangle', 0.18, 0.36);
  }

  /** Ambient galeri: drone rendah + kilau tinggi, sangat pelan. */
  startAmbient() {
    if (!this.ctx || this.ambientNodes) return;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.045;
    gain.connect(this.master);
    const osc1 = this.ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = 55;
    const osc2 = this.ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 82.5;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.08;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    osc1.connect(gain);
    osc2.connect(gain);
    osc1.start();
    osc2.start();
    lfo.start();
    this.ambientNodes = { gain, osc1, osc2, lfo };
  }
}
