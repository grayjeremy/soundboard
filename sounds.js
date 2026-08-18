/* =========================================================================
   Soundboard — sounds.js
   Edit THIS file to add, remove, or reorder sounds. The UI in app.js
   regenerates automatically from this array — no other code changes are
   required to customize your soundboard.

   Each entry needs:
     id   - unique string (no spaces), used internally
     name - display label shown on the button
     icon - any emoji (optional; a default 🔊 is shown if omitted)
     file - relative path to the audio file (mp3/wav/ogg all work)

   NOTE: If you add or rename a sound file, also update PRECACHE_URLS in
   service-worker.js and bump CACHE_VERSION so it's cached for offline use.
   ========================================================================= */

'use strict';

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
