export const GRID_WIDTH = 52;
export const GRID_HEIGHT = 7;
export const GHOST_IDS = ["blinky", "pinky", "inky", "clyde"] as const;

export type CellValue = 0 | 1 | 2 | 3 | 4;
export type ThemeName = "github-light" | "github-dark";
export type Direction = "up" | "down" | "left" | "right";
export type GhostMode = "chase" | "scatter" | "frightened";
export type GhostId = (typeof GHOST_IDS)[number];
export type ContributionLevel =
  | "NONE"
  | "FIRST_QUARTILE"
  | "SECOND_QUARTILE"
  | "THIRD_QUARTILE"
  | "FOURTH_QUARTILE";

export interface SourceGridCell {
  commitsCount: number;
  level: ContributionLevel;
  color: string;
}

export interface ContributionSnapshot {
  columns: SourceGridCell[][];
  monthLabels: string[];
  source: "live" | "sample";
  username: string;
  fetchedAt: string;
}

export interface Position {
  row: number;
  col: number;
}

export interface GameMap {
  width: typeof GRID_WIDTH;
  height: typeof GRID_HEIGHT;
  baseCells: CellValue[][];
  walls: boolean[][];
  pelletCount: number;
  powerPelletPositions: Position[];
  pacmanSpawn: Position;
  ghostSpawn: Position;
  monthLabels: string[];
  contributionStrength: number[][];
}

export interface PacmanActor extends Position {
  direction: Direction;
  nextDirection: Direction;
  lives: number;
}

export interface GhostActor extends Position {
  id: GhostId;
  direction: Direction;
  mode: GhostMode;
  spawn: Position;
  cornerTarget: Position;
  released: boolean;
  releaseIn: number;
  stunnedTurns: number;
}

export interface GameState {
  map: GameMap;
  cells: CellValue[][];
  grid: CellValue[][];
  pacman: PacmanActor;
  ghosts: GhostActor[];
  score: number;
  pelletsRemaining: number;
  turn: number;
  finished: boolean;
  win: boolean;
  frightenedTurnsRemaining: number;
  modeClock: number;
  modePhase: "chase" | "scatter";
  ghostCombo: number;
  lastEvent: string;
}

export interface GameFrame {
  turn: number;
  grid: CellValue[][];
  walls: boolean[][];
  pacman: PacmanActor;
  ghosts: GhostActor[];
  score: number;
  pelletsRemaining: number;
  frightenedTurnsRemaining: number;
  monthLabels: string[];
  lastEvent: string;
}

export interface SimulationResult {
  initialState: GameState;
  finalState: GameState;
  frames: GameFrame[];
  source: ContributionSnapshot;
}

export interface ThemePalette {
  background: string;
  wall: string;
  floor: string;
  gridLine: string;
  pellet: string;
  contributionLevels: string[];
  powerPellet: string;
  pacman: string;
  frightenedGhost: string;
  ghosts: string[];
  text: string;
  monthLabel: string;
  scorePanel: string;
  gradientTint: string;
  gradientDeep: string;
  mazeOuter: string;
  mazeInner: string;
  eye: string;
  powerRing: string;
  shadowOpacity: number;
}

export interface GameConfig {
  githubUsername: string;
  githubToken?: string;
  animationSpeedMs: number;
  theme: ThemeName;
  ghostCount: number;
  autoplayMode: boolean;
  useLiveContributionData: boolean;
  maxTurns: number;
  frightenedTurns: number;
  cellSize: number;
  outputDir: URL;
}

export interface BrowserBootstrapData {
  source: ContributionSnapshot;
  map: GameMap;
  config: Pick<
    GameConfig,
    | "animationSpeedMs"
    | "theme"
    | "autoplayMode"
    | "frightenedTurns"
    | "ghostCount"
    | "maxTurns"
    | "cellSize"
  >;
}
