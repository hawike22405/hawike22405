import { pathToFileURL } from "node:url";

import type { GameConfig, ThemeName } from "./pacman-extension/types.js";

const themeValues = new Set<ThemeName>(["github-light", "github-dark"]);

function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];

  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name];

  if (!raw) {
    return fallback;
  }

  return !["0", "false", "no", "off"].includes(raw.toLowerCase());
}

function readTheme(name: string, fallback: ThemeName): ThemeName {
  const raw = process.env[name] as ThemeName | undefined;
  return raw && themeValues.has(raw) ? raw : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const cwdUrl = pathToFileURL(`${process.cwd()}/`);

export const config: GameConfig = {
  githubUsername: process.env.GITHUB_USERNAME ?? "octocat",
  githubToken: process.env.GITHUB_TOKEN,
  animationSpeedMs: clamp(readNumber("PACMAN_ANIMATION_SPEED", 220), 80, 1_000),
  theme: readTheme("PACMAN_THEME", "github-dark"),
  ghostCount: clamp(Math.round(readNumber("PACMAN_GHOST_COUNT", 4)), 1, 4),
  autoplayMode: readBoolean("PACMAN_AUTOPLAY", true),
  useLiveContributionData: readBoolean("PACMAN_USE_LIVE_DATA", true),
  maxTurns: clamp(Math.round(readNumber("PACMAN_MAX_TURNS", 520)), 120, 2_000),
  frightenedTurns: clamp(Math.round(readNumber("PACMAN_FRIGHTENED_TURNS", 18)), 6, 60),
  cellSize: clamp(Math.round(readNumber("PACMAN_CELL_SIZE", 21)), 14, 30),
  outputDir: new URL("./dist/", cwdUrl),
};

export default config;
