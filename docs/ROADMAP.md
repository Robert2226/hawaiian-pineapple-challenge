# 🍍 Hawaiian Pineapple Challenge — Roadmap

A retro-ish, Hawaiian-themed browser shooter. Pineapples fall from the palms;
shoot them before they hit the sand. Static site (HTML/CSS/vanilla JS + canvas),
hosted free on GitHub Pages. No build step, no backend.

**Live:** https://robert2226.github.io/hawaiian-pineapple-challenge/
**Local preview:** `python3 -m http.server 8000` → http://localhost:8000

## Done
- **Phase 0** — repo + GitHub Pages hosting
- **Phase 1** — playable core (loop, spawn/fall, aim + shoot, collision, score, lives, game over/restart)
- **Phase 2A** — aiming feel (reticle, trajectory guide, hold-to-fire, upward-arc clamp, smooth barrel)
- **Phase 2B** — realistic Hawaiian art (sunset/ocean/beach, swaying palms, tiki torches, glossy pineapples, tiki cannon, screen shake)
- **Phase 2C** — sound effects (procedural Web Audio) + mute toggle (no background music)

## In progress — Tier 1 (no backend, ships to v2.0)
See [TIER1-PLAN.md](TIER1-PLAN.md). Steps:
1. HUD redesign + local high score
2. Player name (ask once, remembered)
3. Combo system + 🔥 readout
4. Waves + difficulty progression + banners
5. Native "don't-shoot" hazards (honu / nēnē / monk seal / hibiscus)
6. Challenge links (encode score in a URL, share/copy)

**Release plan:** build + verify on localhost first; when approved, push as **v2.0**
to the public link.

## Later — needs a backend (evaluating)
- **Tier 2** — global shared leaderboard (e.g. Supabase free tier)
- **Tier 3** — real-time online head-to-head (WebSockets; biggest effort)

## Ideas backlog
- Power-ups (rapid-fire, spread shot, slow-mo)
- Machete close-range slice
- Golden bonus pineapples
