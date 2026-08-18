/* =========================================================================
   Soundboard — app.js
   Vanilla JS (ES6+), no build step, no dependencies.

   Repository sounds are configured in sounds.json. Device-only sounds are
   stored as Blobs in IndexedDB and never uploaded.
   ========================================================================= */

'use strict';

const SOUNDS_URL = 'sounds.json';
const DEFAULT_SOUND_IMAGE = 'images/sounds/default.png';
const MAX_RECORDING_SECONDS = 30;
const SOUND_DB_NAME = 'soundboard.custom-sounds';
const SOUND_DB_VERSION = 1;
const SOUND_STORE_NAME = 'sounds';
let soundDatabasePromise = null;
let mediaRecorder = null;
let recordingChunks = [];
let recordingBlob = null;
let recordingPreviewUrl = null;
let recordingStartedAt = 0;
let recordingTimerId = null;
let recordingTimeoutId = null;
let recordingFailed = false;

/* -------------------------------------------------------------------------
 * 2. APPLICATION STATE
 *    Central place for runtime state. Kept small and explicit so future
 *    features (favorites, categories, playlists, etc.) can extend it
 *    without restructuring the whole app.
 * ---------------------------------------------------------------------- */
const state = {
  sounds: [],
  /** Map of soundId -> HTMLAudioElement currently in use for that sound */
  audioPool: new Map(),
  /** Map of local soundId -> temporary object URL used by its audio element */
  audioObjectUrls: new Map(),
  /** Map of local soundId -> temporary object URL used by its image */
  imageObjectUrls: new Map(),
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
  customSoundsToggle: document.getElementById('custom-sounds-toggle'),
  customSoundsBody: document.getElementById('custom-sounds-body'),
  volumeSlider: document.getElementById('volume-slider'),
  volumeValue: document.getElementById('volume-value'),
  multiSoundToggle: document.getElementById('multi-sound-toggle'),
  loopToggle: document.getElementById('loop-toggle'),
  customSoundName: document.getElementById('custom-sound-name'),
  customSoundImage: document.getElementById('custom-sound-image'),
  customSoundFile: document.getElementById('custom-sound-file'),
  startRecording: document.getElementById('start-recording'),
  stopRecording: document.getElementById('stop-recording'),
  recordingStatus: document.getElementById('recording-status'),
  recordingPreview: document.getElementById('recording-preview'),
  addCustomSound: document.getElementById('add-custom-sound'),
  localSoundList: document.getElementById('local-sound-list'),
};

/* -------------------------------------------------------------------------
 * 4. SOUND CATALOGS
 * ---------------------------------------------------------------------- */
function validateRepositorySound(sound, index) {
  const validId = typeof sound.id === 'string' && /^[a-z0-9-]+$/.test(sound.id);
  const validName = typeof sound.name === 'string' && sound.name.trim();
  const validImage = typeof sound.image === 'string' && sound.image.trim();
  const validFile = typeof sound.file === 'string' && sound.file.trim();

  if (!validId || !validName || !validImage || !validFile) {
    throw new Error(`Invalid repository sound at index ${index}.`);
  }

  return {
    id: sound.id,
    name: sound.name.trim(),
    image: sound.image,
    file: sound.file,
    source: 'repository',
  };
}

async function loadRepositorySounds() {
  const response = await fetch(SOUNDS_URL, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`Sound catalog request failed with HTTP ${response.status}.`);
  }

  const catalog = await response.json();
  if (!Array.isArray(catalog)) {
    throw new Error('Sound catalog must be an array.');
  }

  const sounds = catalog.map(validateRepositorySound);
  if (new Set(sounds.map((sound) => sound.id)).size !== sounds.length) {
    throw new Error('Repository sound IDs must be unique.');
  }
  return sounds;
}

function openSoundDatabase() {
  if (soundDatabasePromise) return soundDatabasePromise;

  soundDatabasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(SOUND_DB_NAME, SOUND_DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(SOUND_STORE_NAME, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      soundDatabasePromise = null;
      reject(request.error);
    };
  });

  return soundDatabasePromise;
}

async function loadLocalSounds() {
  const database = await openSoundDatabase();
  return new Promise((resolve, reject) => {
    const request = database
      .transaction(SOUND_STORE_NAME, 'readonly')
      .objectStore(SOUND_STORE_NAME)
      .getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveLocalSound(sound) {
  const database = await openSoundDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(SOUND_STORE_NAME, 'readwrite');
    transaction.objectStore(SOUND_STORE_NAME).put(sound);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function deleteLocalSound(soundId) {
  const database = await openSoundDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(SOUND_STORE_NAME, 'readwrite');
    transaction.objectStore(SOUND_STORE_NAME).delete(soundId);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

/* -------------------------------------------------------------------------
 * 5. SETTINGS PERSISTENCE (Local Storage)
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
 * 6. ERROR MESSAGING
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
 * 7. AUDIO PLAYBACK
 * ---------------------------------------------------------------------- */

/**
 * Retrieve (or lazily create) the <audio> element for a given sound.
 * Reusing one element per sound avoids re-fetching from cache each time.
 */
function getAudioElement(sound) {
  if (state.audioPool.has(sound.id)) {
    return state.audioPool.get(sound.id);
  }
  const file = sound.source === 'local'
    ? URL.createObjectURL(sound.blob)
    : sound.file;
  const audio = new Audio(file);
  audio.preload = 'auto';
  if (sound.source === 'local') {
    state.audioObjectUrls.set(sound.id, file);
  }
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
 * 8. BUTTON GENERATION
 * ---------------------------------------------------------------------- */
function getSoundImageUrl(sound) {
  if (sound.source !== 'local' || !sound.imageBlob) {
    return sound.image || DEFAULT_SOUND_IMAGE;
  }
  if (!state.imageObjectUrls.has(sound.id)) {
    state.imageObjectUrls.set(sound.id, URL.createObjectURL(sound.imageBlob));
  }
  return state.imageObjectUrls.get(sound.id);
}

function createSoundImage(sound, className) {
  const image = document.createElement('img');
  image.className = className;
  image.src = getSoundImageUrl(sound);
  image.alt = '';
  image.setAttribute('aria-hidden', 'true');
  image.addEventListener('error', () => {
    image.src = DEFAULT_SOUND_IMAGE;
  }, { once: true });
  return image;
}

function createSoundButton(sound) {
  const btn = document.createElement('div');
  btn.className = 'sound-btn';
  btn.dataset.soundId = sound.id;

  // Accessibility: behaves like a native button for assistive tech.
  btn.setAttribute('role', 'button');
  btn.setAttribute('tabindex', '0');
  btn.setAttribute('aria-label', `Play ${sound.name} sound`);
  btn.setAttribute('aria-pressed', 'false');

  const image = createSoundImage(sound, 'sound-image');

  const name = document.createElement('span');
  name.className = 'sound-name';
  name.textContent = sound.name;

  const indicator = document.createElement('span');
  indicator.className = 'playing-indicator';
  indicator.setAttribute('aria-hidden', 'true');

  btn.append(image, name, indicator);

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
  state.sounds.forEach((sound) => {
    fragment.appendChild(createSoundButton(sound));
  });
  dom.grid.appendChild(fragment);
  state.playing.forEach((soundId) => setButtonPlayingState(soundId, true));
}

/* -------------------------------------------------------------------------
 * 9. SETTINGS PANEL WIRING
 * ---------------------------------------------------------------------- */
function initSettingsPanel() {
  // Toggle expand/collapse.
  dom.settingsToggle.addEventListener('click', () => {
    const expanded = dom.settingsToggle.getAttribute('aria-expanded') === 'true';
    dom.settingsToggle.setAttribute('aria-expanded', String(!expanded));
    dom.settingsBody.hidden = expanded;
  });

  dom.customSoundsToggle.addEventListener('click', () => {
    const expanded = dom.customSoundsToggle.getAttribute('aria-expanded') === 'true';
    dom.customSoundsToggle.setAttribute('aria-expanded', String(!expanded));
    dom.customSoundsBody.hidden = expanded;
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
 * 10. CUSTOM SOUND MANAGEMENT
 * ---------------------------------------------------------------------- */
function renderLocalSoundList() {
  dom.localSoundList.replaceChildren();
  const localSounds = state.sounds.filter((sound) => sound.source === 'local');

  if (localSounds.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'local-sound-empty';
    empty.textContent = 'No sounds have been added to this device.';
    dom.localSoundList.appendChild(empty);
    return;
  }

  for (const sound of localSounds) {
    const row = document.createElement('div');
    row.className = 'local-sound-item';

    const details = document.createElement('span');
    details.className = 'local-sound-details';
    const image = createSoundImage(sound, 'local-sound-image');
    const label = document.createElement('span');
    label.textContent = sound.name;
    details.append(image, label);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove-local-sound';
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Remove ${sound.name}`);
    remove.addEventListener('click', async () => {
      remove.disabled = true;
      try {
        await deleteLocalSound(sound.id);
        stopSound(sound.id);
        state.audioPool.delete(sound.id);
        const objectUrl = state.audioObjectUrls.get(sound.id);
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        state.audioObjectUrls.delete(sound.id);
        const imageObjectUrl = state.imageObjectUrls.get(sound.id);
        if (imageObjectUrl) URL.revokeObjectURL(imageObjectUrl);
        state.imageObjectUrls.delete(sound.id);
        state.sounds = state.sounds.filter((entry) => entry.id !== sound.id);
        renderSoundGrid();
        renderLocalSoundList();
      } catch (err) {
        remove.disabled = false;
        console.error('Soundboard: could not remove local sound', err);
        showError(`Unable to remove "${sound.name}".`);
      }
    });

    row.append(details, remove);
    dom.localSoundList.appendChild(row);
  }
}

function createLocalSoundId() {
  if (typeof crypto.randomUUID === 'function') {
    return `local-${crypto.randomUUID()}`;
  }
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function setRecordingStatus(message, isRecording = false) {
  dom.recordingStatus.textContent = message;
  dom.recordingStatus.classList.toggle('is-recording', isRecording);
}

function clearRecording() {
  recordingBlob = null;
  if (recordingPreviewUrl) {
    URL.revokeObjectURL(recordingPreviewUrl);
    recordingPreviewUrl = null;
  }
  dom.recordingPreview.removeAttribute('src');
  dom.recordingPreview.load();
  dom.recordingPreview.hidden = true;
}

function stopRecordingStream() {
  if (!mediaRecorder) return;
  mediaRecorder.stream.getTracks().forEach((track) => track.stop());
}

function stopActiveRecording() {
  if (mediaRecorder?.state === 'recording') {
    mediaRecorder.stop();
  }
}

function getRecordingMimeType() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/mp4',
    'audio/webm',
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

function finishRecordingSession() {
  clearInterval(recordingTimerId);
  clearTimeout(recordingTimeoutId);
  recordingTimerId = null;
  recordingTimeoutId = null;
  stopRecordingStream();
  dom.startRecording.disabled = false;
  dom.stopRecording.disabled = true;
}

async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    showError('Audio recording is not supported by this browser.');
    return;
  }

  clearRecording();
  dom.customSoundFile.value = '';
  dom.startRecording.disabled = true;

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    dom.startRecording.disabled = false;
    console.error('Soundboard: microphone access failed', err);
    showError(err.name === 'NotAllowedError'
      ? 'Microphone permission was denied.'
      : 'Unable to access the microphone.');
    return;
  }

  const mimeType = getRecordingMimeType();
  try {
    mediaRecorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);
  } catch (err) {
    stream.getTracks().forEach((track) => track.stop());
    dom.startRecording.disabled = false;
    console.error('Soundboard: recorder creation failed', err);
    showError('Unable to start audio recording.');
    return;
  }

  recordingChunks = [];
  recordingFailed = false;
  mediaRecorder.addEventListener('dataavailable', (event) => {
    if (event.data.size > 0) recordingChunks.push(event.data);
  });
  mediaRecorder.addEventListener('stop', () => {
    finishRecordingSession();
    if (recordingFailed) return;
    if (recordingChunks.length === 0) {
      setRecordingStatus('No audio was captured. Try again.');
      return;
    }

    recordingBlob = new Blob(recordingChunks, {
      type: mediaRecorder.mimeType || 'audio/webm',
    });
    recordingPreviewUrl = URL.createObjectURL(recordingBlob);
    dom.recordingPreview.src = recordingPreviewUrl;
    dom.recordingPreview.hidden = false;
    setRecordingStatus('Recording ready. Preview it, then add an image.');
  }, { once: true });
  mediaRecorder.addEventListener('error', (event) => {
    recordingFailed = true;
    recordingChunks = [];
    finishRecordingSession();
    console.error('Soundboard: recording failed', event.error);
    showError('Recording failed. Please try again.');
  }, { once: true });

  try {
    mediaRecorder.start();
    recordingStartedAt = Date.now();
    dom.stopRecording.disabled = false;
    setRecordingStatus(`Recording… 0 / ${MAX_RECORDING_SECONDS}s`, true);
    recordingTimerId = setInterval(() => {
      const elapsed = Math.min(
        MAX_RECORDING_SECONDS,
        Math.floor((Date.now() - recordingStartedAt) / 1000)
      );
      setRecordingStatus(`Recording… ${elapsed} / ${MAX_RECORDING_SECONDS}s`, true);
    }, 250);
    recordingTimeoutId = setTimeout(stopActiveRecording, MAX_RECORDING_SECONDS * 1000);
  } catch (err) {
    recordingFailed = true;
    finishRecordingSession();
    console.error('Soundboard: recorder start failed', err);
    showError('Unable to start audio recording.');
  }
}

function initCustomSoundManager() {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    dom.startRecording.disabled = true;
    setRecordingStatus('Recording is not supported by this browser.');
  }

  dom.startRecording.addEventListener('click', startRecording);
  dom.stopRecording.addEventListener('click', stopActiveRecording);
  window.addEventListener('pagehide', stopActiveRecording);
  dom.customSoundFile.addEventListener('change', () => {
    if (dom.customSoundFile.files.length > 0) {
      clearRecording();
      setRecordingStatus(`Using ${dom.customSoundFile.files[0].name}`);
    }
  });

  dom.addCustomSound.addEventListener('click', async () => {
    if (mediaRecorder?.state === 'recording') {
      showError('Stop the recording before adding the sound.');
      return;
    }

    const uploadedFile = dom.customSoundFile.files[0];
    const audioBlob = recordingBlob || uploadedFile;
    const imageFile = dom.customSoundImage.files[0];
    if (!audioBlob) {
      showError('Choose an audio file or record a sound first.');
      return;
    }
    if (!imageFile) {
      showError('Choose an image for the sound.');
      return;
    }

    const supportedExtension = uploadedFile
      ? /\.(wav|mp3|ogg|m4a|aac|flac|webm)$/i.test(uploadedFile.name)
      : true;
    if (!audioBlob.type.startsWith('audio/') && !supportedExtension) {
      showError('Choose a supported audio file.');
      return;
    }

    const supportedImageType = ['image/png', 'image/jpeg', 'image/webp'].includes(imageFile.type);
    const supportedImageExtension = /\.(png|jpe?g|webp)$/i.test(imageFile.name);
    if (!supportedImageType && !supportedImageExtension) {
      showError('Choose a PNG, JPEG, or WebP image.');
      return;
    }

    const fallbackName = uploadedFile
      ? uploadedFile.name.replace(/\.[^.]+$/, '')
      : 'Recorded sound';
    const sound = {
      id: createLocalSoundId(),
      name: dom.customSoundName.value.trim() || fallbackName,
      imageBlob: imageFile,
      blob: audioBlob,
      source: 'local',
    };

    dom.addCustomSound.disabled = true;
    try {
      await saveLocalSound(sound);
      state.sounds.push(sound);
      renderSoundGrid();
      renderLocalSoundList();
      dom.customSoundName.value = '';
      dom.customSoundImage.value = '';
      dom.customSoundFile.value = '';
      clearRecording();
      setRecordingStatus(`Ready to record (${MAX_RECORDING_SECONDS} seconds max)`);
    } catch (err) {
      console.error('Soundboard: could not save local sound', err);
      showError('Unable to save that sound on this device.');
    } finally {
      dom.addCustomSound.disabled = false;
    }
  });
}

async function prepareRepositorySoundsForOffline(sounds) {
  const results = await Promise.allSettled(
    sounds.flatMap((sound) => [sound.file, sound.image]).map(async (asset) => {
      const response = await fetch(asset);
      if (!response.ok) {
        throw new Error(`${asset} returned HTTP ${response.status}.`);
      }
    })
  );

  if (results.some((result) => result.status === 'rejected')) {
    console.warn('Soundboard: some repository sounds could not be cached', results);
    showError('Some repository sounds are unavailable offline.');
  }
}

/* -------------------------------------------------------------------------
 * 11. STOP ALL BUTTON
 * ---------------------------------------------------------------------- */
function initStopAllButton() {
  dom.stopAllBtn.addEventListener('click', stopAllSounds);
}

/* -------------------------------------------------------------------------
 * 12. ONLINE / OFFLINE STATUS
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
 * 13. PWA INSTALLATION
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
 * 14. SERVICE WORKER REGISTRATION
 *     Uses a relative path so it works under any GitHub Pages sub-path
 *     (e.g. https://username.github.io/soundboard/).
 * ---------------------------------------------------------------------- */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener('load', async () => {
    // Relative path + relative scope keeps this portable across sub-paths.
    try {
      const registration = await navigator.serviceWorker.register(
        'service-worker.js',
        { scope: './', updateViaCache: 'none' }
      );
      await registration.update();

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          registration.update().catch((err) => {
            console.warn('Soundboard: service worker update check failed', err);
          });
        }
      });
    } catch (err) {
      console.warn('Soundboard: service worker registration failed', err);
    }
  });
}

/* -------------------------------------------------------------------------
 * 15. INIT
 * ---------------------------------------------------------------------- */
async function init() {
  loadSettings();
  initSettingsPanel();
  initCustomSoundManager();
  initStopAllButton();
  initOnlineStatus();
  initInstallFlow();
  registerServiceWorker();

  let repositorySounds = [];
  let localSounds = [];

  try {
    repositorySounds = await loadRepositorySounds();
  } catch (err) {
    console.error('Soundboard: could not load repository sounds', err);
    showError('Unable to load the repository sound catalog.');
  }

  try {
    localSounds = await loadLocalSounds();
  } catch (err) {
    console.error('Soundboard: could not load local sounds', err);
    showError('Unable to load sounds saved on this device.');
  }

  state.sounds = [...repositorySounds, ...localSounds];
  renderSoundGrid();
  renderLocalSoundList();
  await prepareRepositorySoundsForOffline(repositorySounds);
}

document.addEventListener('DOMContentLoaded', () => {
  init().catch((err) => {
    console.error('Soundboard: initialization failed', err);
    showError('Soundboard could not finish starting.');
  });
});
