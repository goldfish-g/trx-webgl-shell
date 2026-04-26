# Shipped gamedata

Optional default game data archives, served alongside the shell so the
Library has something to import out of the box.

`*.tar.gz` archives are gitignored (large binaries, and TR game content
is copyrighted). Provide them locally and list them in `manifest.json`
(which **is** tracked) with `id`, `mod`, `engine`, `name`,
`description`, `url`, and `sizeBytes`.
