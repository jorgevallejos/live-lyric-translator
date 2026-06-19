# Media assets — video path strategy & delivery spec

_Decided 2026-06-19. How the app references animation videos (portable, multi-user) and what video format to feed it. Consumed by Prompt D (VIDEO mode) and D-wire (wiring a song). Videos live outside the repo at the Chango Pepper root `animations/…` and must never be committed._

## Path strategy — portable reference, local resolution

A video is a heavy local asset; the song is small portable data. Keep them separate so another user (with their own copy of the video) can use the same song file.

- **Song JSON stores only a logical reference**, no absolute path:
  `media: { type: "video", src: "tragedia-de-cerdo-asado.mp4", offset?: number, trimStart?: number }`
  `src` is a filename/key, not a path. The JSON stays portable across machines and users.
- **The absolute path lives in local app settings** (the same local-state layer as the display profile), as a mapping `media key (src) → resolved absolute path`. Not in the shared JSON.
- **The user links it once** via a file picker (Electron open-file dialog). The app remembers the resolved path for that `src`.
- **Graceful re-link:** if a song loads and its video isn't found at the remembered path (moved file, new machine, fresh import), show a "Locate video…" prompt rather than failing. Re-linking updates the local mapping.

Net: no hardcoded paths; JSON portable; absolute path is per-user local state; missing files degrade gracefully.

## Delivery format — feed the app a web-playable encode, not an editing master

Electron renders with Chromium, which plays compressed delivery codecs but **not** ProRes. Always feed a delivery MP4; keep ProRes `.mov` as archival only, out of the app.

- **Container/codec:** MP4, H.264 (universally hardware-decoded). H.265/WebM acceptable; H.264 is the safe default.
- **Resolution:** ≤ 1080p (ample for any projector; 4K is wasted bytes).
- **Bitrate / size:** ~5–10 Mbps. Reference: the current clean master `Tragedia de Cerdo Asado.mp4` is 89 MB / 159.5 s (~4.7 Mbps) — ideal.
- **Audio:** keep an audio track (used to generate timeline cues), but projection **mutes** it — the audience hears the live performance.

The app should validate on import (or link) and **warn** on a non-web-friendly file (ProRes/MOV, very large size, >1080p), without hard-blocking.

## Production note

When the produced master + adjusted animation exist (late June), the deliverable to the app is a fresh **1080p H.264 MP4**, not the editing master. Regenerate the song `timeline` against that new video (one capture/alignment pass) — don't hand-tune to the provisional one.
