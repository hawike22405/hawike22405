import { mkdir, writeFile } from "node:fs/promises";

import { PacmanRenderer } from "pacman-contribution-graph";

import config from "../config.js";
import { simulateGame } from "../pacman-extension/gameEngine.js";
import { generateGameMap } from "../pacman-extension/mapGenerator.js";
import {
  GRID_HEIGHT,
  type BrowserBootstrapData,
  type ContributionLevel,
  type ContributionSnapshot,
  type SourceGridCell,
  type ThemeName,
} from "../pacman-extension/types.js";
import { renderCanvasPage } from "../renderer/canvasRenderer.js";
import { renderGameSvg } from "../renderer/svgRenderer.js";

function themeToLibraryTheme(theme: ThemeName): "github" | "github-dark" {
  return theme === "github-light" ? "github" : "github-dark";
}

function intensityToLevel(intensity: number): ContributionLevel {
  if (intensity <= 0) {
    return "NONE";
  }

  if (intensity === 1) {
    return "FIRST_QUARTILE";
  }

  if (intensity === 2) {
    return "SECOND_QUARTILE";
  }

  if (intensity === 3) {
    return "THIRD_QUARTILE";
  }

  return "FOURTH_QUARTILE";
}

function buildMonthLabels(): string[] {
  const labels: string[] = [];
  const cursor = new Date();
  cursor.setUTCHours(0, 0, 0, 0);
  cursor.setUTCDate(cursor.getUTCDate() - cursor.getUTCDay() - 52 * 7);

  let lastMonth = "";
  for (let index = 0; index < 53; index += 1) {
    const label = cursor.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
    labels.push(label === lastMonth ? "" : label);
    lastMonth = label;
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }

  return labels;
}

function usernameSeed(username: string): number {
  return [...username].reduce((accumulator, char) => accumulator + char.charCodeAt(0), 0);
}

function buildSampleSnapshot(username: string): ContributionSnapshot {
  const seed = usernameSeed(username);
  const columns = Array.from({ length: 53 }, (_, col) =>
    Array.from({ length: GRID_HEIGHT }, (_, row) => {
      const wave = Math.abs(Math.sin((col + seed / 17) * 0.42) + Math.cos((row + seed / 9) * 0.8));
      const streak = ((col * 7 + row * 11 + seed) % 9) - 2;
      const count = Math.max(0, Math.round(wave * 3 + streak));
      const level = intensityToLevel(Math.min(count, 4));

      const cell: SourceGridCell = {
        commitsCount: count,
        level,
        color: "",
      };

      return cell;
    }),
  );

  return {
    columns,
    monthLabels: buildMonthLabels(),
    source: "sample",
    username,
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchLiveSnapshot(username: string): Promise<ContributionSnapshot> {
  const renderer = new PacmanRenderer({
    username,
    platform: "github",
    outputFormat: "svg",
    gameTheme: themeToLibraryTheme(config.theme),
    gameSpeed: 1,
    svgCallback: () => {},
    githubSettings: {
      accessToken: config.githubToken,
    },
  });

  try {
    const store = await renderer.start();
    return {
      columns: store.grid.map((column) =>
        column.slice(0, GRID_HEIGHT).map((cell) => ({
          commitsCount: cell.commitsCount,
          color: cell.color,
          level: cell.level,
        })),
      ),
      monthLabels: store.monthLabels,
      source: "live",
      username,
      fetchedAt: new Date().toISOString(),
    };
  } finally {
    renderer.stop();
  }
}

function hasEnoughActivity(snapshot: ContributionSnapshot): boolean {
  let active = 0;
  for (const column of snapshot.columns) {
    for (const cell of column) {
      if (cell.commitsCount > 0) {
        active += 1;
      }
    }
  }

  return active >= 12;
}

async function resolveSnapshot(username: string): Promise<ContributionSnapshot> {
  if (!config.useLiveContributionData) {
    return buildSampleSnapshot(username);
  }

  try {
    const live = await fetchLiveSnapshot(username);
    if (hasEnoughActivity(live)) {
      return live;
    }

    console.warn("Live contribution grid was too sparse, using the deterministic sample fallback.");
  } catch (error) {
    console.warn("Falling back to sample contribution data:", error instanceof Error ? error.message : error);
  }

  return buildSampleSnapshot(username);
}

async function main(): Promise<void> {
  const snapshot = await resolveSnapshot(config.githubUsername);
  const map = generateGameMap(snapshot, config);
  const simulation = simulateGame(map, snapshot, config);
  const darkSvg = renderGameSvg(simulation, { ...config, theme: "github-dark" });
  const lightSvg = renderGameSvg(simulation, { ...config, theme: "github-light" });
  const html = renderCanvasPage({
    source: snapshot,
    map,
    config: {
      animationSpeedMs: config.animationSpeedMs,
      theme: config.theme,
      autoplayMode: config.autoplayMode,
      frightenedTurns: config.frightenedTurns,
      ghostCount: config.ghostCount,
      maxTurns: config.maxTurns,
      cellSize: config.cellSize,
    },
  } satisfies BrowserBootstrapData);

  await mkdir(config.outputDir, { recursive: true });
  await writeFile(new URL("./pacman-contribution-game-dark.svg", config.outputDir), darkSvg, "utf8");
  await writeFile(new URL("./pacman-contribution-game-light.svg", config.outputDir), lightSvg, "utf8");
  // ponytail: legacy filename kept as the dark render so old embeds don't break
  await writeFile(new URL("./pacman-contribution-game.svg", config.outputDir), darkSvg, "utf8");
  await writeFile(new URL("./pacman-contribution-game.html", config.outputDir), html, "utf8");

  console.log(
    `Generated Pac-Man contribution game for ${snapshot.username} using ${snapshot.source} data.`,
  );
}

await main();
