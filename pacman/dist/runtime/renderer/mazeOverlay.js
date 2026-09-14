export function buildMazeSegments(walls) {
    const height = walls.length;
    const width = walls[0]?.length ?? 0;
    const segments = [];
    for (let rowBoundary = 0; rowBoundary <= height; rowBoundary += 1) {
        let start = null;
        for (let col = 0; col < width; col += 1) {
            const topOpen = rowBoundary > 0 ? !walls[rowBoundary - 1][col] : false;
            const bottomOpen = rowBoundary < height ? !walls[rowBoundary][col] : false;
            const boundary = topOpen !== bottomOpen;
            if (boundary && start === null) {
                start = col;
            }
            else if (!boundary && start !== null) {
                segments.push({ x1: start, y1: rowBoundary, x2: col, y2: rowBoundary });
                start = null;
            }
        }
        if (start !== null) {
            segments.push({ x1: start, y1: rowBoundary, x2: width, y2: rowBoundary });
        }
    }
    for (let colBoundary = 0; colBoundary <= width; colBoundary += 1) {
        let start = null;
        for (let row = 0; row < height; row += 1) {
            const leftOpen = colBoundary > 0 ? !walls[row][colBoundary - 1] : false;
            const rightOpen = colBoundary < width ? !walls[row][colBoundary] : false;
            const boundary = leftOpen !== rightOpen;
            if (boundary && start === null) {
                start = row;
            }
            else if (!boundary && start !== null) {
                segments.push({ x1: colBoundary, y1: start, x2: colBoundary, y2: row });
                start = null;
            }
        }
        if (start !== null) {
            segments.push({ x1: colBoundary, y1: start, x2: colBoundary, y2: height });
        }
    }
    return segments;
}
//# sourceMappingURL=mazeOverlay.js.map