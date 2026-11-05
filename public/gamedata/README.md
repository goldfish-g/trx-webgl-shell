# Game data the server offers

`manifest.json` lists the archives the New profile dialog offers to
download. Each entry reads:

```json
{
    "id": "tr2",
    "mod": "tr2",
    "engine": 2,
    "name": "Tomb Raider II",
    "url": "/gamedata/tr2.zip",
    "sizeBytes": 266765151
}
```

- `id` names the entry. The library remembers which entries it holds.
- `mod` is the directory the engine reads the game from, `games/<mod>/`.
- `engine` is 1 to 4, for TR1 to TR4.
- `url` may point anywhere the page is allowed to fetch from. Servers that
  answer Range requests let interrupted downloads resume.

An archive is a zip, tar or tar.gz. Its files may already be laid out as
`games/<mod>/…`; otherwise they are sorted by kind, as uploads are.

The archives are gitignored: they are large, and the games are copyrighted.
