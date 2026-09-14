import { createInitialGameState, stepGame } from "../pacman-extension/gameEngine.js";
import type {
  BrowserBootstrapData,
  Direction,
  GameConfig,
  GameState,
  Position,
  ThemePalette,
} from "../pacman-extension/types.js";
import { GRID_HEIGHT, GRID_WIDTH } from "../pacman-extension/types.js";
import { buildMazeSegments, type MazeSegment } from "./mazeOverlay.js";
import { getThemePalette } from "./theme.js";

interface BoardLayout {
  boardWidth: number;
  boardHeight: number;
  boardPixelWidth: number;
  boardPixelHeight: number;
  gap: number;
  left: number;
  top: number;
  step: number;
  square: number;
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
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

function getCellColorSet(
  palette: ThemePalette,
  activeContribution: boolean,
  powerCell: boolean,
  contributionStrength: number,
  maxContributionStrength: number,
): {
  fill: string;
  stroke: string;
  sheen: string;
  glow: string;
} {
  const contributionShade = getContributionShade(
    palette.contributionLevels,
    contributionStrength,
    maxContributionStrength,
  );

  if (!activeContribution) {
    return {
      fill: mixColors(palette.floor, palette.background, 0.08),
      stroke: withAlpha(palette.gridLine, 0.88),
      sheen: withAlpha("#ffffff", 0.03),
      glow: withAlpha(palette.pellet, 0.04),
    };
  }

  const fill = powerCell
    ? mixColors(contributionShade, "#ffffff", 0.16)
    : mixColors(contributionShade, "#ffffff", 0.08);

  return {
    fill,
    stroke: withAlpha(mixColors(fill, "#ffffff", 0.08), 0.98),
    sheen: withAlpha("#ffffff", powerCell ? 0.2 : 0.13),
    glow: withAlpha(fill, powerCell ? 0.28 : 0.16),
  };
}

function scaleCanvas(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D context is unavailable");
  }

  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);

  return context;
}

function createRuntimeConfig(bootstrap: BrowserBootstrapData): GameConfig {
  return {
    ...bootstrap.config,
    githubUsername: bootstrap.source.username,
    githubToken: undefined,
    useLiveContributionData: bootstrap.source.source === "live",
    outputDir: new URL("./", window.location.href),
  };
}

function createBoardLayout(cellSize: number): BoardLayout {
  const square = cellSize;
  const gap = Math.max(2, Math.round(cellSize * 0.1));
  const step = square + gap;
  const boardPixelWidth = square + step * (GRID_WIDTH - 1);
  const boardPixelHeight = square + step * (GRID_HEIGHT - 1);
  const left = 46;
  const top = 74;

  return {
    boardWidth: left * 2 + boardPixelWidth,
    boardHeight: top + boardPixelHeight + 46,
    boardPixelWidth,
    boardPixelHeight,
    gap,
    left,
    top,
    step,
    square,
  };
}

function directionalOffset(direction: Direction, magnitude: number): Position {
  switch (direction) {
    case "up":
      return { row: -magnitude, col: 0 };
    case "down":
      return { row: magnitude, col: 0 };
    case "left":
      return { row: 0, col: -magnitude };
    case "right":
      return { row: 0, col: magnitude };
  }
}

function drawGhost(
  context: CanvasRenderingContext2D,
  ghost: GameState["ghosts"][number],
  color: string,
  frightened: boolean,
  layout: BoardLayout,
  palette: ThemePalette,
): void {
  const x = layout.left + ghost.col * layout.step + layout.square / 2;
  const y = layout.top + ghost.row * layout.step + layout.square / 2;
  const radius = layout.square * 0.43;
  const gradient = context.createLinearGradient(0, -radius, 0, radius * 0.9);
  gradient.addColorStop(0, mixColors(color, "#ffffff", 0.34));
  gradient.addColorStop(1, mixColors(color, "#0b1020", 0.16));

  context.save();
  context.translate(x, y);
  context.shadowColor = withAlpha(color, frightened ? 0.4 : 0.55);
  context.shadowBlur = frightened ? 16 : 22;
  context.shadowOffsetY = 8;
  context.fillStyle = gradient;
  context.beginPath();
  context.moveTo(-radius, radius * 0.72);
  context.lineTo(-radius, -radius * 0.16);
  context.quadraticCurveTo(-radius, -radius, 0, -radius);
  context.quadraticCurveTo(radius, -radius, radius, -radius * 0.16);
  context.lineTo(radius, radius * 0.72);
  context.lineTo(radius * 0.56, radius * 0.18);
  context.lineTo(radius * 0.18, radius * 0.72);
  context.lineTo(-radius * 0.18, radius * 0.18);
  context.lineTo(-radius * 0.56, radius * 0.72);
  context.closePath();
  context.fill();

  context.shadowColor = "transparent";
  context.fillStyle = withAlpha("#ffffff", frightened ? 0.14 : 0.18);
  context.beginPath();
  context.ellipse(-radius * 0.2, -radius * 0.6, radius * 0.36, radius * 0.14, -0.35, 0, Math.PI * 2);
  context.fill();

  if (frightened) {
    context.fillStyle = "#ffffff";
    context.beginPath();
    context.arc(-radius * 0.28, -radius * 0.18, radius * 0.16, 0, Math.PI * 2);
    context.arc(radius * 0.28, -radius * 0.18, radius * 0.16, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = "#0f172a";
    context.beginPath();
    context.arc(-radius * 0.22, -radius * 0.16, radius * 0.06, 0, Math.PI * 2);
    context.arc(radius * 0.34, -radius * 0.16, radius * 0.06, 0, Math.PI * 2);
    context.fill();

    context.strokeStyle = withAlpha(palette.text, 0.92);
    context.lineWidth = 1.7;
    context.beginPath();
    context.moveTo(-radius * 0.42, radius * 0.2);
    context.lineTo(-radius * 0.22, radius * 0.34);
    context.lineTo(0, radius * 0.2);
    context.lineTo(radius * 0.22, radius * 0.34);
    context.lineTo(radius * 0.42, radius * 0.2);
    context.stroke();
    context.restore();
    return;
  }

  context.fillStyle = "#ffffff";
  context.beginPath();
  context.arc(-radius * 0.28, -radius * 0.18, radius * 0.19, 0, Math.PI * 2);
  context.arc(radius * 0.28, -radius * 0.18, radius * 0.19, 0, Math.PI * 2);
  context.fill();

  const pupilOffset = directionalOffset(ghost.direction, radius * 0.08);
  context.fillStyle = "#111827";
  context.beginPath();
  context.arc(
    -radius * 0.26 + pupilOffset.col,
    -radius * 0.15 + pupilOffset.row,
    radius * 0.09,
    0,
    Math.PI * 2,
  );
  context.arc(
    radius * 0.3 + pupilOffset.col,
    -radius * 0.15 + pupilOffset.row,
    radius * 0.09,
    0,
    Math.PI * 2,
  );
  context.fill();
  context.restore();
}

function drawPacman(
  context: CanvasRenderingContext2D,
  state: GameState,
  layout: BoardLayout,
  color: string,
): void {
  const x = layout.left + state.pacman.col * layout.step + layout.square / 2;
  const y = layout.top + state.pacman.row * layout.step + layout.square / 2;
  const radius = layout.square * 0.44;
  const mouth = Math.sin(state.turn * 0.6) > 0 ? 0.28 : 0.1;
  const gradient = context.createRadialGradient(
    x - radius * 0.28,
    y - radius * 0.36,
    radius * 0.08,
    x,
    y,
    radius,
  );
  gradient.addColorStop(0, mixColors(color, "#ffffff", 0.45));
  gradient.addColorStop(0.68, color);
  gradient.addColorStop(1, mixColors(color, "#2d1800", 0.28));

  let baseAngle = 0;
  if (state.pacman.direction === "down") {
    baseAngle = Math.PI / 2;
  } else if (state.pacman.direction === "left") {
    baseAngle = Math.PI;
  } else if (state.pacman.direction === "up") {
    baseAngle = -Math.PI / 2;
  }

  context.save();
  context.shadowColor = withAlpha(color, 0.65);
  context.shadowBlur = 22;
  context.shadowOffsetY = 6;
  context.fillStyle = gradient;
  context.beginPath();
  context.moveTo(x, y);
  context.arc(x, y, radius, baseAngle + mouth, baseAngle + Math.PI * 2 - mouth);
  context.closePath();
  context.fill();
  context.shadowColor = "transparent";

  context.fillStyle = withAlpha("#ffffff", 0.16);
  context.beginPath();
  context.arc(x - radius * 0.22, y - radius * 0.24, radius * 0.24, 0, Math.PI * 2);
  context.fill();

  const eyeOffset = directionalOffset(state.pacman.direction, radius * 0.18);
  context.fillStyle = "#111827";
  context.beginPath();
  context.arc(x + eyeOffset.col * 0.5, y - radius * 0.36 + eyeOffset.row * 0.18, radius * 0.08, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawBoard(
  context: CanvasRenderingContext2D,
  state: GameState,
  bootstrap: BrowserBootstrapData,
  canvas: HTMLCanvasElement,
  layout: BoardLayout,
  mazeSegments: MazeSegment[],
): void {
  const palette = getThemePalette(bootstrap.config.theme);
  const canvasWidth = canvas.clientWidth;
  const canvasHeight = canvas.clientHeight;
  const panelX = layout.left - 30;
  const panelY = layout.top - 34;
  const panelWidth = layout.boardPixelWidth + 60;
  const panelHeight = layout.boardPixelHeight + 60;
  const innerPanelX = panelX + 14;
  const innerPanelY = panelY + 14;
  const innerPanelWidth = panelWidth - 28;
  const innerPanelHeight = panelHeight - 28;
  const pulse = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(state.turn * 0.45));
  const maxContributionStrength = Math.max(
    1,
    ...state.map.contributionStrength.flat().map((value) => value ?? 0),
  );

  context.clearRect(0, 0, canvasWidth, canvasHeight);
  const pageGradient = context.createLinearGradient(0, 0, canvasWidth, canvasHeight);
  pageGradient.addColorStop(0, mixColors(palette.background, "#111827", 0.18));
  pageGradient.addColorStop(0.58, palette.background);
  pageGradient.addColorStop(1, mixColors(palette.background, "#04070d", 0.32));
  context.fillStyle = pageGradient;
  context.fillRect(0, 0, canvasWidth, canvasHeight);

  context.fillStyle = withAlpha(palette.pacman, 0.08);
  context.beginPath();
  context.arc(canvasWidth * 0.14, canvasHeight * 0.16, 120, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = withAlpha(palette.ghosts[1]!, 0.08);
  context.beginPath();
  context.arc(canvasWidth * 0.86, canvasHeight * 0.2, 110, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = withAlpha(palette.ghosts[3]!, 0.06);
  context.beginPath();
  context.arc(canvasWidth * 0.76, canvasHeight * 0.82, 140, 0, Math.PI * 2);
  context.fill();

  context.save();
  context.shadowColor = withAlpha("#000000", 0.42);
  context.shadowBlur = 34;
  context.shadowOffsetY = 18;
  const panelGradient = context.createLinearGradient(panelX, panelY, panelX, panelY + panelHeight);
  panelGradient.addColorStop(0, mixColors(palette.scorePanel, "#111827", 0.18));
  panelGradient.addColorStop(1, mixColors(palette.background, "#02040a", 0.14));
  context.fillStyle = panelGradient;
  roundedRect(context, panelX, panelY, panelWidth, panelHeight, 30);
  context.fill();
  context.restore();

  context.strokeStyle = withAlpha(mixColors(palette.gridLine, "#ffffff", 0.18), 0.88);
  context.lineWidth = 1.1;
  roundedRect(context, panelX, panelY, panelWidth, panelHeight, 30);
  context.stroke();

  const innerGradient = context.createLinearGradient(
    innerPanelX,
    innerPanelY,
    innerPanelX,
    innerPanelY + innerPanelHeight,
  );
  innerGradient.addColorStop(0, mixColors(palette.background, "#0f172a", 0.26));
  innerGradient.addColorStop(1, mixColors(palette.background, "#010307", 0.14));
  context.fillStyle = innerGradient;
  roundedRect(context, innerPanelX, innerPanelY, innerPanelWidth, innerPanelHeight, 22);
  context.fill();
  context.strokeStyle = withAlpha(palette.gridLine, 0.5);
  roundedRect(context, innerPanelX, innerPanelY, innerPanelWidth, innerPanelHeight, 22);
  context.stroke();

  context.save();
  context.fillStyle = withAlpha(palette.monthLabel, 0.96);
  context.font = '500 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  context.textBaseline = "alphabetic";
  bootstrap.source.monthLabels.forEach((label, col) => {
    if (!label) {
      return;
    }

    const x = layout.left + col * layout.step;
    context.fillText(label, x, layout.top - 14);
  });
  context.restore();

  for (let row = 0; row < GRID_HEIGHT; row += 1) {
    for (let col = 0; col < GRID_WIDTH; col += 1) {
      const x = layout.left + col * layout.step;
      const y = layout.top + row * layout.step;
      const cell = state.cells[row]![col];
      const contributionStrength = state.map.contributionStrength[row]![col] ?? 0;
      const activeContribution = cell === 1 || cell === 4;
      const floorColors = getCellColorSet(
        palette,
        activeContribution,
        cell === 4,
        contributionStrength,
        maxContributionStrength,
      );
      const cellGradient = context.createLinearGradient(x, y, x, y + layout.square);
      cellGradient.addColorStop(0, mixColors(floorColors.fill, "#ffffff", activeContribution ? 0.12 : 0.04));
      cellGradient.addColorStop(1, mixColors(floorColors.fill, "#02040a", activeContribution ? 0.18 : 0.08));
      context.save();
      context.shadowColor = floorColors.glow;
      context.shadowBlur = activeContribution ? (cell === 4 ? 16 : 7) : 0;
      context.fillStyle = cellGradient;
      roundedRect(context, x, y, layout.square, layout.square, 6);
      context.fill();
      context.restore();
      context.strokeStyle = floorColors.stroke;
      context.lineWidth = 1;
      context.stroke();

      context.fillStyle = floorColors.sheen;
      roundedRect(
        context,
        x + 1.2,
        y + 1.2,
        layout.square - 2.4,
        Math.max(5, layout.square * 0.28),
        4,
      );
      context.fill();

      if (cell !== 4) {
        continue;
      }

      context.save();
      context.strokeStyle = withAlpha(mixColors(floorColors.fill, "#ffffff", 0.38), 0.38 + pulse * 0.3);
      context.lineWidth = 1.6;
      roundedRect(context, x + 2, y + 2, layout.square - 4, layout.square - 4, 5);
      context.stroke();
      context.strokeStyle = withAlpha(palette.powerPellet, 0.36 + pulse * 0.2);
      context.lineWidth = 0.9;
      roundedRect(context, x + 4.2, y + 4.2, layout.square - 8.4, layout.square - 8.4, 4);
      context.stroke();
      context.restore();
    }
  }

  context.save();
  roundedRect(context, innerPanelX + 4, innerPanelY + 4, innerPanelWidth - 8, innerPanelHeight - 8, 18);
  context.clip();
  context.globalCompositeOperation = "screen";
  const sweepOffset = ((state.turn * 12) % (innerPanelWidth + 200)) - 120;
  const sweepGradient = context.createLinearGradient(
    innerPanelX + sweepOffset,
    innerPanelY,
    innerPanelX + sweepOffset + 180,
    innerPanelY + innerPanelHeight,
  );
  sweepGradient.addColorStop(0, withAlpha(palette.contributionLevels[0]!, 0));
  sweepGradient.addColorStop(0.35, withAlpha(palette.contributionLevels[1]!, 0.06));
  sweepGradient.addColorStop(0.62, withAlpha(palette.contributionLevels[3]!, 0.1));
  sweepGradient.addColorStop(1, withAlpha(palette.contributionLevels[3]!, 0));
  context.fillStyle = sweepGradient;
  context.fillRect(innerPanelX, innerPanelY, innerPanelWidth, innerPanelHeight);
  context.restore();

  context.save();
  context.strokeStyle = withAlpha("#04070d", 0.7);
  context.lineWidth = Math.max(5.2, layout.gap + 3.1);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  mazeSegments.forEach((segment) => {
    const startX = layout.left + segment.x1 * layout.step - layout.gap / 2;
    const startY = layout.top + segment.y1 * layout.step - layout.gap / 2;
    const endX = layout.left + segment.x2 * layout.step - layout.gap / 2;
    const endY = layout.top + segment.y2 * layout.step - layout.gap / 2;
    context.moveTo(startX, startY);
    context.lineTo(endX, endY);
  });
  context.stroke();
  context.restore();

  context.save();
  context.strokeStyle = withAlpha("#f8fbff", 0.94);
  context.lineWidth = Math.max(2.2, layout.gap + 0.6);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.shadowColor = withAlpha("#90cdf4", 0.24);
  context.shadowBlur = 6;
  context.beginPath();
  mazeSegments.forEach((segment) => {
    const startX = layout.left + segment.x1 * layout.step - layout.gap / 2;
    const startY = layout.top + segment.y1 * layout.step - layout.gap / 2;
    const endX = layout.left + segment.x2 * layout.step - layout.gap / 2;
    const endY = layout.top + segment.y2 * layout.step - layout.gap / 2;
    context.moveTo(startX, startY);
    context.lineTo(endX, endY);
  });
  context.stroke();
  context.restore();

  drawPacman(context, state, layout, palette.pacman);

  state.ghosts.forEach((ghost, index) => {
    if (!ghost.released && ghost.releaseIn > 1) {
      return;
    }

    drawGhost(
      context,
      ghost,
      state.frightenedTurnsRemaining > 0
        ? palette.frightenedGhost
        : palette.ghosts[index % palette.ghosts.length]!,
      state.frightenedTurnsRemaining > 0,
      layout,
      palette,
    );
  });
}

export function mountPacmanDemo(root: HTMLElement, bootstrap: BrowserBootstrapData): void {
  const config = createRuntimeConfig(bootstrap);
  const layout = createBoardLayout(bootstrap.config.cellSize);
  const mazeSegments = buildMazeSegments(bootstrap.map.walls);

  root.innerHTML = "";

  const shell = document.createElement("div");
  shell.className = "demo-shell";
  root.append(shell);

  const boardFrame = document.createElement("section");
  boardFrame.className = "board-frame";

  const canvasShell = document.createElement("div");
  canvasShell.className = "canvas-shell";

  const canvas = document.createElement("canvas");
  canvas.className = "game-canvas";
  canvas.style.maxWidth = `${layout.boardWidth}px`;
  canvasShell.append(canvas);
  boardFrame.append(canvasShell);
  shell.append(boardFrame);

  const context = scaleCanvas(canvas, layout.boardWidth, layout.boardHeight);
  let state = createInitialGameState(bootstrap.map, config);
  let autoplay = bootstrap.config.autoplayMode;
  let paused = false;
  let pendingDirection: Direction | undefined;
  let timer: number | undefined;

  function render(): void {
    drawBoard(context, state, bootstrap, canvas, layout, mazeSegments);
  }

  function stopLoop(): void {
    if (timer !== undefined) {
      window.clearInterval(timer);
      timer = undefined;
    }
  }

  function startLoop(): void {
    stopLoop();
    if (paused) {
      return;
    }

    timer = window.setInterval(() => {
      if (state.finished) {
        stopLoop();
        render();
        return;
      }

      state = stepGame(state, config, autoplay ? undefined : pendingDirection);
      pendingDirection = undefined;
      render();
    }, bootstrap.config.animationSpeedMs);
  }

  function restart(): void {
    state = createInitialGameState(bootstrap.map, config);
    pendingDirection = undefined;
    paused = false;
    render();
    startLoop();
  }

  window.addEventListener("keydown", (event) => {
    if (event.key === "ArrowUp") {
      autoplay = false;
      pendingDirection = "up";
      event.preventDefault();
    } else if (event.key === "ArrowDown") {
      autoplay = false;
      pendingDirection = "down";
      event.preventDefault();
    } else if (event.key === "ArrowLeft") {
      autoplay = false;
      pendingDirection = "left";
      event.preventDefault();
    } else if (event.key === "ArrowRight") {
      autoplay = false;
      pendingDirection = "right";
      event.preventDefault();
    } else if (event.key.toLowerCase() === "r") {
      restart();
      event.preventDefault();
    }
  });

  render();
  startLoop();
}
