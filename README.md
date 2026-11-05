# TRX WebGL Shell

A web front end for the [TRX](../TRX) engine's browser build. It keeps a
library of game data and profiles, and runs the engine through the adapter
contract in TRX's `tools/shared/emscripten/trx-adapter.d.ts`.

- **Profiles** play one game each, with saves and settings of their own,
  and keep the engine version they were made with.
- **Game data** comes from the server's catalog, from an archive or a
  folder on the device, or (behind `FEATURES.linkSources`) from a link.
  Downloads resume where they stopped, across reloads and dropped
  connections.
- **Engine builds** download once per version and stay in the browser.
- **Input** comes from the keyboard, gamepads, or the engine's own touch
  controls.

## Running

```bash
pnpm install
pnpm dev
```

The engine runs threads, which need `SharedArrayBuffer`. Browsers offer it
only to pages served over HTTPS (or from localhost) with the
`Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp` headers. The dev and preview
servers send both.

```bash
pnpm test        # unit tests
pnpm typecheck
pnpm build       # production build in dist/
```

## Serving

`public/engines/` holds the engine builds, one directory per version, listed
in `public/engines/manifest.json`. `public/gamedata/` holds the archives the
server offers, listed in `public/gamedata/manifest.json`. The README in each
describes its layout. Whatever serves the build must send the two headers
above, and should answer Range requests, so that downloads resume.

## Layout

```
src/
  games/      the games the engine plays, and how to recognise their files
  gamedata/   the library's game data: imports, layout, storage
  profiles/   profiles and where their saves live
  engine/     loading the engine, its adapters, and running a session
  lib/        downloads, archives and the database, independent of the rest
  library/    the library screen
  play/       the play screen
  ui/         shared components
```

Each play session starts with a full page load, so every session gets a
fresh engine. Game data lives in IndexedDB, one record per file. A profile's
saves live in IndexedDB databases of their own, named
`/profiles/<profile>/<mod>`, which the engine sees at `/persist/<mod>`.
