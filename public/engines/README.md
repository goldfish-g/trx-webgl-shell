# Engine builds

Each `<version>/` directory holds one TRX WebGL build, as `just
trx-package-webgl` in the TRX repository packages it:

```
<version>/
  trx-adapter.js
  trx-adapter.d.ts
  trx-engine.js
  TRX.wasm
  TRX.data
```

The version directories are gitignored. List each one in `manifest.json`,
which is tracked. Profiles keep the version they were made with, so a new
build never changes an existing profile's game.
