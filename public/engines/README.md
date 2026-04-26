# Engine artifacts

Each `<version>/` subdirectory holds one TRX WebGL engine build:

```
<version>/
  trx-adapter.js
  trx-adapter.d.ts
  trx-engine.js
  TRX.wasm
  TRX.data
```

Version directories are gitignored — large binary artifacts produced by
`tools/build_webgl.sh` in the [TRX](../../../TRX) repo. Drop new builds
in here locally, then list them in `manifest.json` (which **is**
tracked).

See the repo root [README](../../README.md) for the copy-in command.
