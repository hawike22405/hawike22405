import { GHOST_IDS } from "./types.js";
export function consumeCurrentCell(state, config) {
    const { row, col } = state.pacman;
    const cell = state.cells[row][col];
    if (cell === 1) {
        state.cells[row][col] = 0;
        state.score += 10;
        state.pelletsRemaining -= 1;
        state.lastEvent = "Pellet collected";
        return;
    }
    if (cell === 4) {
        state.cells[row][col] = 0;
        state.score += 50;
        state.pelletsRemaining -= 1;
        state.frightenedTurnsRemaining = config.frightenedTurns;
        state.ghostCombo = 0;
        state.lastEvent = "Power pellet activated";
    }
}
export function resolveGhostCollision(state, ghost) {
    if (ghost.row !== state.pacman.row || ghost.col !== state.pacman.col) {
        return false;
    }
    if (state.frightenedTurnsRemaining > 0) {
        state.ghostCombo += 1;
        state.score += 200 * 2 ** (state.ghostCombo - 1);
        ghost.row = ghost.spawn.row;
        ghost.col = ghost.spawn.col;
        ghost.released = false;
        ghost.releaseIn = 4 + GHOST_IDS.indexOf(ghost.id) * 4;
        ghost.direction = "up";
        ghost.mode = "scatter";
        ghost.stunnedTurns = 1;
        state.lastEvent = `${ghost.id} eaten`;
        return true;
    }
    state.finished = true;
    state.win = false;
    state.pacman.lives = Math.max(0, state.pacman.lives - 1);
    state.lastEvent = `${ghost.id} caught Pac-Man`;
    return true;
}
export function tickPowerupTimer(state) {
    if (state.frightenedTurnsRemaining === 0) {
        return;
    }
    state.frightenedTurnsRemaining -= 1;
    if (state.frightenedTurnsRemaining === 0) {
        state.ghostCombo = 0;
        state.lastEvent = "Frightened mode faded";
    }
}
//# sourceMappingURL=powerups.js.map