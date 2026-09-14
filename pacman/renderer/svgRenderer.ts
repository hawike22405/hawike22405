import {
  GRID_HEIGHT,
  GRID_WIDTH,
  type Direction,
  type GameConfig,
  type SimulationResult,
} from "../pacman-extension/types.js";
import { buildMazeSegments } from "./mazeOverlay.js";
import { getThemePalette } from "./theme.js";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace("#", "");
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : normalized;
  const value = Number.parseInt(full, 16);

  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function mixColors(first: string, second: string, weight: number): string {
  const a = hexToRgb(first);
  const b = hexToRgb(second);
  const clampWeight = Math.max(0, Math.min(weight, 1));

  const mix = (left: number, right: number) =>
    Math.round(left * (1 - clampWeight) + right * clampWeight);

  const toHex = (value: number) => value.toString(16).padStart(2, "0");
  return `#${toHex(mix(a.r, b.r))}${toHex(mix(a.g, b.g))}${toHex(mix(a.b, b.b))}`;
}

function getContributionShade(
  levels: string[],
  contributionStrength: number,
  maxContributionStrength: number,
): string {
  if (levels.length === 0) {
    return "#39d353";
  }

  if (maxContributionStrength <= 0 || contributionStrength <= 0) {
    return levels[0]!;
  }

  const normalized = contributionStrength / maxContributionStrength;
  if (normalized < 0.25) {
    return levels[0]!;
  }
  if (normalized < 0.5) {
    return levels[Math.min(1, levels.length - 1)]!;
  }
  if (normalized < 0.75) {
    return levels[Math.min(2, levels.length - 1)]!;
  }

  return levels[levels.length - 1]!;
}

function getCellColors(
  palette: ReturnType<typeof getThemePalette>,
  activeContribution: boolean,
  powerCell: boolean,
  contributionStrength: number,
  maxContributionStrength: number,
): { fill: string; stroke: string; sheen: string } {
  if (!activeContribution) {
    return {
      fill: mixColors(palette.floor, palette.background, 0.08),
      stroke: withAlpha(palette.gridLine, 0.88),
      sheen: withAlpha("#ffffff", 0.04),
    };
  }

  const contributionShade = getContributionShade(
    palette.contributionLevels,
    contributionStrength,
    maxContributionStrength,
  );
  const fill = powerCell
    ? mixColors(contributionShade, "#ffffff", 0.16)
    : mixColors(contributionShade, "#ffffff", 0.08);

  return {
    fill,
    stroke: withAlpha(mixColors(fill, "#ffffff", 0.08), 0.98),
    sheen: withAlpha("#ffffff", powerCell ? 0.22 : 0.14),
  };
}

function buildTimeline(values: string[]): { values: string; keyTimes: string } {
  if (values.length === 1) {
    return { values: `${values[0]};${values[0]}`, keyTimes: "0;1" };
  }

  const compressedValues: string[] = [];
  const compressedTimes: string[] = [];

  for (let index = 0; index < values.length; index += 1) {
    if (index === 0 || values[index] !== values[index - 1]) {
      compressedValues.push(values[index]!);
      compressedTimes.push((index / (values.length - 1)).toFixed(4));
    }
  }

  if (compressedTimes[compressedTimes.length - 1] !== "1.0000") {
    compressedValues.push(values[values.length - 1]!);
    compressedTimes.push("1.0000");
  }

  return {
    values: compressedValues.join(";"),
    keyTimes: compressedTimes.join(";"),
  };
}

function directionToAngle(direction: Direction): string {
  switch (direction) {
    case "up":
      return "-90";
    case "down":
      return "90";
    case "left":
      return "180";
    case "right":
      return "0";
  }
}

function pacmanPath(radius: number, mouth: number): string {
  const start = mouth;
  const end = Math.PI * 2 - mouth;
  const startX = Math.cos(start) * radius;
  const startY = Math.sin(start) * radius;
  const endX = Math.cos(end) * radius;
  const endY = Math.sin(end) * radius;

  return [
    "M 0 0",
    `L ${startX.toFixed(2)} ${startY.toFixed(2)}`,
    `A ${radius} ${radius} 0 1 1 ${endX.toFixed(2)} ${endY.toFixed(2)}`,
    "Z",
  ].join(" ");
}

function ghostBodyPath(radius: number): string {
  const height = radius * 1.55;
  return [
    `M ${-radius} ${height * 0.66}`,
    `L ${-radius} ${-height * 0.12}`,
    `Q ${-radius} ${-height} 0 ${-height}`,
    `Q ${radius} ${-height} ${radius} ${-height * 0.12}`,
    `L ${radius} ${height * 0.66}`,
    `L ${radius * 0.58} ${height * 0.18}`,
    `L ${radius * 0.18} ${height * 0.66}`,
    `L ${-radius * 0.18} ${height * 0.18}`,
    `L ${-radius * 0.58} ${height * 0.66}`,
    "Z",
  ].join(" ");
}

export function renderGameSvg(simulation: SimulationResult, config: GameConfig): string {
  const palette = getThemePalette(config.theme);
  const square = config.cellSize;
  const gap = Math.max(2, Math.round(square * 0.1));
  const step = square + gap;
  const radius = square / 2;
  const left = 46;
  const top = 74;
  const boardPixelWidth = step * (GRID_WIDTH - 1) + square;
  const boardPixelHeight = step * (GRID_HEIGHT - 1) + square;
  const width = left * 2 + boardPixelWidth;
  const height = top + boardPixelHeight + 46;
  const panelX = left - 30;
  const panelY = top - 34;
  const panelWidth = boardPixelWidth + 60;
  const panelHeight = boardPixelHeight + 60;
  const innerPanelX = panelX + 14;
  const innerPanelY = panelY + 14;
  const innerPanelWidth = panelWidth - 28;
  const innerPanelHeight = panelHeight - 28;
  const durationMs = simulation.frames.length * config.animationSpeedMs;
  const mapStrength = simulation.initialState.map.contributionStrength;
  const maxContributionStrength = Math.max(
    1,
    ...mapStrength.flat().map((value) => value ?? 0),
  );
  const mazeSegments = buildMazeSegments(simulation.initialState.map.walls);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">`;
  svg += `<title id="title">Pac-Man</title>`;
  svg += `<desc id="desc">${escapeXml(
    "Pac-Man traverses a GitHub contribution board while ghosts chase through the graph.",
  )}</desc>`;

  svg += `<defs>
    <linearGradient id="bg-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${mixColors(palette.background, palette.gradientTint, 0.18)}" />
      <stop offset="58%" stop-color="${palette.background}" />
      <stop offset="100%" stop-color="${mixColors(palette.background, palette.gradientDeep, 0.32)}" />
    </linearGradient>
    <linearGradient id="panel-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${mixColors(palette.scorePanel, palette.gradientTint, 0.18)}" />
      <stop offset="100%" stop-color="${mixColors(palette.background, palette.gradientDeep, 0.14)}" />
    </linearGradient>
    <linearGradient id="inner-panel-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${mixColors(palette.background, palette.gradientTint, 0.26)}" />
      <stop offset="100%" stop-color="${mixColors(palette.background, palette.gradientDeep, 0.14)}" />
    </linearGradient>
    <linearGradient id="energy-sweep" x1="-20%" y1="0%" x2="12%" y2="100%">
      <stop offset="0%" stop-color="${palette.contributionLevels[0]!}" stop-opacity="0" />
      <stop offset="36%" stop-color="${palette.contributionLevels[1]!}" stop-opacity="0.06" />
      <stop offset="62%" stop-color="${palette.contributionLevels[3]!}" stop-opacity="0.1" />
      <stop offset="100%" stop-color="${palette.contributionLevels[3]!}" stop-opacity="0" />
      <animate attributeName="x1" values="-20%;110%;-20%" dur="15s" repeatCount="indefinite" />
      <animate attributeName="x2" values="12%;142%;12%" dur="15s" repeatCount="indefinite" />
    </linearGradient>
    <radialGradient id="pacman-fill" cx="34%" cy="28%" r="74%">
      <stop offset="0%" stop-color="${mixColors(palette.pacman, "#ffffff", 0.38)}" />
      <stop offset="65%" stop-color="${palette.pacman}" />
      <stop offset="100%" stop-color="${mixColors(palette.pacman, "#2d1800", 0.26)}" />
    </radialGradient>
    <filter id="panel-shadow" x="-20%" y="-30%" width="140%" height="170%">
      <feDropShadow dx="0" dy="18" stdDeviation="20" flood-color="#000000" flood-opacity="${palette.shadowOpacity}" />
    </filter>
    <filter id="pellet-glow" x="-120%" y="-120%" width="340%" height="340%">
      <feGaussianBlur stdDeviation="3.2" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
    <filter id="maze-glow" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="2.6" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
    <filter id="actor-glow" x="-160%" y="-160%" width="420%" height="420%">
      <feGaussianBlur stdDeviation="4.5" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>`;

  svg += `<rect width="100%" height="100%" fill="url(#bg-gradient)"/>`;
  svg += `<circle cx="${width * 0.14}" cy="${height * 0.16}" r="120" fill="${withAlpha(palette.pacman, 0.08)}"/>`;
  svg += `<circle cx="${width * 0.86}" cy="${height * 0.2}" r="110" fill="${withAlpha(palette.ghosts[1]!, 0.08)}"/>`;
  svg += `<circle cx="${width * 0.76}" cy="${height * 0.82}" r="140" fill="${withAlpha(palette.ghosts[3]!, 0.06)}"/>`;

  svg += `<g filter="url(#panel-shadow)">`;
  svg += `<rect x="${panelX}" y="${panelY}" width="${panelWidth}" height="${panelHeight}" rx="30" fill="url(#panel-gradient)" stroke="${withAlpha(
    mixColors(palette.gridLine, "#ffffff", 0.18),
    0.88,
  )}" stroke-width="1.1"/>`;
  svg += `<rect x="${innerPanelX}" y="${innerPanelY}" width="${innerPanelWidth}" height="${innerPanelHeight}" rx="22" fill="url(#inner-panel-gradient)" stroke="${withAlpha(
    palette.gridLine,
    0.5,
  )}"/>`;
  svg += `</g>`;

  simulation.source.monthLabels.forEach((label, col) => {
    if (!label) {
      return;
    }

    const x = left + col * step;
    svg += `<text x="${x}" y="${top - 14}" fill="${withAlpha(
      palette.monthLabel,
      0.96,
    )}" font-size="12" font-weight="500" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif">${escapeXml(
      label,
    )}</text>`;
  });

  for (let row = 0; row < GRID_HEIGHT; row += 1) {
    for (let col = 0; col < GRID_WIDTH; col += 1) {
      const x = left + col * step;
      const y = top + row * step;
      const contributionStrength = mapStrength[row]![col] ?? 0;
      const fillTimeline = buildTimeline(
        simulation.frames.map((frame) => {
          const cell = frame.grid[row]![col];
          return getCellColors(
            palette,
            cell === 1 || cell === 4,
            cell === 4,
            contributionStrength,
            maxContributionStrength,
          ).fill;
        }),
      );
      const strokeTimeline = buildTimeline(
        simulation.frames.map((frame) => {
          const cell = frame.grid[row]![col];
          return getCellColors(
            palette,
            cell === 1 || cell === 4,
            cell === 4,
            contributionStrength,
            maxContributionStrength,
          ).stroke;
        }),
      );
      const sheenTimeline = buildTimeline(
        simulation.frames.map((frame) => {
          const cell = frame.grid[row]![col];
          return getCellColors(
            palette,
            cell === 1 || cell === 4,
            cell === 4,
            contributionStrength,
            maxContributionStrength,
          ).sheen;
        }),
      );

      svg += `<rect x="${x}" y="${y}" width="${square}" height="${square}" rx="6" fill="${fillTimeline.values.split(";")[0]}" stroke="${strokeTimeline.values.split(";")[0]}" stroke-width="1">`;
      svg += `<animate attributeName="fill" dur="${durationMs}ms" repeatCount="indefinite" values="${fillTimeline.values}" keyTimes="${fillTimeline.keyTimes}"/>`;
      svg += `<animate attributeName="stroke" dur="${durationMs}ms" repeatCount="indefinite" values="${strokeTimeline.values}" keyTimes="${strokeTimeline.keyTimes}"/>`;
      svg += `</rect>`;
      svg += `<rect x="${x + 1.2}" y="${y + 1.2}" width="${square - 2.4}" height="${Math.max(
        5,
        square * 0.28,
      )}" rx="4" fill="${sheenTimeline.values.split(";")[0]}">`;
      svg += `<animate attributeName="fill" dur="${durationMs}ms" repeatCount="indefinite" values="${sheenTimeline.values}" keyTimes="${sheenTimeline.keyTimes}"/>`;
      svg += `</rect>`;

      const powerFrames = simulation.frames.map((frame) =>
        frame.grid[row]![col] === 4 ? "1" : "0",
      );
      const powerTimeline = buildTimeline(powerFrames);

      svg += `<g opacity="0">`;
      svg += `<animate attributeName="opacity" dur="${durationMs}ms" repeatCount="indefinite" values="${powerTimeline.values}" keyTimes="${powerTimeline.keyTimes}"/>`;
      svg += `<rect x="${x + 2}" y="${y + 2}" width="${square - 4}" height="${square - 4}" rx="5" fill="none" stroke="${withAlpha(palette.powerRing, 0.68)}" stroke-width="1.6" filter="url(#pellet-glow)">`;
      svg += `<animate attributeName="stroke-opacity" dur="900ms" repeatCount="indefinite" values="0.32;0.88;0.32"/>`;
      svg += `</rect>`;
      svg += `<rect x="${x + 4.2}" y="${y + 4.2}" width="${square - 8.4}" height="${square - 8.4}" rx="4" fill="none" stroke="${withAlpha(
        palette.powerPellet,
        0.46,
      )}" stroke-width="0.9"/>`;
      svg += `</g>`;
    }
  }

  svg += `<rect x="${innerPanelX + 4}" y="${innerPanelY + 4}" width="${innerPanelWidth - 8}" height="${innerPanelHeight - 8}" rx="18" fill="url(#energy-sweep)" opacity="0.34" style="mix-blend-mode:screen"/>`;

  const mazePath = mazeSegments
    .map((segment) => {
      const startX = left + segment.x1 * step - gap / 2;
      const startY = top + segment.y1 * step - gap / 2;
      const endX = left + segment.x2 * step - gap / 2;
      const endY = top + segment.y2 * step - gap / 2;
      return `M ${startX} ${startY} L ${endX} ${endY}`;
    })
    .join(" ");

  svg += `<path d="${mazePath}" fill="none" stroke="${withAlpha(palette.mazeOuter, 0.7)}" stroke-width="${Math.max(
    5.2,
    gap + 3.1,
  )}" stroke-linecap="round" stroke-linejoin="round"/>`;
  svg += `<path d="${mazePath}" fill="none" stroke="${withAlpha(palette.mazeInner, 0.94)}" stroke-width="${Math.max(
    2.2,
    gap + 0.6,
  )}" stroke-linecap="round" stroke-linejoin="round" filter="url(#maze-glow)"/>`;

  const pacmanPositions = buildTimeline(
    simulation.frames.map((frame) => {
      const x = left + frame.pacman.col * step + square / 2;
      const y = top + frame.pacman.row * step + square / 2;
      return `${x} ${y}`;
    }),
  );
  const pacmanRotations = buildTimeline(
    simulation.frames.map((frame) => `${directionToAngle(frame.pacman.direction)} 0 0`),
  );
  const pacmanOpen = pacmanPath(radius * 0.92, 0.55);
  const pacmanClosed = pacmanPath(radius * 0.92, 0.18);

  svg += `<g id="pacman" filter="url(#actor-glow)">`;
  svg += `<animateTransform attributeName="transform" type="translate" dur="${durationMs}ms" repeatCount="indefinite" values="${pacmanPositions.values}" keyTimes="${pacmanPositions.keyTimes}"/>`;
  svg += `<animateTransform attributeName="transform" additive="sum" type="rotate" dur="${durationMs}ms" repeatCount="indefinite" values="${pacmanRotations.values}" keyTimes="${pacmanRotations.keyTimes}"/>`;
  svg += `<path d="${pacmanOpen}" fill="url(#pacman-fill)">`;
  svg += `<animate attributeName="d" dur="420ms" repeatCount="indefinite" values="${pacmanOpen};${pacmanClosed};${pacmanOpen}"/>`;
  svg += `</path>`;
  svg += `<circle cx="-${radius * 0.22}" cy="-${radius * 0.24}" r="${radius * 0.24}" fill="${withAlpha(
    "#ffffff",
    0.16,
  )}"/>`;
  svg += `<circle cx="1.4" cy="-${radius * 0.38}" r="${Math.max(1.1, radius * 0.08)}" fill="${palette.eye}"/>`;
  svg += `</g>`;

  simulation.finalState.ghosts.forEach((ghost, index) => {
    const positions = buildTimeline(
      simulation.frames.map((frame) => {
        const actor = frame.ghosts[index]!;
        const x = left + actor.col * step + square / 2;
        const y = top + actor.row * step + square / 2;
        return `${x} ${y}`;
      }),
    );
    const fills = buildTimeline(
      simulation.frames.map((frame) => {
        const actor = frame.ghosts[index]!;
        return actor.mode === "frightened"
          ? palette.frightenedGhost
          : palette.ghosts[index % palette.ghosts.length]!;
      }),
    );
    const opacity = buildTimeline(
      simulation.frames.map((frame) => {
        const actor = frame.ghosts[index]!;
        return actor.released || actor.releaseIn <= 1 ? "1" : "0.45";
      }),
    );

    svg += `<g id="ghost-${ghost.id}" filter="url(#actor-glow)">`;
    svg += `<animateTransform attributeName="transform" type="translate" dur="${durationMs}ms" repeatCount="indefinite" values="${positions.values}" keyTimes="${positions.keyTimes}"/>`;
    svg += `<animate attributeName="opacity" dur="${durationMs}ms" repeatCount="indefinite" values="${opacity.values}" keyTimes="${opacity.keyTimes}"/>`;
    svg += `<path d="${ghostBodyPath(radius * 0.9)}" fill="${palette.ghosts[index % palette.ghosts.length]!}">`;
    svg += `<animate attributeName="fill" dur="${durationMs}ms" repeatCount="indefinite" values="${fills.values}" keyTimes="${fills.keyTimes}"/>`;
    svg += `</path>`;
    svg += `<ellipse cx="-${radius * 0.18}" cy="-${radius * 0.58}" rx="${radius * 0.32}" ry="${radius * 0.12}" transform="rotate(-20)" fill="${withAlpha(
      "#ffffff",
      0.18,
    )}"/>`;
    svg += `<circle cx="-3.3" cy="-3.1" r="2.4" fill="#ffffff"/><circle cx="3.3" cy="-3.1" r="2.4" fill="#ffffff"/>`;
    svg += `<circle cx="-2.4" cy="-2.5" r="0.96" fill="#0f172a"/><circle cx="4" cy="-2.5" r="0.96" fill="#0f172a"/>`;
    svg += `</g>`;
  });

  svg += `</svg>`;
  return svg;
}
