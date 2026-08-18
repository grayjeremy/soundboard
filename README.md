# 🔊 Soundboard

A customizable, installable, fully offline-capable soundboard — built with
**only HTML5, CSS3, and vanilla JavaScript (ES6+)**. No build step, no
frameworks, no server, no database. Just static files you can host on
[GitHub Pages](https://pages.github.com/).

---

## Table of Contents

1. [Features](#features)
2. [Project Structure](#project-structure)
3. [Creating the GitHub Repository](#creating-the-github-repository)
4. [Publishing with GitHub Pages](#publishing-with-github-pages)
5. [Adding Sounds](#adding-sounds)
6. [Replacing Sounds](#replacing-sounds)
7. [How Caching Works](#how-caching-works)
8. [Updating the Service Worker](#updating-the-service-worker)
9. [Installing the App](#installing-the-app)
10. [Testing Offline Functionality](#testing-offline-functionality)
11. [Accessibility](#accessibility)
12. [Settings & Local Storage](#settings--local-storage)
13. [Troubleshooting](#troubleshooting)
14. [Future Expansion Ideas](#future-expansion-ideas)

---

## Features

- 🎛️ Responsive grid of large, rounded sound buttons — looks great on phone,
  tablet, and desktop.
- ⚡ Instant playback, restart-from-start on repeat taps, single-sound or
  multi-sound overlap modes.
- 🔁 Optional looping of the currently playing sound.
- 🔊 Master volume control, persisted with `localStorage`.
- ⏹️ One-tap "Stop All Sounds" button.
- 🌓 Automatic light/dark theme via `prefers-color-scheme`.
- 🕶️ Reduced-motion friendly via `prefers-reduced-motion`.
- 📶 Live online/offline status indicator.
- 📲 Installable as a native-like app (Add to Home Screen / desktop install),
  including custom install button using `beforeinstallprompt` and iOS
  instructions fallback.
- 🗄️ Fully offline after first visit via a Service Worker + Cache API.
- ♿ Full keyboard support (Enter/Space) and ARIA state management
  (`aria-pressed`, `aria-invalid`, `role="alert"`).
- 🧩 Add/remove/reorder sounds by editing a single JavaScript array.

---

## Project Structure

```
soundboard/
├── index.html              # App markup (semantic HTML5)
├── styles.css               # All styling, using CSS custom properties
├── sounds.js                  # The `sounds` array — edit this to customize
├── app.js                    # All application logic (vanilla JS)
├── service-worker.js         # Offline caching logic
├── manifest.webmanifest      # PWA install metadata
├── README.md                  # This file
├── icons/
│   ├── icon-192.png
│   └── icon-512.png
└── sounds/
    ├── README.md              # Notes on the audio files
    ├── airhorn.wav
    ├── bell.wav
    ├── clap.wav
    ├── drum.wav
    ├── laugh.wav
    ├── siren.wav
    ├── whistle.wav
    └── ding.wav
```

---

## Creating the GitHub Repository

1. Go to [github.com/new](https://github.com/new).
2. Name the repository `soundboard` (or any name you like — just remember
   the name affects your Pages URL).
3. Choose **Public** (required for free GitHub Pages hosting) and click
   **Create repository**.
4. On your computer, initialize and push this project:

   ```bash
   cd soundboard
   git init
   git add .
   git commit -m "Initial commit: Soundboard PWA"
   git branch -M main
   git remote add origin https://github.com/<your-username>/soundboard.git
   git push -u origin main
   ```

---

## Publishing with GitHub Pages

1. In your repository on GitHub, go to **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **Deploy from a branch**.
3. Under **Branch**, select `main` and folder `/ (root)`, then click **Save**.
4. Wait a minute or two, then visit the URL GitHub shows you — typically:

   ```
   https://<your-username>.github.io/soundboard/
   ```

5. That's it — no build step is required. Every file in this repo is served
   as-is.

> **Why relative paths matter:** This project deliberately uses relative
> paths everywhere (`href="styles.css"`, `src="sounds/bell.wav"`,
> `register('service-worker.js')`, `"start_url": "./index.html"`, etc.)
> instead of paths starting with `/`. That's what makes it work correctly
> whether it's hosted at the domain root or at a sub-path like
> `/soundboard/`, which is how GitHub Pages project sites work.

---

## Adding Sounds

1. Copy your audio file into the `sounds/` folder, e.g. `sounds/laser.wav`.
2. Open `sounds.js` and add a new entry to the `sounds` array:

   ```js
   const sounds = [
     // ...existing sounds...
     { id: 'laser', name: 'Laser', icon: '🔫', file: 'sounds/laser.wav' },
   ];
   ```

   - `id` — unique string, used internally (no spaces).
   - `name` — the label shown on the button.
   - `icon` — any emoji (optional; a default 🔊 is shown if omitted).
   - `file` — relative path to the audio file.

3. The button grid **regenerates automatically** from this array — no other
   code changes are needed.
4. Add the same file path to `PRECACHE_URLS` in `service-worker.js` so it's
   available offline right after install, then bump `CACHE_VERSION` (see
   [Updating the Service Worker](#updating-the-service-worker)).

## Replacing Sounds

To replace an existing sound, simply overwrite the file in `sounds/` with a
new file **of the same name**, or update the `file` path in the `sounds`
array in `sounds.js` to point at a new filename. Either way, remember to
bump `CACHE_VERSION` in `service-worker.js` so users' browsers pick up the
new file instead of serving a stale cached copy.

To remove a sound, delete its entry from the `sounds` array (and optionally
delete the file and its `PRECACHE_URLS` entry).

To reorder sounds, simply reorder the entries in the `sounds` array — the
grid always reflects array order.

---

## How Caching Works

This app uses the [Cache API](https://developer.mozilla.org/en-US/docs/Web/API/Cache)
via a Service Worker (`service-worker.js`) to make itself work fully offline:

1. **Install:** When the service worker is first installed, it downloads and
   stores every file listed in `PRECACHE_URLS` (HTML, CSS, JS, manifest,
   icons, and all sound files) into a versioned cache
   (`soundboard-cache-v1`).
2. **Fetch:** For every subsequent network request the page makes, the
   service worker intercepts it:
   - If a cached response exists, it's served **immediately** (fast, and
     works offline).
   - In parallel, it also fetches from the network to refresh the cache in
     the background ("stale-while-revalidate"), so you'll get updates on a
     later visit even without bumping the cache version.
   - If there's no cached response and the network is unavailable, the
     request simply fails gracefully — `app.js` already handles a missing or
     broken audio file without crashing (showing "Unable to play this
     sound.").
3. **Activate:** Whenever a new service worker version activates, it deletes
   any old `soundboard-cache-*` caches so storage doesn't grow unbounded.

---

## Updating the Service Worker

Whenever you change **any** cached file (HTML, CSS, JS, icons, or sounds),
you must bump the cache version so browsers fetch the new versions instead
of continuing to serve old cached files:

1. Open `service-worker.js`.
2. Increment the version string:

   ```js
   const CACHE_VERSION = 'v2'; // was 'v1'
   ```

3. If you added/removed/renamed any files, also update the `PRECACHE_URLS`
   array to match.
4. Commit and push. The next time a returning visitor opens the app, the
   browser will detect the new service worker file (byte-for-byte diff),
   install it in the background, and activate it — deleting the old cache
   automatically.

> Browsers check for service worker updates whenever the page is loaded (at
> most once every 24 hours) and won't activate the new worker until the old
> one is no longer controlling any open tab. Closing and reopening the app
> (or waiting a moment and reloading) ensures the update takes effect.

---

## Installing the App

### Android / Desktop Chrome, Edge, and other Chromium browsers

- An **"⬇ Install App"** button appears automatically once the browser
  fires its `beforeinstallprompt` event (usually after a short engagement
  with the site).
- Tap/click it, confirm the prompt, and the app installs like a native app,
  launching in its own standalone window with no browser UI.

### iOS Safari

iOS does not support `beforeinstallprompt`, so the app instead shows a
message:

> 📱 To install: tap **Share** then **Add to Home Screen**.

Follow those steps in Safari's share sheet to install.

### Confirming installation

Once running in standalone/installed mode, the **Installation Status**
indicator in the header switches to "Installed".

---

## Testing Offline Functionality

1. Open the app in your browser at least once while online, so the service
   worker installs and pre-caches all assets. Watch for the "Online" status
   pill to confirm connectivity.
2. **Chrome/Edge DevTools:** Open DevTools → **Application** tab →
   **Service Workers**, confirm the worker is "activated and is running",
   then check the **Offline** checkbox (or use the Network tab's throttle
   dropdown → "Offline").
3. Reload the page. The app should load fully and every sound button should
   still play — the "Offline" status pill should also update.
4. Alternatively, turn off Wi-Fi/data on your phone after the first visit
   and relaunch the installed app icon.
5. To simulate a broken file, temporarily rename a file in `sounds/` and
   confirm you see the friendly error message rather than a crash.

---

## Accessibility

- Every sound button has `role="button"`, `tabindex="0"`, and a descriptive
  `aria-label` (e.g. "Play Air Horn sound").
- **Keyboard:** Both `Enter` and `Space` activate a button exactly like a
  click/tap; `Space` calls `preventDefault()` so the page doesn't scroll.
- **Focus:** Playing, stopping, or erroring never moves keyboard focus.
- **State:** `aria-pressed="true"` while a sound plays, `"false"` when idle;
  `aria-invalid="true"` is set on a button if its sound fails to play.
- **Errors:** Announced via a `role="alert"` / `aria-live="assertive"`
  region without moving focus.
- **Stop All** and **Install** buttons have their own explicit `aria-label`s.
- Respects `prefers-reduced-motion` (disables/shortens animations) and
  `prefers-color-scheme` (dark mode).

---

## Settings & Local Storage

The Settings panel (⚙) lets you configure:

- **Master Volume** — 0–100%, applied to all sounds immediately, including
  currently playing ones.
- **Allow Multiple Sounds** — when off (default), starting a new sound stops
  any other currently playing sound. When on, sounds can overlap freely.
- **Loop Current Sound** — when on, a played sound loops continuously until
  stopped (via its own button, "Stop All", or switching this setting off).

All three settings are saved to `localStorage` under the key
`soundboard.settings.v1` and restored automatically on the next visit.

---

## Troubleshooting

**Install button never appears.**
`beforeinstallprompt` only fires in Chromium-based browsers, only over
HTTPS (GitHub Pages is HTTPS by default), and only after basic PWA
installability criteria are met (valid manifest, registered service worker,
icons present). It also won't fire again if you've already dismissed it
recently in some browsers, or if the app is already installed. Firefox and
Safari do not support this event at all — Safari users see the manual "Add
to Home Screen" instructions instead.

**A sound button shows the error message.**
The audio file may be missing, unsupported, or blocked. Confirm the `file`
path in the `sounds` array in `app.js` matches an actual file under
`sounds/`, and that the format (e.g. `.wav`/`.mp3`) is one your browser
supports.

**Changes aren't showing up after I push an update.**
You likely forgot to bump `CACHE_VERSION` in `service-worker.js` — see
[Updating the Service Worker](#updating-the-service-worker). Also try a hard
refresh (Ctrl/Cmd+Shift+R) and check DevTools → Application → Service
Workers to make sure the new worker has activated.

**The app 404s on GitHub Pages but works locally.**
Make sure every path in `index.html`, `app.js`, `service-worker.js`, and
`manifest.webmanifest` is relative (no leading `/`). This repo already
follows that rule — if you add new files/paths, do the same.

**Volume/settings reset unexpectedly.**
Some browsers clear `localStorage` for sites in Private/Incognito mode when
the window closes, or if the user manually clears site data. This is
expected browser behavior, not a bug.

**Sounds don't autoplay after page load without interaction.**
This is expected: browsers require a user gesture (tap/click/keypress)
before allowing audio playback. The soundboard is designed around
tap-to-play, so this restriction doesn't affect normal use.

---

## Future Expansion Ideas

The codebase is intentionally modular so these can be added without a
rewrite:

- **Categories** — group `sounds` entries by a `category` field and render
  multiple `<section>`s.
- **Favorites** — store favorite IDs in `localStorage`, similar to
  `settings`.
- **Search** — filter the rendered grid based on a text input matching
  `sound.name`.
- **Sound packs** — load additional `sounds`-shaped arrays from separate
  JS/JSON files and merge them.
- **Playlists** — sequence multiple sound IDs with a "play next" queue.
- **Keyboard shortcuts** — map number/letter keys to specific `sound.id`s in
  a new keydown listener.
- **Random playback** — add a "Shuffle" mode that picks a random entry from
  `sounds`.
- **Multiple pages** — paginate or lazy-render the grid for very large
  sound libraries.
- **Themes** — extend the CSS custom properties in `:root` with named theme
  classes beyond just light/dark.

---

## License

This project's code is provided as-is for you to use, modify, and deploy
freely. The placeholder audio files in `sounds/` are simple synthesized
tones generated for demonstration purposes — replace them with properly
licensed audio before distributing your own soundboard.
