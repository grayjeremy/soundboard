# Sounds Folder

Place repository-managed audio files here. The included WAV files are
original synthesized placeholder effects. Replace them with audio you have
the right to distribute before shipping your own soundboard.

## Requirements for audio files

- **Format:** MP3 and WAV both work in all modern browsers. WAV is used here
  because it requires no external encoder to generate. Feel free to convert
  to MP3/OGG for smaller file sizes.
- **Naming:** Use short, lowercase names that match the `file` path in
  `sounds.json`.
- **Size:** Keep files small (a few hundred KB each) since everything is
  cached for offline use — large libraries will increase install/cache time
  and consume more device storage.
- **Licensing:** Make sure you have the rights to use any audio you add
  (royalty-free sound libraries such as freesound.org, Mixkit, or Zapsplat
  are good sources — always check each sound's specific license).

## Adding a new sound

1. Add the audio file here and its image under `images/sounds/`.
2. Add both paths to `sounds.json`:
   ```json
   { "id": "my-sound", "name": "My Sound", "image": "images/sounds/my-sound.png", "file": "sounds/my-sound.wav" }
   ```
3. Bump `CACHE_VERSION` in `service-worker.js`. The worker reads the catalog
   and precaches every listed audio and image asset automatically.
