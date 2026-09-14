# Pac-Man Contribution Game

Turn a GitHub contribution graph into a Pac-Man board with a custom TypeScript game engine built on top of `pacman-contribution-graph`.

<h3 align="center">🕹️ Pac-Man eats my commits</h3>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/pratyushkumar06/pacman-commits/main/dist/pacman-contribution-game-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/pratyushkumar06/pacman-commits/main/dist/pacman-contribution-game-light.svg">
    <img alt="Pac-Man chomping through my GitHub contribution graph" src="https://raw.githubusercontent.com/pratyushkumar06/pacman-commits/main/dist/pacman-contribution-game-dark.svg">
  </picture>
</p>

<p align="center"><sub>Regenerated daily from live contribution data — ghosts included, free of charge.</sub></p>

## What This Repo Does

- Fetches GitHub contribution data with `pacman-contribution-graph`
- Converts the contribution graph into a playable Pac-Man map
- Simulates Pac-Man, ghosts, collisions, scoring, and power pellets
- Generates theme-matched animated SVGs (dark and light) for README embedding
- Generates a browser-based Canvas demo
- Regenerates the output automatically with GitHub Actions

## Embed In a README

The `<picture>` element serves the SVG that matches the viewer's GitHub theme:

```html
<h3 align="center">🕹️ Pac-Man eats my commits</h3>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/pratyushkumar06/pacman-commits/main/dist/pacman-contribution-game-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/pratyushkumar06/pacman-commits/main/dist/pacman-contribution-game-light.svg">
    <img alt="Pac-Man chomping through my GitHub contribution graph" src="https://raw.githubusercontent.com/pratyushkumar06/pacman-commits/main/dist/pacman-contribution-game-dark.svg">
  </picture>
</p>
```

## Project Outputs

- `dist/pacman-contribution-game-dark.svg`
- `dist/pacman-contribution-game-light.svg`
- `dist/pacman-contribution-game.svg` (legacy alias for the dark render)
- `dist/pacman-contribution-game.html`

## Local Development

```bash
npm install
npm run generate
```

## Configuration

The generator reads configuration from environment variables. Both SVG themes are always generated; `PACMAN_THEME` only picks the theme for the Canvas demo page.

- `GITHUB_USERNAME`
- `GITHUB_TOKEN`
- `PACMAN_THEME`
- `PACMAN_ANIMATION_SPEED`
- `PACMAN_GHOST_COUNT`
- `PACMAN_AUTOPLAY`

## Automation

The workflow in `.github/workflows/regenerate-pacman.yml` refreshes the generated assets every 24 hours and on manual dispatch, committing them back to `main`.
