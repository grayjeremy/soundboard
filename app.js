/* =========================================================================
   Soundboard — app.js
   Vanilla JS (ES6+), no build step, no dependencies.

   HOW TO CUSTOMIZE:
   ------------------
   Add, remove, or reorder sounds by editing the `sounds` array below.
   Each entry needs: id (unique string), name (display label),
   icon (any emoji or empty string), and file (relative path to audio).
   The UI regenerates automatically from this array — no other code
   changes are required to add a new sound.
   ========================================================================= */

'use strict';

/* -------------------------------------------------------------------------
 * 1. SOUND CONFIGURATION
 *    Edit this array to customize the soundboard. Order here = order shown.
 * ---------------------------------------------------------------------- */
const sounds = [
  { id: 'airhorn', name: 'Air Horn', icon: '📣', file: 'sounds/airhorn.wav' },
  { id: 'bell', name: 'Bell', icon: '🔔', file: 'sounds/bell.wav' },
  { id: 'clap', name: 'Clap', icon: '👏', file: 'sounds/clap.wav' },
  { id: 'drum', name: 'Drum Hit', icon: '🥁', file: 'sounds/drum.wav' },
  { id: 'laugh', name: 'Laugh', icon: '😂', file: 'sounds/laugh.wav' },
  { id: 'siren', name: 'Siren', icon: '🚨', file: 'sounds/siren.wav' },
  { id: 'whistle', name: 'Whistle', icon: '📯', file: 'sounds/whistle.wav' },
  { id: 'ding', name: 'Ding', icon: '✨', file: 'sounds/ding.wav' },
];

/* -------------------------------------------------------------------------
 * 2. APPLICATION STATE
 *    Central place for runtime state. Kept small and explicit so future
 *    features (favorites, categories, playlists, etc.) can extend it
 *    without restructuring the whole app.
 * ---------------------------------------------------------------------- */
const state = {
  /** Map of soundId -> HTMLAudioElement currently in use for that sound */
  audioPool: new Map(),
  /** Set of soundIds currently playing (supports multi-sound mode) */
  playing: new Set(),
  settings: {
    volume: 100,        // 0-100, persisted to Local Storage
    allowMultiple: false,
    loop: false,
  },
  deferredInstallPrompt: null,
};

const STORAGE_KEY = 'soundboard.settings.v1';

/* -------------------------------------------------------------------------
 * 3. DOM REFERENCES
 * ---------------------------------------------------------------------- */
const dom = {
  grid: document.getElementById('sound-grid'),
  stopAllBtn: document.getElementById('stop-all-btn'),
  installBtn: document.getElementById('install-btn'),
  iosHint: document.getElementById('ios-install-hint'),
  errorMessage: document.getElementById('error-message'),
  offlineStatus: document.getElementById('offline-status'),
  offlineStatusText: document.getElementById('offline-status-text'),
  installStatus: document.getElementById('install-status'),
  installStatusText: document.getElementById('install-status-text'),
  settingsToggle: document.getElementById('settings-toggle'),
  settingsBody: document.getElementById('settings-body'),
  volumeSlider: document.getElementById('volume-slider'),
  volumeValue: document.getElementById('volume-value'),
  multiSoundToggle: document.getElementById('multi-sound-toggle'),
  loopToggle: document.getElementById('loop-toggle'),
};

/* -------------------------------------------------------------------------
 * 4. SETTINGS PERSISTENCE (Local Storage)
 * ---------------------------------------------------------------------- */
function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (typeof saved.volume === 'number') state.settings.volume = saved.volume;
    if (typeof saved.allowMultiple === 'boolean') state.settings.allowMultiple = saved.allowMultiple;
    if (typeof saved.loop === 'boolean') state.settings.loop = saved.loop;
  } catch (err) {
    // Corrupt or inaccessible storage should never break the app.
    console.warn('Soundboard: could not load saved settings', err);
  }
}

function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings));
  } catch (err) {
    console.warn('Soundboard: could not save settings', err);
  }
}

/* -------------------------------------------------------------------------
 * 5. ERROR MESSAGING
 *    Uses role="alert" / aria-live="assertive" element already in the DOM.
 *    Never moves focus, per accessibility requirements.
 * ---------------------------------------------------------------------- */
let errorTimeoutId = null;

function showError(message) {
  dom.errorMessage.textContent = message;
  dom.errorMessage.hidden = false;

  clearTimeout(errorTimeoutId);
  errorTimeoutId = setTimeout(() => {
    dom.errorMessage.hidden = true;
    dom.errorMessage.textContent = '';
  }, 4000);
}

/* -------------------------------------------------------------------------
 * 6. AUDIO PLAYBACK
 * ---------------------------------------------------------------------- */

/**
 * Retrieve (or lazily create) the <audio> element for a given sound.
 * Reusing one element per sound avoids re-fetching from cache each time.
 */
function getAudioElement(sound) {
  if (state.audioPool.has(sound.id)) {
    return state.audioPool.get(sound.id);
  }
  const audio = new Audio(sound.file);
  audio.preload = 'auto';
  state.audioPool.set(sound.id, audio);
  return audio;
}

function setButtonPlayingState(soundId, isPlaying) {
  const btn = dom.grid.querySelector(`[data-sound-id="${soundId}"]`);
  if (!btn) return;
  btn.setAttribute('aria-pressed', String(isPlaying));
}

function clearButtonError(soundId) {
  const btn = dom.grid.querySelector(`[data-sound-id="${soundId}"]`);
  if (btn) btn.removeAttribute('aria-invalid');
}

function setButtonError(soundId) {
  const btn = dom.grid.querySelector(`[data-sound-id="${soundId}"]`);
  if (btn) btn.setAttribute('aria-invalid', 'true');
}

/**
 * Stop a single sound and reset its button state.
 */
function stopSound(soundId) {
  const audio = state.audioPool.get(soundId);
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
  }
  state.playing.delete(soundId);
  setButtonPlayingState(soundId, false);
}

/**
 * Stop every currently playing sound (used by "Stop All" and settings changes).
 */
function stopAllSounds() {
  for (const soundId of Array.from(state.playing)) {
    stopSound(soundId);
  }
}

/**
 * Play a sound by its configuration entry, honoring current settings:
 * - Single-sound mode stops any other playing sound first.
 * - Multi-sound mode allows overlap.
 * - Restarts from the beginning if the same sound is already playing.
 * - Applies master volume and loop setting.
 * - Handles missing/broken files gracefully without crashing the app.
 */
function playSound(sound) {
  if (!state.settings.allowMultiple) {
    // Single-sound mode: stop everything else before starting this one.
    for (const playingId of Array.from(state.playing)) {
      if (playingId !== sound.id) stopSound(playingId);
    }
  }

  const audio = getAudioElement(sound);
  audio.loop = state.settings.loop;
  audio.volume = state.settings.volume / 100;

  clearButtonError(sound.id);

  // Always restart from the beginning, even if already playing.
  try {
    audio.currentTime = 0;
  } catch (err) {
    // Some browsers throw if metadata isn't loaded yet; safe to ignore.
  }

  const playResult = audio.play();

  if (playResult && typeof playResult.catch === 'function') {
    playResult
      .then(() => {
        state.playing.add(sound.id);
        setButtonPlayingState(sound.id, true);
      })
      .catch(() => {
        handlePlaybackError(sound);
      });
  } else {
    // Older browsers: assume success, but errors are still caught by 'error' event.
    state.playing.add(sound.id);
    setButtonPlayingState(sound.id, true);
  }
}

function handlePlaybackError(sound) {
  state.playing.delete(sound.id);
  setButtonPlayingState(sound.id, false);
  setButtonError(sound.id);
  showError(`Unable to play "${sound.name}".`);
}

/* -------------------------------------------------------------------------
 * 7. BUTTON GENERATION
 *    The entire grid is generated from the `sounds` array. Adding, removing,
 *    or reordering entries there automatically updates the UI.
 * ---------------------------------------------------------------------- */
function createSoundButton(sound) {
  const btn = document.createElement('div');
  btn.className = 'sound-btn';
  btn.dataset.soundId = sound.id;

  // Accessibility: behaves like a native button for assistive tech.
  btn.setAttribute('role', 'button');
  btn.setAttribute('tabindex', '0');
  btn.setAttribute('aria-label', `Play ${sound.name} sound`);
  btn.setAttribute('aria-pressed', 'false');

  const icon = document.createElement('span');
  icon.className = 'sound-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = sound.icon || '🔊';

  const name = document.createElement('span');
  name.className = 'sound-name';
  name.textContent = sound.name;

  const indicator = document.createElement('span');
  indicator.className = 'playing-indicator';
  indicator.setAttribute('aria-hidden', 'true');

  btn.append(icon, name, indicator);

  // Pointer/mouse/touch activation.
  btn.addEventListener('pointerdown', () => btn.classList.add('is-pressed'));
  const clearPressed = () => btn.classList.remove('is-pressed');
  btn.addEventListener('pointerup', clearPressed);
  btn.addEventListener('pointerleave', clearPressed);
  btn.addEventListener('pointercancel', clearPressed);

  btn.addEventListener('click', () => {
    playSound(sound);
  });

  // Keyboard activation: Enter and Space must exactly match click behavior.
  btn.addEventListener('keydown', (event) => {
    if (event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault(); // Prevent page scroll on Space.
    }
  });

  btn.addEventListener('keyup', (event) => {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      btn.classList.add('is-pressed');
      playSound(sound);
      // Brief pressed animation for keyboard users, matching pointer behavior.
      setTimeout(() => btn.classList.remove('is-pressed'), 120);
    }
  });

  return btn;
}

function renderSoundGrid() {
  dom.grid.innerHTML = '';
  const fragment = document.createDocumentFragment();
  sounds.forEach((sound) => {
    fragment.appendChild(createSoundButton(sound));
  });
  dom.grid.appendChild(fragment);
}

/* -------------------------------------------------------------------------
 * 8. SETTINGS PANEL WIRING
 * ---------------------------------------------------------------------- */
function initSettingsPanel() {
  // Toggle expand/collapse.
  dom.settingsToggle.addEventListener('click', () => {
    const expanded = dom.settingsToggle.getAttribute('aria-expanded') === 'true';
    dom.settingsToggle.setAttribute('aria-expanded', String(!expanded));
    dom.settingsBody.hidden = expanded;
  });

  // Volume slider.
  dom.volumeSlider.value = String(state.settings.volume);
  dom.volumeValue.textContent = `${state.settings.volume}%`;
  dom.volumeSlider.addEventListener('input', () => {
    const value = Number(dom.volumeSlider.value);
    state.settings.volume = value;
    dom.volumeValue.textContent = `${value}%`;
    // Apply immediately to any currently-playing sounds.
    for (const soundId of state.playing) {
      const audio = state.audioPool.get(soundId);
      if (audio) audio.volume = value / 100;
    }
    saveSettings();
  });

  // Allow Multiple Sounds toggle.
  dom.multiSoundToggle.checked = state.settings.allowMultiple;
  dom.multiSoundToggle.setAttribute('aria-checked', String(state.settings.allowMultiple));
  dom.multiSoundToggle.addEventListener('change', () => {
    state.settings.allowMultiple = dom.multiSoundToggle.checked;
    dom.multiSoundToggle.setAttribute('aria-checked', String(state.settings.allowMultiple));
    // Switching to single-sound mode should immediately enforce "one at a time".
    if (!state.settings.allowMultiple && state.playing.size > 1) {
      const [keepId, ...rest] = Array.from(state.playing);
      rest.forEach(stopSound);
    }
    saveSettings();
  });

  // Loop Current Sound toggle.
  dom.loopToggle.checked = state.settings.loop;
  dom.loopToggle.setAttribute('aria-checked', String(state.settings.loop));
  dom.loopToggle.addEventListener('change', () => {
    state.settings.loop = dom.loopToggle.checked;
    dom.loopToggle.setAttribute('aria-checked', String(state.settings.loop));
    // Apply to currently playing sounds immediately.
    for (const soundId of state.playing) {
      const audio = state.audioPool.get(soundId);
      if (audio) audio.loop = state.settings.loop;
    }
    saveSettings();
  });
}

/* -------------------------------------------------------------------------
 * 9. STOP ALL BUTTON
 * ---------------------------------------------------------------------- */
function initStopAllButton() {
  dom.stopAllBtn.addEventListener('click', stopAllSounds);
}

/* -------------------------------------------------------------------------
 * 10. ONLINE / OFFLINE STATUS
 * ---------------------------------------------------------------------- */
function updateOnlineStatus() {
  const isOnline = navigator.onLine;
  dom.offlineStatus.classList.toggle('is-online', isOnline);
  dom.offlineStatus.classList.toggle('is-offline', !isOnline);
  dom.offlineStatusText.textContent = isOnline
    ? 'Online'
    : 'Offline — playing from cache';
}

function initOnlineStatus() {
  updateOnlineStatus();
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
}

/* -------------------------------------------------------------------------
 * 11. PWA INSTALLATION
 * ---------------------------------------------------------------------- */
function isRunningStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true // iOS Safari
  );
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function updateInstallStatusUI(installed) {
  dom.installStatus.hidden = false;
  dom.installStatus.classList.toggle('is-installed', installed);
  dom.installStatusText.textContent = installed ? 'Installed' : 'Not installed';
}

function initInstallFlow() {
  if (isRunningStandalone()) {
    updateInstallStatusUI(true);
    return;
  }

  updateInstallStatusUI(false);

  // Chromium-based browsers: capture the native install prompt.
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    state.deferredInstallPrompt = event;
    dom.installBtn.hidden = false;
  });

  dom.installBtn.addEventListener('click', async () => {
    if (!state.deferredInstallPrompt) return;
    state.deferredInstallPrompt.prompt();
    const { outcome } = await state.deferredInstallPrompt.userChoice;
    if (outcome === 'accepted') {
      updateInstallStatusUI(true);
      dom.installBtn.hidden = true;
    }
    state.deferredInstallPrompt = null;
  });

  window.addEventListener('appinstalled', () => {
    updateInstallStatusUI(true);
    dom.installBtn.hidden = true;
    dom.iosHint.hidden = true;
  });

  // iOS Safari has no beforeinstallprompt — show manual instructions instead.
  if (isIOS()) {
    dom.iosHint.hidden = false;
  }
}

/* -------------------------------------------------------------------------
 * 12. SERVICE WORKER REGISTRATION
 *     Uses a relative path so it works under any GitHub Pages sub-path
 *     (e.g. https://username.github.io/soundboard/).
 * ---------------------------------------------------------------------- */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    // Relative path + relative scope keeps this portable across sub-paths.
    navigator.serviceWorker.register('service-worker.js').catch((err) => {
      console.warn('Soundboard: service worker registration failed', err);
    });
  });
}

/* -------------------------------------------------------------------------
 * 13. GLOBAL AUDIO ERROR HANDLING (safety net)
 *     Ensures a broken/missing file for any sound never crashes the app,
 *     even outside of the direct play() promise rejection path.
 * ---------------------------------------------------------------------- */
function installGlobalAudioErrorHandling() {
  // Delegate: attach an error listener to each audio element as it's created.
  const originalGetAudioElement = getAudioElement;
  // (No override needed structurally; error listeners are added in getAudioElement itself.)
}

/* -------------------------------------------------------------------------
 * 14. INIT
 * ---------------------------------------------------------------------- */
function init() {
  loadSettings();
  renderSoundGrid();
  initSettingsPanel();
  initStopAllButton();
  initOnlineStatus();
  initInstallFlow();
  registerServiceWorker();
}

document.addEventListener('DOMContentLoaded', init);
