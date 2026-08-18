# Sounds Folder

Place your audio files here. The included files (`airhorn.wav`, `bell.wav`,
`clap.wav`, `drum.wav`, `laugh.wav`, `siren.wav`, `whistle.wav`, `ding.wav`)
are small, synthesized placeholder sound effects generated locally — they are
not licensed audio recordings, and you should replace them with your own
sounds before shipping a real project.

## Requirements for audio files

- **Format:** MP3 and WAV both work in all modern browsers. WAV is used here
  because it requires no external encoder to generate. Feel free to convert
  to MP3/OGG for smaller file sizes.
- **Naming:** Use short, lowercase, hyphen/underscore-free names that match
  the `file` path referenced in each entry of the `sounds` array in `app.js`.
- **Size:** Keep files small (a few hundred KB each) since everything is
  cached for offline use — large libraries will increase install/cache time
  and consume more device storage.
- **Licensing:** Make sure you have the rights to use any audio you add
  (royalty-free sound libraries such as freesound.org, Mixkit, or Zapsplat
  are good sources — always check each sound's specific license).

## Adding a new sound

1. Drop the audio file into this folder (e.g. `sounds/my-sound.wav`).
2. Add an entry to the `sounds` array in `sounds.js`:
   ```js
   { id: 'my-sound', name: 'My Sound', icon: '🎵', file: 'sounds/my-sound.wav' }
   ```
3. Add the same relative path to `PRECACHE_URLS` in `service-worker.js` so
   it's available offline immediately after install.
4. Bump `CACHE_VERSION` in `service-worker.js` so the browser picks up the
   change (see the main [README](../README.md) for details).
