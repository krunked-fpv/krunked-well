# Krunked Well

[![Krunked Well CI & Deploy Pages](https://github.com/krunked-fpv/krunked-well/actions/workflows/ci.yml/badge.svg)](https://github.com/krunked-fpv/krunked-well/actions/workflows/ci.yml)

**Play Live:** https://krunked-fpv.github.io/krunked-well/

A standalone, deterministic 60 Hz TypeScript + WebGL2 vertical gunboot descent roguelite with crisp 4-channel semantic palette shaders, 30/60/120 FPS frame pacing, full Xbox / Tesla / Standard controller support, and touch-activated transparent mobile/Tesla controls.

## Features

- **Exact 60 Hz Gunboot Descent Feel**: Fixed-timestep deterministic simulation (`160x284` playfield, `16x16` tile grid, `8x12` player collision box), velocity-clamped gunboot recoil, instant stomp/landing recharge, air-control bias, 8/15/25 combo milestones, Gem High weapon overcharge, and impact slowdown.
- **Full Roguelite Arsenal & Biomes**:
  - 7 Gunboot Weapons (Normal + Gem High overcharge matrices)
  - 20 Post-Stage Upgrades & 6 Shop Consumables
  - 5 Play Styles (Standard, Spin, Heavy, Float, Ascetic)
  - 5 Biomes across 13 Stages (Cavern, Catacomb, Aquifer with oxygen mechanics, Limbo, and the 4-phase Abyssal Leviathan Final Boss)
  - Hard Mode, 23 Trophies, 41 Cumulative Gem Milestones, and 38 4-Channel Semantic Palettes
- **Universal Controls**:
  - Keyboard (rebindable), Xbox / PlayStation / Switch / Tesla USB & Bluetooth Gamepads (with deadzones, menu nav, and haptic rumble)
  - Transparent Touch Controls that remain **100% hidden by default** and appear automatically only when touch input is activated, then auto-hide on keyboard or controller input
  - Responsive layouts for Desktop, Mobile Portrait, and Tesla Landscape + Tate 90°/270° rotation
- **Dual Art & Audio Packs**: Ships with 100% original built-in procedural pixel art and 10-track Web Audio chiptune soundtrack, plus an optional client-side Custom Pack loader for user-owned extracted assets.

## Quick Start

```bash
npm install
npm run play
```

## Scripts

- `npm run dev` — Start Vite dev server on port 5173
- `npm run play` — Start Vite dev server on port 4173
- `npm run typecheck` — Strict TypeScript check (`tsc --noEmit`)
- `npm run test` — Run Vitest unit & integration test suite
- `npm run verify:assets` — Verify asset parity, mechanic oracle constants, TASTE_NOTES, and clean-room IP firewall
- `npm run verify:sim` — Run deterministic FNV-1a replay and multi-biome soak verification
- `npm run verify` — Run full typecheck, unit tests, asset gate, and sim soak
- `npm run build` — Build standalone static bundle in `dist/`
