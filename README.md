# TRX WebGL Shell (reference frontend)

Reference React frontend for the [TRX WebGL engine](../TRX). Demonstrates
how to consume the engine's adapter contract (`createTRX` /
`Module.trxAdapters`) and layers on:

- A **Library** screen showing one card per profile.
- User-supplied game data imports (folder picker, `.zip`, `.tar.gz`).
- **Multi-version engine support**: each profile is pinned to the engine
  version that created it. Breaking engine changes don't strand old
  profiles.
- Save/config persistence via IDBFS (per `/persist/<mod>`).

## Layout

```
public/
  engines/<version>/      Engine artifact (trx-adapter.{js,d.ts} +
                          trx-engine.js + TRX.{wasm,data})
  gamedata-shipped/       Optional default data (manifest.json + archives)
src/
  engine-loader/          Dynamic load of /engines/<ver>/trx.js
  db/                     IndexedDB wrapper (idb)
  gamedata/               Library state machine, tar.gz extraction
  profiles/               Profile CRUD
  adapters/               Concrete TrxAdapters implementation
  ui/                     React components (Library, Play, dialogs)
```

## Running

```bash
pnpm install
pnpm dev
```

The dev server sets COOP/COEP headers (required for SharedArrayBuffer /
pthreads). Open http://localhost:5173/ and follow the Library UI.

## Adding an engine build

```bash
# From the TRX repo, build the engine:
./tools/build_webgl.sh release

# Then copy the artifact in:
mkdir -p public/engines/1.5.0
cp ../TRX/build/webgl/{trx-adapter.js,trx-adapter.d.ts,trx-engine.js,TRX.wasm,TRX.data} \
   public/engines/1.5.0/
```

The `public/engines/manifest.json` lists available versions. Edit it
when you drop a new version in.
