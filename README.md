# Soundboard

A static, installable soundboard that works offline and can be hosted on GitHub Pages.

## Add sounds for everyone

1. Copy the audio file into `sounds/` and its image into `images/sounds/`.
2. Add an entry to `sounds.json`:

   ```json
   { "id": "my-sound", "name": "My Sound", "image": "images/sounds/my-sound.png", "file": "sounds/my-sound.mp3" }
   ```

The `id` must be unique and contain only lowercase letters, numbers, and hyphens. Commit and deploy both files. The service worker reads the catalog and caches every listed sound for offline playback.

## Add sounds on one device

Open **Settings → Custom Sounds**, choose an audio file and a PNG, JPEG, or WebP image, then select **Add to this device**. Both files are stored in that browser's IndexedDB database. They are not uploaded or committed and do not appear on other devices or in other browsers.

Instead of choosing an audio file, select **Record**, grant microphone access, and record up to 30 seconds. Stop and preview the recording, choose an image, then add it to the device. Microphone recording requires HTTPS or localhost.

Clearing the site's browser data also removes device-only sounds.

## Run locally

```powershell
python -m http.server 8000
```

Open <http://localhost:8000>. Service workers do not run when `index.html` is opened directly.

## App updates

The installed app checks for a service-worker update when it starts and whenever it returns to the foreground. When a new version activates, the app reloads once automatically. JavaScript and CSS use the network when available and fall back to the offline cache.
