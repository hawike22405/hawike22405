import { GRID_HEIGHT, GRID_WIDTH, } from "./types.js";
const DIRECTION_ORDER = ["up", "left", "down", "right"];
const DIRECTION_VECTORS = {
    up: { row: -1, col: 0 },
    down: { row: 1, col: 0 },
    left: { row: 0, col: -1 },
    right: { row: 0, col: 1 },
};
function key(position) {
    return `${position.row}:${position.col}`;
}
function inBounds(position) {
    return (position.row >= 0 &&
        position.row < GRID_HEIGHT &&
        position.col >= 0 &&
        position.col < GRID_WIDTH);
}
export function getOppositeDirection(direction) {
    switch (direction) {
        case "up":
            return "down";
        case "down":
            return "up";
        case "left":
            return "right";
        case "right":
            return "left";
    }
}
export function directionToVector(direction) {
    return DIRECTION_VECTORS[direction];
}
export function isWalkable(state, position) {
    return inBounds(position) && !state.map.walls[position.row][position.col];
}
export function manhattanDistance(a, b) {
    return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}
export function getNeighbors(state, position, currentDirection) {
    const opposite = currentDirection ? getOppositeDirection(currentDirection) : null;
    const candidates = DIRECTION_ORDER.map((direction) => {
        const vector = directionToVector(direction);
        return {
            position: {
                row: position.row + vector.row,
                col: position.col + vector.col,
            },
            direction,
        };
    }).filter((candidate) => isWalkable(state, candidate.position));
    if (candidates.length <= 1 || !opposite) {
        return candidates;
    }
    const filtered = candidates.filter((candidate) => candidate.direction !== opposite);
    return filtered.length > 0 ? filtered : candidates;
}
export function bfsToGoal(state, start, isGoal, blockPosition = () => false) {
    const queue = [start];
    const visited = new Set([key(start)]);
    const parent = new Map();
    while (queue.length > 0) {
        const current = queue.shift();
        if (isGoal(current) && key(current) !== key(start)) {
            const path = [];
            let cursor = key(current);
            while (cursor !== key(start)) {
                const [row, col] = cursor.split(":").map(Number);
                path.unshift({ row, col });
                cursor = parent.get(cursor);
            }
            return path;
        }
        for (const neighbor of getNeighbors(state, current)) {
            const nextKey = key(neighbor.position);
            if (visited.has(nextKey) || blockPosition(neighbor.position)) {
                continue;
            }
            visited.add(nextKey);
            parent.set(nextKey, key(current));
            queue.push(neighbor.position);
        }
    }
    return null;
}
export function bfsPath(state, start, target, blockPosition = () => false) {
    return bfsToGoal(state, start, (position) => position.row === target.row && position.col === target.col, blockPosition);
}
function findNearestWalkable(state, target) {
    if (isWalkable(state, target)) {
        return target;
    }
    const queue = [target];
    const visited = new Set([key(target)]);
    while (queue.length > 0) {
        const current = queue.shift();
        for (const direction of DIRECTION_ORDER) {
            const vector = directionToVector(direction);
            const next = {
                row: current.row + vector.row,
                col: current.col + vector.col,
            };
            if (!inBounds(next)) {
                continue;
            }
            const nextKey = key(next);
            if (visited.has(nextKey)) {
                continue;
            }
            if (isWalkable(state, next)) {
                return next;
            }
            visited.add(nextKey);
            queue.push(next);
        }
    }
    return { row: Math.min(Math.max(target.row, 0), GRID_HEIGHT - 1), col: Math.min(Math.max(target.col, 0), GRID_WIDTH - 1) };
}
function projectAhead(position, direction, distance) {
    const vector = directionToVector(direction);
    return {
        row: position.row + vector.row * distance,
        col: position.col + vector.col * distance,
    };
}
function resolveChaseTarget(ghost, state) {
    switch (ghost.id) {
        case "blinky":
            return state.pacman;
        case "pinky":
            return projectAhead(state.pacman, state.pacman.direction, 4);
        case "inky": {
            const projected = projectAhead(state.pacman, state.pacman.direction, 2);
            return {
                row: projected.row + (projected.row - ghost.row),
                col: projected.col + (projected.col - ghost.col),
            };
        }
        case "clyde":
            return manhattanDistance(ghost, state.pacman) <= 6 ? ghost.cornerTarget : state.pacman;
    }
}
function resolveMode(ghost, state) {
    if (state.frightenedTurnsRemaining > 0) {
        return "frightened";
    }
    return state.modePhase;
}
export function chooseGhostStep(ghost, state) {
    const mode = resolveMode(ghost, state);
    const neighbors = getNeighbors(state, ghost, ghost.direction);
    if (neighbors.length === 0) {
        return {
            position: { row: ghost.row, col: ghost.col },
            direction: ghost.direction,
            mode,
        };
    }
    if (mode === "frightened") {
        const ranked = neighbors
            .map((neighbor) => {
            const path = bfsPath(state, neighbor.position, state.pacman);
            return {
                ...neighbor,
                distance: path?.length ?? Number.POSITIVE_INFINITY,
            };
        })
            .sort((left, right) => right.distance - left.distance);
        const best = ranked[0];
        return {
            position: best.position,
            direction: best.direction,
            mode,
        };
    }
    const target = mode === "scatter" ? ghost.cornerTarget : resolveChaseTarget(ghost, state);
    const resolvedTarget = findNearestWalkable(state, target);
    const path = bfsPath(state, ghost, resolvedTarget);
    const nextPosition = path?.[0];
    if (nextPosition) {
        const direction = nextPosition.row < ghost.row
            ? "up"
            : nextPosition.row > ghost.row
                ? "down"
                : nextPosition.col < ghost.col
                    ? "left"
                    : "right";
        return {
            position: nextPosition,
            direction,
            mode,
        };
    }
    const fallback = neighbors[0];
    return {
        position: fallback.position,
        direction: fallback.direction,
        mode,
    };
}
//# sourceMappingURL=ghostAI.js.map