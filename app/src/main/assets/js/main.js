import { sound } from './audio.js';
import { GameEngine } from './engine.js';
import { InputManager } from './input.js';
import { ArenaRenderer } from './renderer.js';
import { StoreManager } from './store.js';
import { UIManager } from './ui.js';

const canvas = document.getElementById('game-canvas');
const touchRoot = document.getElementById('touch-controls');

const store = new StoreManager();
const renderer = new ArenaRenderer(canvas);
const input = new InputManager(canvas, touchRoot);
const ui = new UIManager(store, sound);

const engine = new GameEngine(store, renderer, input, sound, {
  onModeChanged: (mode) => ui.onModeChanged(mode),
  onMatchStart: (level, buffs) => ui.onMatchStart(level, buffs),
  onWaveBanner: (text) => ui.showWaveBanner(text),
  onHudUpdate: (snapshot) => ui.updateHud(snapshot),
  onVictory: (data) => ui.showVictory(data),
  onDefeat: (data) => ui.showDefeat(data),
  onEndlessEnd: (data) => ui.showEndlessSummary(data),
  onTogglePause: () => ui.togglePause(),
});

ui.attachEngine(engine);

window.addEventListener('resize', () => {
  renderer.resize();
  ui.syncTouchVisibility();
});

// Register PWA Offline Service Worker
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('./sw.js').then(() => {
    const badge = document.getElementById('offline-badge');
    if (badge) badge.textContent = 'OFFLINE READY';
  }).catch(() => {});
}

// Android Back button bridge
window.inkBladeHandleBack = () => {
  if (ui.activeModal) {
    if (ui.activeModal === 'result') {
      ui.closeModal();
      engine.startTitleBackdrop();
      return true;
    }
    ui.closeModal();
    return true;
  }
  if (engine.mode !== 'title') {
    ui.openModal('pause');
    return true;
  }
  return false;
};

engine.start();
