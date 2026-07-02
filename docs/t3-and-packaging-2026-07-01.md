# T3 (beat↔auto dependency) + Packaging P1 (local .dmg) — dispatch (2026-07-01, Round 6)

Paste into **Claude Code at the repo**, Opus coordinator. R1–R3 merged (PRs #44–#46). Two items: **T3** (small UI/logic) and **Packaging P1** (a local-run installable app). Run T3 first, then Packaging.

## Run mode
Bypass mode (`claude --dangerously-skip-permissions` / VS Code auto-run), no per-command prompts, `deny` list is the backstop. **T3 auto-merges on green.** Packaging: do the config + produce the `.dmg` autonomously and auto-merge the config PR once tests pass and `electron-builder` completes without error — but the **final install-and-run check is Jorge's** (it's a binary he launches), so hand back the `.dmg` path and a short test checklist rather than calling it verified.

---

## T3 — Beat indicator OFF disables Auto (one-directional)

Full spec: `docs/toggle-and-auto-transition-2026-07-01.md` → "T3". Recap of the **decided** behaviour:

- When **Beat indicator is OFF**: **disable the Auto option** in the Transitions toggle (greyed, not selectable) and force **Manual**. Show a small hint (tooltip or a tiny link glyph between the controls): "Auto needs the beat indicator on."
- Turning Beat **ON** re-enables Auto and restores the song's default advance mode.
- **One-directional:** selecting Auto does **not** change the beat. No reverse coupling.
- Start with a **screenshot** of the disabled + hint styling on the PR for Jorge; it can still auto-merge on green (he reviews after).

**Files.** `src/App.tsx` (Transitions toggle: disable Auto + hint when `!beatIndicatorOn`; force Manual), `src/control.css` (disabled/hint styling), `ControlView.test.tsx` (assert Auto disabled + Manual forced when beat off; re-enabled when beat on).

---

## Packaging P1 — local-run installable `.dmg` (no signing)

**Goal.** Produce an installable macOS `.dmg`/`.app` Jorge can run on his own Macs (right-click → Open past Gatekeeper). **No Apple Developer account, no signing, no notarization** (that's a later, separate doc — see P2 stub). Get a working app in hand.

**Current gaps (verified in `package.json` / `build`):**
- `pack` = `electron-builder --mac` but **doesn't build the renderer first**.
- mac `target` is **`zip`**, not `dmg`.
- **No `build.files`** allowlist, **no icon**, no `dmg` config.
- Good news already in place: `main` = `electron/main.cjs`, production loads `dist/index.html`, and the **`media://` protocol is registered and confirmed working packaged** — don't disturb it.

**Do:**
1. **Chain the build:** make packaging run the renderer build first — e.g. `"pack": "npm run build && electron-builder --mac"` (or a `prepack`). Confirm `dist/` is produced and included.
2. **`build.files`:** explicitly include what the app needs at runtime — `dist/**/*`, `electron/**/*`, `package.json` (electron-builder handles prod `node_modules`). Verify the renderer's runtime fetches resolve in the packaged app: `/chango-pepper-logo.png`, `/end-card.md`, and any other `public/` assets must ship in `dist/`.
3. **App icon:** generate a proper `.icns` from the Chango Pepper logo (`~/Chango Pepper/assets/logo/`) — a 1024×1024 PNG → `build/icon.icns` (or `build/icon.png` for electron-builder to convert). Pick the logo variant that reads well as an app icon on both light/dark docks; **screenshot the icon on the PR** for Jorge to approve.
4. **Target `dmg`:** switch mac `target` from `zip` to `dmg` (keep `zip` too if trivial). Set a sensible `productName`/`artifactName` and `dmg` title.
5. **Unsigned is fine:** no entitlements/hardened-runtime needed without signing. Ensure the build does **not** attempt to sign (no identity) so it completes on a machine without certs — set `mac.identity: null` if electron-builder tries to auto-sign.
6. **Bump `version`** from `0.1.0` if appropriate (optional).
7. **Build it:** run `npm run pack`, confirm a `.dmg` lands in `release/` with no errors.

**Songs/media note:** the app resolves media from absolute on-disk paths via `media://` and reads the song library from its usual location — for a **local** build that's fine (files stay on Jorge's disk). Don't try to bundle the songs/animations into the app; just confirm a linked video still plays in the packaged app.

**Hand back to Jorge (his verification, not auto-claimed):**
- Path to the built `.dmg` in `release/`.
- A short checklist: install → right-click Open (Gatekeeper) → Control + Projection windows open → WS sync works → a linked video plays (media://) → projector/second-screen works → beat/auto/manual all behave.

**Files.** `package.json` (`scripts.pack`, `build.files`, `build.mac.target`/`icon`/`identity`, `dmg`), `build/` (icon), no `src` logic changes expected.

---

## P2 stub — signing + notarization (LATER, separate doc)

Not now. When Jorge has an **Apple Developer account** ($99/yr): Developer ID Application cert, code signing, hardened-runtime **entitlements** (allow the `media://` custom protocol + JIT if needed), and **notarization** (`notarytool` with an app-specific password or API key), plus stapling. Produces a distributable `.dmg` others install with no warnings. Coordinator to write this as its own dispatch when Jorge's credentials exist.

## Queue
T3 (auto-merge on green) → Packaging P1 (config auto-merges on green + `.dmg` produced; Jorge installs & tests). Then P2 whenever the Apple account is ready.
