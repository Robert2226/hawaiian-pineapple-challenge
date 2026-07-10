# Tier 1 — Local high score, combo, waves, native hazards, challenge links

Client-side only (no server). Persistence via `localStorage`; social sharing via
URL-encoded "challenge links". Ships to the public link as **v2.0** after
localhost review.

**Locked decisions:**
- Difficulty = **waves with banners** (clear a wave → breather → "Wave N!").
- Shooting a protected native = **lose points + break combo** (+ sad sfx).
- Player name = **ask once, remember in localStorage**; used for high score + challenge links.

All game logic in `game.js`. Browser-API UI (text input, share/clipboard) uses a
small DOM overlay in `index.html` + `style.css`. Reuses existing patterns:
`localStorage` (like `hpc_muted`), the `sfx` object, `roundRectPath()`, the
`STATE` machine, `reset()`, and the `window.HPC` debug hook.

## Build order (each step = its own local commit + localhost verify)

### T1.1 — HUD redesign + local high score
- `localStorage` key `hpc_best`. On GAMEOVER, save if `score > best`.
- Redesign `drawHUD()`: Score (top-left), 🏆 Best beside it, lives (top-right),
  keep mute button; leave room for combo + wave readouts.
- Show Best on title + game-over screens. Add `best` to `window.HPC`.

### T1.2 — Player name (ask once)
- `localStorage` key `hpc_name`. If missing on load, show DOM `#name-form`
  over the start screen; save on submit. Default "Player". Greet on title.

### T1.3 — Combo system + readout
- `combo`; multiplier `mult = 1 + floor(combo/3)`.
- On pineapple hit: `combo++`, `score += 10 * mult`.
- Reset `combo` on a miss (pineapple lands) or on shooting a native.
- HUD: show 🔥 x{mult} when `combo >= 3`. Reset in `reset()`. Expose in HPC.

### T1.4 — Waves + difficulty + banners
- Wave model: `wave`, `toSpawn`, inter-wave `breatherTimer`.
- Scaling (tunable): size `= 4 + wave*2`, interval `= max(0.5, 1.4 - wave*0.12)`,
  fall speed grows slightly per wave.
- Clear wave → ~2s "Wave N!" banner → next wave. `sfx.wave()`.
- HUD: Wave N. Reset in `reset()`. Expose in HPC.

### T1.5 — Native "don't-shoot" hazards
- Falling natives (emoji via `ctx.fillText`): 🐢 honu, 🦆 nēnē, 🦭 monk seal, 🌺 hibiscus.
- ~15% of spawns early, rising per wave.
- Shot → `score -= 15` (floor 0), `combo = 0`, `sfx.penalty()`, red burst, shake.
- Lands safely → despawn, no penalty. Clear in `reset()`. Expose count in HPC.

### T1.6 — Challenge links
- Read `?c=` on load (`btoa(name~score)`); show "🍍 {name} challenges you to beat {score}!".
- Game-over DOM button "🏝️ Challenge a friend" builds the URL; uses
  `navigator.share` (mobile) or clipboard copy + toast (desktop).
- If run was an incoming challenge, show beat/not-beat result on game over.

## Files touched
- `game.js` (bulk), `index.html` (`#ui-overlay`: name form + game-over actions),
  `style.css` (overlay styling, mobile-friendly).

## Verification (localhost)
- Open http://localhost:8000, hard-refresh, check DevTools console = no errors.
- Manual: name prompt once; waves + banners; 🔥 combo builds/resets; penalty on
  shooting a honu; Best persists across reloads; challenge link opens & shares.
- `window.HPC` exposes `score/best/combo/mult/wave/hazards` for spot-checks.

## Release
Build + verify on localhost → user approves → tag & push **v2.0** to the public
GitHub Pages link.
