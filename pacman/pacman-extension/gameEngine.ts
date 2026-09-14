import {
  bfsToGoal,
  chooseGhostStep,
  directionToVector,
  getNeighbors,
  manhattanDistance,
} from "./ghostAI.js";
import { consumeCurrentCell, resolveGhostCollision, tickPowerupTimer } from "./powerups.js";
import {
  GHOST_IDS,
  GRID_HEIGHT,
  GRID_WIDTH,
  type CellValue,
  type Direction,
  type GameConfig,
  type GameFrame,
  type GameMap,
  type GameState,
  type GhostActor,
  type Position,
  type SimulationResult,
} from "./types.js";

const MODE_DURATIONS = {
  scatter: 10,
  chase: 18,
} as const;

function cloneGrid(grid: CellValue[][]): CellValue[][] {
  return grid.map((row) => [...row]);
}

function cloneGhosts(ghosts: GhostActor[]): GhostActor[] {
  return ghosts.map((ghost) => ({
    ...ghost,
    spawn: { ...ghost.spawn },
    cornerTarget: { ...ghost.cornerTarget },
  }));
}

function cloneState(state: GameState): GameState {
  return {
    ...state,
    map: state.map,
    cells: cloneGrid(state.cells),
    grid: cloneGrid(state.grid),
    pacman: { ...state.pacman },
    ghosts: cloneGhosts(state.ghosts),
  };
}

function positionKey(position: Position): string {
  return `${position.row}:${position.col}`;
}

function isWalkable(map: GameMap, position: Position): boolean {
  return (
    position.row >= 0 &&
    position.row < GRID_HEIGHT &&
    position.col >= 0 &&
    position.col < GRID_WIDTH &&
    !map.walls[position.row][position.col]
  );
}

function buildGhostSpawnSlots(map: GameMap): Position[] {
  const preferred: Position[] = [
    map.ghostSpawn,
    { row: map.ghostSpawn.row, col: map.ghostSpawn.col - 1 },
    { row: map.ghostSpawn.row, col: map.ghostSpawn.col + 1 },
    { row: map.ghostSpawn.row - 1, col: map.ghostSpawn.col },
  ];

  return preferred.map((position) =>
    isWalkable(map, position) ? position : map.ghostSpawn,
  );
}

function buildRenderGrid(
  cells: CellValue[][],
  pacman: GameState["pacman"],
  ghosts: GhostActor[],
): CellValue[][] {
  const grid = cloneGrid(cells);
  grid[pacman.row][pacman.col] = 2;

  for (const ghost of ghosts) {
    if (ghost.released || ghost.releaseIn <= 1) {
      grid[ghost.row][ghost.col] = 3;
    }
  }

  return grid;
}

function captureFrame(state: GameState): GameFrame {
  return {
    turn: state.turn,
    grid: cloneGrid(state.grid),
    walls: state.map.walls.map((row) => [...row]),
    pacman: { ...state.pacman },
    ghosts: cloneGhosts(state.ghosts),
    score: state.score,
    pelletsRemaining: state.pelletsRemaining,
    frightenedTurnsRemaining: state.frightenedTurnsRemaining,
    monthLabels: [...state.map.monthLabels],
    lastEvent: state.lastEvent,
  };
}

function nextDirection(
  position: Position,
  direction: Direction,
): Position {
  const vector = directionToVector(direction);
  return {
    row: position.row + vector.row,
    col: position.col + vector.col,
  };
}

function canMove(map: GameMap, position: Position, direction: Direction): boolean {
  return isWalkable(map, nextDirection(position, direction));
}

function determinePacmanDirection(
  state: GameState,
  config: GameConfig,
  requestedDirection?: Direction,
): Direction {
  if (requestedDirection) {
    state.pacman.nextDirection = requestedDirection;
  } else if (config.autoplayMode) {
    state.pacman.nextDirection = chooseAutoplayDirection(state);
  }

  if (canMove(state.map, state.pacman, state.pacman.nextDirection)) {
    return state.pacman.nextDirection;
  }

  if (canMove(state.map, state.pacman, state.pacman.direction)) {
    return state.pacman.direction;
  }

  return state.pacman.direction;
}

function chooseAutoplayDirection(state: GameState): Direction {
  const danger = new Set<string>();

  if (state.frightenedTurnsRemaining === 0) {
    for (const ghost of state.ghosts) {
      if (!ghost.released || ghost.stunnedTurns > 0) {
        continue;
      }

      danger.add(positionKey(ghost));
      for (const neighbor of getNeighbors(state, ghost, ghost.direction)) {
        danger.add(positionKey(neighbor.position));
      }
    }
  }

  const shouldPrioritizePowerPellet =
    state.frightenedTurnsRemaining === 0 &&
    state.ghosts.some((ghost) => ghost.released && manhattanDistance(ghost, state.pacman) <= 6);

  const findPath = (preferPowerPellets: boolean, avoidDanger: boolean): Position[] | null =>
    bfsToGoal(
      state,
      state.pacman,
      (position) => {
        const cell = state.cells[position.row][position.col];
        return preferPowerPellets ? cell === 4 : cell === 1 || cell === 4;
      },
      (position) => avoidDanger && danger.has(positionKey(position)) && positionKey(position) !== positionKey(state.pacman),
    );

  const path =
    (shouldPrioritizePowerPellet && findPath(true, true)) ||
    findPath(false, true) ||
    (shouldPrioritizePowerPellet && findPath(true, false)) ||
    findPath(false, false);

  const nextStep = path?.[0];
  if (!nextStep) {
    return state.pacman.direction;
  }

  if (nextStep.row < state.pacman.row) {
    return "up";
  }

  if (nextStep.row > state.pacman.row) {
    return "down";
  }

  if (nextStep.col < state.pacman.col) {
    return "left";
  }

  return "right";
}

function advanceModeTimers(state: GameState): void {
  if (state.frightenedTurnsRemaining > 0) {
    tickPowerupTimer(state);
    return;
  }

  state.modeClock += 1;
  const duration = MODE_DURATIONS[state.modePhase];

  if (state.modeClock >= duration) {
    state.modeClock = 0;
    state.modePhase = state.modePhase === "scatter" ? "chase" : "scatter";
    state.lastEvent = `${state.modePhase} mode`;
  }
}

function releaseGhosts(state: GameState): void {
  for (const ghost of state.ghosts) {
    if (ghost.released) {
      if (ghost.stunnedTurns > 0) {
        ghost.stunnedTurns -= 1;
      }
      continue;
    }

    if (ghost.releaseIn > 0) {
      ghost.releaseIn -= 1;
    }

    if (ghost.releaseIn === 0) {
      ghost.released = true;
      ghost.stunnedTurns = 0;
    }
  }
}

function movePacman(state: GameState, config: GameConfig, requestedDirection?: Direction): Position {
  const previous = { row: state.pacman.row, col: state.pacman.col };
  const direction = determinePacmanDirection(state, config, requestedDirection);
  state.pacman.direction = direction;

  const target = nextDirection(state.pacman, direction);
  if (isWalkable(state.map, target)) {
    state.pacman.row = target.row;
    state.pacman.col = target.col;
  }

  consumeCurrentCell(state, config);
  return previous;
}

function moveGhosts(state: GameState, pacmanPreviousPosition: Position): void {
  for (const ghost of state.ghosts) {
    if (!ghost.released || state.finished) {
      continue;
    }

    const ghostPrevious = { row: ghost.row, col: ghost.col };
    const step = chooseGhostStep(ghost, state);
    ghost.row = step.position.row;
    ghost.col = step.position.col;
    ghost.direction = step.direction;
    ghost.mode = step.mode;

    const crossed =
      ghostPrevious.row === state.pacman.row &&
      ghostPrevious.col === state.pacman.col &&
      pacmanPreviousPosition.row === ghost.row &&
      pacmanPreviousPosition.col === ghost.col;

    if (crossed) {
      ghost.row = state.pacman.row;
      ghost.col = state.pacman.col;
    }

    if (resolveGhostCollision(state, ghost)) {
      if (state.finished) {
        return;
      }
    }
  }
}

function buildGhosts(map: GameMap, ghostCount: number): GhostActor[] {
  const corners: Position[] = [
    { row: 0, col: GRID_WIDTH - 1 },
    { row: 0, col: 0 },
    { row: GRID_HEIGHT - 1, col: GRID_WIDTH - 1 },
    { row: GRID_HEIGHT - 1, col: 0 },
  ];
  const spawnSlots = buildGhostSpawnSlots(map);

  return GHOST_IDS.slice(0, ghostCount).map((id, index) => ({
    id,
    row: spawnSlots[index]!.row,
    col: spawnSlots[index]!.col,
    direction: index % 2 === 0 ? "left" : "right",
    mode: "scatter",
    spawn: { ...spawnSlots[index]! },
    cornerTarget: corners[index]!,
    released: index === 0,
    releaseIn: index === 0 ? 0 : 6 + index * 8,
    stunnedTurns: 0,
  }));
}

export function createInitialGameState(map: GameMap, config: GameConfig): GameState {
  const cells = cloneGrid(map.baseCells);
  const pacman = {
    row: map.pacmanSpawn.row,
    col: map.pacmanSpawn.col,
    direction: "right" as const,
    nextDirection: "right" as const,
    lives: 1,
  };
  const ghosts = buildGhosts(map, config.ghostCount);
  const state: GameState = {
    map,
    cells,
    grid: buildRenderGrid(cells, pacman, ghosts),
    pacman,
    ghosts,
    score: 0,
    pelletsRemaining: map.pelletCount,
    turn: 0,
    finished: false,
    win: false,
    frightenedTurnsRemaining: 0,
    modeClock: 0,
    modePhase: "scatter",
    ghostCombo: 0,
    lastEvent: "Ready",
  };

  return state;
}

export function stepGame(
  previousState: GameState,
  config: GameConfig,
  requestedDirection?: Direction,
): GameState {
  if (previousState.finished) {
    return previousState;
  }

  const state = cloneState(previousState);
  state.turn += 1;

  advanceModeTimers(state);
  releaseGhosts(state);

  const pacmanPreviousPosition = movePacman(state, config, requestedDirection);

  for (const ghost of state.ghosts) {
    if (resolveGhostCollision(state, ghost) && state.finished) {
      state.grid = buildRenderGrid(state.cells, state.pacman, state.ghosts);
      return state;
    }
  }

  moveGhosts(state, pacmanPreviousPosition);

  if (state.pelletsRemaining <= 0) {
    state.finished = true;
    state.win = true;
    state.lastEvent = "Board cleared";
  }

  if (!state.finished && state.turn >= config.maxTurns) {
    state.finished = true;
    state.win = false;
    state.lastEvent = "Turn limit reached";
  }

  state.grid = buildRenderGrid(state.cells, state.pacman, state.ghosts);
  return state;
}

export function simulateGame(
  map: GameMap,
  source: SimulationResult["source"],
  config: GameConfig,
): SimulationResult {
  let current = createInitialGameState(map, config);
  const initialState = cloneState(current);
  const frames: GameFrame[] = [captureFrame(current)];

  while (!current.finished) {
    current = stepGame(current, config);
    frames.push(captureFrame(current));
  }

  return {
    initialState,
    finalState: current,
    frames,
    source,
  };
}

export { buildRenderGrid };
