// main.js — bootstrap: dunia + audio + input + render + loop.
// ?shot=start|play|climax|end membekukan adegan deterministik untuk screenshot;
// tanpa parameter, game interaktif biasa.
import { World, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN, SCREEN_LOSE } from './world.js';
import { STEP } from './config.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');

function hudElements() {
  const $ = (id) => document.getElementById(id);
  return {
    loot: $('hud-loot'),
    time: $('hud-time'),
    decoys: $('hud-decoys'),
    alarmFill: $('alarm-fill'),
    alarmStatus: $('alarm-status'),
    laserState: $('hud-laser'),
    guards: $('guard-bar'),
    banner: $('banner'),
    hint: $('hint'),
    minimap: $('minimap'),
    titleScreen: $('title-screen'),
    winScreen: $('win-screen'),
    loseScreen: $('lose-screen'),
    winStats: $('win-stats'),
    winGrade: $('win-grade'),
    loseStats: $('lose-stats'),
    shotResult: $('shot-result'),
  };
}

const world = new World();
const audio = new AudioEngine();
const input = new Input();
const renderer = new Renderer(world, hudElements());

// Suara mengikuti kejadian dunia.
world.onStep = (alt) => audio.step(alt);
world.onPickup = () => audio.pickup();
world.onCaught = () => audio.alarmSting();
world.onSpotted = () => audio.alarmSting();
world.onSuspicious = () => audio.suspicious();
world.onDecoy = () => audio.decoy();
world.onWin = () => audio.win();
world.onLose = () => audio.lose();

let shotMode = null;
if (shotName) {
  shotMode = stageShot(shotName, world);
  const resultEl = document.getElementById('shot-result');
  if (resultEl) {
    resultEl.textContent = JSON.stringify({
      shot: shotName,
      screen: world.screen,
      grade: world.grade,
      time: Number(world.time.toFixed(2)),
      strikes: world.strikes,
      loot: world.loot.takenCount,
      timesSeen: world.timesSeen,
      laserTrips: world.laserTrips,
      alarm: Number(world.alarm.toFixed(1)),
      climax: shotMode.climax || null,
      end: shotMode.end || null,
    });
  }
}

let last = performance.now();
let acc = 0;
let renderTime = 0;

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  renderTime += dt;

  if (!shotMode) {
    audio.ensure();
    if (input.wasPressed('m')) audio.setMuted(!audio.muted);
    if (input.wasPressed('enter')) {
      if (world.screen === SCREEN_TITLE || world.screen === SCREEN_WIN || world.screen === SCREEN_LOSE) {
        audio.ensure();
        audio.startAmbient();
        world.startGame();
      }
    }
    if (input.wasPressed('r')) {
      if (world.screen === SCREEN_PLAY || world.screen === SCREEN_WIN || world.screen === SCREEN_LOSE) {
        world.startGame();
      }
    }
    if (world.screen === SCREEN_TITLE) {
      acc += dt;
      while (acc >= STEP) {
        world.stepAmbient(STEP);
        acc -= STEP;
      }
    } else if (world.screen === SCREEN_PLAY) {
      const interactPressed = input.wasPressed('e');
      const decoyPressed = input.wasPressed('q');
      acc += dt;
      while (acc >= STEP) {
        const move = input.moveVector();
        world.step(STEP, {
          move,
          sneak: input.sneak,
          interact: interactPressed,
          decoy: decoyPressed,
        });
        acc -= STEP;
        if (world.screen !== SCREEN_PLAY) break;
      }
    }
    input.endFrame();
  }

  renderer.draw(renderTime);
  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => renderer.resize());
renderer.resize();
requestAnimationFrame(frame);

// Tombol mulai di layar judul (klik mouse).
document.getElementById('start-btn').addEventListener('click', () => {
  audio.ensure();
  audio.startAmbient();
  world.startGame();
});
document.getElementById('again-btn').addEventListener('click', () => world.startGame());
document.getElementById('retry-btn').addEventListener('click', () => world.startGame());
