# RAPFI Gomoku engine

Local install lives in `rapfi-extract/` (gitignored binaries).

## Already set up on this machine

1. Extracted RAPFI 2025-06-15 into `server/engines/rapfi-extract/`
2. Windows AVX2 binary aliased as `pbrain-rapfi.exe`
3. `server/.env` has `RAPFI_PATH` pointing at that binary

Restart the Node server after changing env:

```bash
npm run server
```

## Fresh machine

1. Download [Rapfi-engine.7z](https://github.com/dhbloo/rapfi/releases/download/250615/Rapfi-engine.7z)
2. Extract into `server/engines/rapfi-extract/`
3. Copy `pbrain-rapfi-windows-avx2.exe` → `pbrain-rapfi.exe` (or set `RAPFI_PATH`)
4. Keep `config.toml` and `*.bin.lz4` / `model210901.bin` next to the exe

Without RAPFI, Gomoku falls back to the built-in JS AI.
