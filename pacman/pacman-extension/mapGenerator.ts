import {
  GRID_HEIGHT,
  GRID_WIDTH,
  type CellValue,
  type ContributionSnapshot,
  type GameConfig,
  type GameMap,
  type Position,
  type SourceGridCell,
} from "./types.js";

function createMatrix<T>(factory: (row: number, col: number) => T): T[][] {
  return Array.from({ length: GRID_HEIGHT }, (_, row) =>
    Array.from({ length: GRID_WIDTH }, (_, col) => factory(row, col)),
  );
}

function clonePosition(position: Position): Position {
  return { row: position.row, col: position.col };
}

function manhattanDistance(a: Position, b: Position): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

function inBounds(position: Position): boolean {
  return (
    position.row >= 0 &&
    position.row < GRID_HEIGHT &&
    position.col >= 0 &&
    position.col < GRID_WIDTH
  );
}

function normalizeColumns(columns: SourceGridCell[][]): SourceGridCell[][] {
  const trimmed = columns.slice(-GRID_WIDTH).map((column) =>
    Array.from({ length: GRID_HEIGHT }, (_, index) => {
      const cell = column[index];
      return (
        cell ?? {
          commitsCount: 0,
          level: "NONE" as const,
          color: "",
        }
      );
    }),
  );

  if (trimmed.length === GRID_WIDTH) {
    return trimmed;
  }

  return [
    ...Array.from({ length: GRID_WIDTH - trimmed.length }, () =>
      Array.from({ length: GRID_HEIGHT }, () => ({
        commitsCount: 0,
        level: "NONE" as const,
        color: "",
      })),
    ),
    ...trimmed,
  ];
}

function normalizeMonthLabels(labels: string[]): string[] {
  const trimmed = labels.slice(-GRID_WIDTH);
  return [...Array.from({ length: GRID_WIDTH - trimmed.length }, () => ""), ...trimmed];
}

function findNearestOpenCell(
  walls: boolean[][],
  preferred: Position,
  predicate: (position: Position) => boolean = () => true,
): Position | null {
  let best: Position | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let row = 0; row < GRID_HEIGHT; row += 1) {
    for (let col = 0; col < GRID_WIDTH; col += 1) {
      const position = { row, col };

      if (walls[row][col] || !predicate(position)) {
        continue;
      }

      const distance = manhattanDistance(preferred, position);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = position;
      }
    }
  }

  return best;
}

function carveCell(baseCells: CellValue[][], walls: boolean[][], position: Position): void {
  if (!inBounds(position)) {
    return;
  }

  walls[position.row][position.col] = false;
  if (baseCells[position.row][position.col] === 0) {
    baseCells[position.row][position.col] = 0;
  }
}

function carveRoom(
  baseCells: CellValue[][],
  walls: boolean[][],
  center: Position,
  radius: number,
): void {
  for (let row = center.row - radius; row <= center.row + radius; row += 1) {
    for (let col = center.col - radius; col <= center.col + radius; col += 1) {
      carveCell(baseCells, walls, { row, col });
    }
  }
}

function carvePath(
  baseCells: CellValue[][],
  walls: boolean[][],
  from: Position,
  to: Position,
): void {
  let current = clonePosition(from);
  carveCell(baseCells, walls, current);

  while (current.col !== to.col || current.row !== to.row) {
    if (current.col !== to.col) {
      current = {
        row: current.row,
        col: current.col + Math.sign(to.col - current.col),
      };
    } else {
      current = {
        row: current.row + Math.sign(to.row - current.row),
        col: current.col,
      };
    }

    carveCell(baseCells, walls, current);
  }
}

function collectOpenCells(walls: boolean[][]): Position[] {
  const openCells: Position[] = [];

  for (let row = 0; row < GRID_HEIGHT; row += 1) {
    for (let col = 0; col < GRID_WIDTH; col += 1) {
      if (!walls[row][col]) {
        openCells.push({ row, col });
      }
    }
  }

  return openCells;
}

function collectConnectedComponents(walls: boolean[][]): Position[][] {
  const visited = new Set<string>();
  const components: Position[][] = [];
  const deltas = [
    { row: -1, col: 0 },
    { row: 1, col: 0 },
    { row: 0, col: -1 },
    { row: 0, col: 1 },
  ];

  for (const origin of collectOpenCells(walls)) {
    const key = `${origin.row}:${origin.col}`;
    if (visited.has(key)) {
      continue;
    }

    const queue = [origin];
    const component: Position[] = [];
    visited.add(key);

    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);

      for (const delta of deltas) {
        const next = {
          row: current.row + delta.row,
          col: current.col + delta.col,
        };

        if (!inBounds(next) || walls[next.row][next.col]) {
          continue;
        }

        const nextKey = `${next.row}:${next.col}`;
        if (visited.has(nextKey)) {
          continue;
        }

        visited.add(nextKey);
        queue.push(next);
      }
    }

    components.push(component);
  }

  return components;
}

function connectComponents(baseCells: CellValue[][], walls: boolean[][]): void {
  let components = collectConnectedComponents(walls);

  while (components.length > 1) {
    components.sort((left, right) => right.length - left.length);
    const primary = components[0]!;
    const secondary = components[1]!;
    let bestPair: [Position, Position] | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const source of primary) {
      for (const target of secondary) {
        const distance = manhattanDistance(source, target);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestPair = [source, target];
        }
      }
    }

    if (!bestPair) {
      break;
    }

    carvePath(baseCells, walls, bestPair[0], bestPair[1]);
    components = collectConnectedComponents(walls);
  }
}

function choosePowerPellets(
  baseCells: CellValue[][],
  contributionStrength: number[][],
  blocked: Position[],
): Position[] {
  const corners: Position[] = [
    { row: 0, col: 0 },
    { row: 0, col: GRID_WIDTH - 1 },
    { row: GRID_HEIGHT - 1, col: GRID_WIDTH - 1 },
    { row: GRID_HEIGHT - 1, col: 0 },
  ];
  const blockedKeys = new Set(blocked.map((position) => `${position.row}:${position.col}`));
  const chosen: Position[] = [];
  const chosenKeys = new Set<string>();

  for (const corner of corners) {
    let best: Position | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let row = 0; row < GRID_HEIGHT; row += 1) {
      for (let col = 0; col < GRID_WIDTH; col += 1) {
        const position = { row, col };
        const key = `${row}:${col}`;

        if (baseCells[row][col] !== 1 || blockedKeys.has(key) || chosenKeys.has(key)) {
          continue;
        }

        const score =
          contributionStrength[row][col] * 10 -
          manhattanDistance(position, corner) * 2 -
          manhattanDistance(position, { row: 3, col: Math.floor(GRID_WIDTH / 2) });

        if (score > bestScore) {
          bestScore = score;
          best = position;
        }
      }
    }

    if (best) {
      baseCells[best.row][best.col] = 4;
      chosen.push(best);
      chosenKeys.add(`${best.row}:${best.col}`);
    }
  }

  return chosen;
}

function ensureStarterPellets(baseCells: CellValue[][], walls: boolean[][]): Position[] {
  const pellets: Position[] = [];
  const starterCells = [
    { row: 3, col: 2 },
    { row: 3, col: 3 },
    { row: 3, col: 4 },
    { row: 2, col: 4 },
  ];

  for (const position of starterCells) {
    carveCell(baseCells, walls, position);
    baseCells[position.row][position.col] =
      position.row === 2 && position.col === 4 ? 4 : 1;
    pellets.push(position);
  }

  return pellets;
}

export function generateGameMap(
  snapshot: ContributionSnapshot,
  _config: GameConfig,
): GameMap {
  const normalizedColumns = normalizeColumns(snapshot.columns);
  const monthLabels = normalizeMonthLabels(snapshot.monthLabels);
  const baseCells = createMatrix<CellValue>(() => 0);
  const contributionStrength = createMatrix<number>(() => 0);
  const walls = createMatrix<boolean>(() => true);

  for (let col = 0; col < GRID_WIDTH; col += 1) {
    const sourceColumn = normalizedColumns[col]!;
    for (let row = 0; row < GRID_HEIGHT; row += 1) {
      const cell = sourceColumn[row]!;
      contributionStrength[row][col] = cell.commitsCount;

      if (cell.level !== "NONE" && cell.commitsCount > 0) {
        baseCells[row][col] = 1;
        walls[row][col] = false;
      }
    }
  }

  const pacmanPreferred = { row: 3, col: 1 };
  const ghostPreferred = { row: 3, col: Math.floor(GRID_WIDTH / 2) };
  const pacmanSpawn =
    findNearestOpenCell(walls, pacmanPreferred, (position) => position.col < 12) ??
    pacmanPreferred;
  const ghostSpawn =
    findNearestOpenCell(walls, ghostPreferred, (position) => position.col > 16 && position.col < 36) ??
    ghostPreferred;

  carveRoom(baseCells, walls, pacmanSpawn, 1);
  carveRoom(baseCells, walls, ghostSpawn, 1);

  const nearestPelletToSpawn =
    findNearestOpenCell(walls, pacmanSpawn, (position) => baseCells[position.row][position.col] === 1) ??
    ghostSpawn;
  const nearestPelletToHouse =
    findNearestOpenCell(walls, ghostSpawn, (position) => baseCells[position.row][position.col] === 1) ??
    pacmanSpawn;

  carvePath(baseCells, walls, pacmanSpawn, nearestPelletToSpawn);
  carvePath(baseCells, walls, ghostSpawn, nearestPelletToHouse);
  carvePath(baseCells, walls, ghostSpawn, pacmanSpawn);
  connectComponents(baseCells, walls);

  const powerPelletPositions = choosePowerPellets(baseCells, contributionStrength, [
    pacmanSpawn,
    ghostSpawn,
  ]);

  let pelletCount = 0;
  for (let row = 0; row < GRID_HEIGHT; row += 1) {
    for (let col = 0; col < GRID_WIDTH; col += 1) {
      if (baseCells[row][col] === 1 || baseCells[row][col] === 4) {
        pelletCount += 1;
      }
    }
  }

  if (pelletCount === 0) {
    const fallbackPellets = ensureStarterPellets(baseCells, walls);
    pelletCount = fallbackPellets.length;
    if (powerPelletPositions.length === 0) {
      powerPelletPositions.push(fallbackPellets[fallbackPellets.length - 1]!);
    }
  }

  baseCells[pacmanSpawn.row][pacmanSpawn.col] = 0;
  baseCells[ghostSpawn.row][ghostSpawn.col] = 0;
  pelletCount = 0;

  for (let row = 0; row < GRID_HEIGHT; row += 1) {
    for (let col = 0; col < GRID_WIDTH; col += 1) {
      if (baseCells[row][col] === 1 || baseCells[row][col] === 4) {
        pelletCount += 1;
      }
    }
  }

  return {
    width: GRID_WIDTH,
    height: GRID_HEIGHT,
    baseCells,
    walls,
    pelletCount,
    powerPelletPositions,
    pacmanSpawn,
    ghostSpawn,
    monthLabels,
    contributionStrength,
  };
}
