export const GAP = 8; // Gap between tiles in pixels
export const FOCUS_CROP_REDUCTION = 0.7;
// export const MIN_ASPECT_RATIO_DEFAULT = 9/16; // 0.5625
export const MIN_ASPECT_RATIO_DEFAULT = 3 / 4; // 0.75 - borrowed from GMeet
export default class DynamicVideoLayout {
    minAspectRatio = MIN_ASPECT_RATIO_DEFAULT;
    getTileMinRatio(tile) {
        if (!tile.canBeCropped)
            return tile.aspectRatio;
        if (tile.aspectRatio < this.minAspectRatio)
            return tile.aspectRatio;
        return tile.isFocused
            ? this.minAspectRatio + (tile.aspectRatio - this.minAspectRatio) * (1 - FOCUS_CROP_REDUCTION)
            : this.minAspectRatio;
    }
    oneLineLayout(tiles, w, h) {
        const width = w - GAP * (tiles.length - 1);
        const viewRatio = width / h;
        const sumMaxRatio = tiles.reduce((acc, tile) => acc + tile.aspectRatio, 0);
        const minRatios = tiles.map(tile => this.getTileMinRatio(tile));
        const sumMinRatio = minRatios.reduce((acc, ratio) => acc + ratio, 0);
        // 3 cases:
        //    1) viewRatio <= sumMinRatio => cropCoefficient = 1, layoutAr = sumMinRatio, height = width / sumMinRatio
        //    2) sumMinRatio < viewRatio < sumMaxRatio => calculate cropCoefficient using (viewRatio - sumMinRatio) / (sumMaxRatio - sumMinRatio), height = width / viewRatio
        //    3) sumMaxRatio <= viewRatio => cropCoefficient = 0 height limited, outputHeight = h
        if (viewRatio <= sumMinRatio) {
            return { cropCoefficient: 1, height: width / sumMinRatio, minRatios };
        }
        else if (sumMinRatio < viewRatio && viewRatio < sumMaxRatio) {
            const cropCoefficient = (sumMaxRatio - viewRatio) / (sumMaxRatio - sumMinRatio);
            return { cropCoefficient, height: width / viewRatio, minRatios };
        }
        else {
            return { cropCoefficient: 0, height: h, minRatios };
        }
    }
    calculateLayout(tiles, w, h) {
        const { height, cropCoefficient, minRatios } = this.oneLineLayout(tiles, w, h);
        const y = (h - height) / 2;
        let offsetX = 0;
        const outputTiles = [];
        for (let i = 0; i < tiles.length; i++) {
            const tile = tiles[i];
            const outputTile = {
                id: tile.id,
                x: offsetX,
                y,
                cropRatio: tile.aspectRatio,
                width: tile.aspectRatio * height,
                height,
            };
            if (tile.canBeCropped) {
                outputTile.cropRatio = tile.aspectRatio - (tile.aspectRatio - minRatios[i]) * cropCoefficient;
                outputTile.width = outputTile.cropRatio * height;
            }
            offsetX += outputTile.width + GAP;
            outputTiles.push(outputTile);
        }
        offsetX -= GAP;
        if (offsetX < w - 1) {
            const shiftX = (w - 1 - offsetX) / 2;
            outputTiles.forEach(tile => tile.x += shiftX);
        }
        const viewportUse = (offsetX * height) / (w * h);
        return { tiles: outputTiles, viewportUse, height, rows: 1 };
    }
    calculateRowCost(tiles, minTileRatios, rowAspectRatio, startIdx, endIdx) {
        let sumMinRatio = 0;
        let sumActualRatio = 0;
        for (let i = startIdx; i <= endIdx; i++) {
            sumMinRatio += minTileRatios[i];
            sumActualRatio += tiles[i].aspectRatio;
        }
        // Priority 1: Penalty if minRatio sum exceeds rowAspectRatio
        // const constraint1Penalty = sumMinRatio > rowAspectRatio ? Math.pow(sumMinRatio - rowAspectRatio, 2) * 1000 : 0;
        const constraint1Penalty = 0;
        // Priority 2: Minimize squared difference from optimal
        const constraint2Cost = Math.pow(rowAspectRatio - sumActualRatio, 2);
        return constraint1Penalty + constraint2Cost;
    }
    distributeTilesToRows(tiles, rows, rowAspectRatio) {
        // simple case that cannot be optimized
        if (tiles.length === rows) {
            return tiles.map(tile => [tile]);
        }
        const minTileRatios = tiles.map(tile => this.getTileMinRatio(tile));
        // Has to keep the original order of the tiles.
        // For example, for tiles A, B, C and two rows possible distributions
        // could only be [[A,B],[C]], or [[A], [B, C]].
        // Tile swaps like [[A, C], [B]] are not allowed.
        // Each row shall have at least one tile
        // (effectively for tiles A ... K that A is always in the row N0, and K is in row N(rows - 1)
        // Optimization goals (in descending priority):
        //   1. keep sums for minTileRatios for all rows below rowAspectRatio
        //   2. minimize the sum of (rowAspectRatio - sum(tile.aspectRatio)) ^ 2
        // Dynamic programming approach to find optimal distribution
        const n = tiles.length;
        const memo = new Map();
        // Recursive function with memoization
        const findOptimalDistribution = (tileIndex, remainingRows) => {
            if (remainingRows === 1) {
                // All remaining tiles go to the last row
                const cost = this.calculateRowCost(tiles, minTileRatios, rowAspectRatio, tileIndex, n - 1);
                return { cost, distribution: [n - tileIndex] };
            }
            if (tileIndex >= n) {
                return { cost: Infinity, distribution: [] };
            }
            const key = `${tileIndex}-${remainingRows}`;
            if (memo.has(key)) {
                return memo.get(key);
            }
            let bestCost = Infinity;
            let bestDistribution = [];
            // Try different numbers of tiles for the current row
            // Minimum 1 tile, maximum (n - tileIndex - remainingRows + 1) tiles
            // (to ensure remaining rows have at least 1 tile each)
            const maxTilesInCurrentRow = n - tileIndex - remainingRows + 1;
            for (let tilesInCurrentRow = 1; tilesInCurrentRow <= maxTilesInCurrentRow; tilesInCurrentRow++) {
                const currentRowCost = this.calculateRowCost(tiles, minTileRatios, rowAspectRatio, tileIndex, tileIndex + tilesInCurrentRow - 1);
                const remainingResult = findOptimalDistribution(tileIndex + tilesInCurrentRow, remainingRows - 1);
                const totalCost = currentRowCost + remainingResult.cost;
                if (totalCost < bestCost) {
                    bestCost = totalCost;
                    bestDistribution = [tilesInCurrentRow, ...remainingResult.distribution];
                }
            }
            const result = { cost: bestCost, distribution: bestDistribution };
            memo.set(key, result);
            return result;
        };
        const { distribution } = findOptimalDistribution(0, rows);
        // Convert distribution to actual tile arrays
        const result = [];
        let currentIndex = 0;
        for (const rowSize of distribution) {
            const rowTiles = [];
            for (let i = 0; i < rowSize; i++) {
                rowTiles.push(tiles[currentIndex + i]);
            }
            result.push(rowTiles);
            currentIndex += rowSize;
        }
        return result;
    }
    calculateMultiRowLayout(tiles, w, h, rows = 1) {
        if (rows === 1)
            return this.calculateLayout(tiles, w, h);
        // adjust rows to match the number of tiles
        if (tiles.length < rows) {
            rows = tiles.length;
        }
        const usableHeight = h - GAP * (rows - 1);
        const rowHeight = usableHeight / rows;
        // assumes that the viewport is divided into `rows` equal parts.
        const rowAspectRatio = w / rowHeight;
        const distributedTiles = this.distributeTilesToRows(tiles, rows, rowAspectRatio);
        const rowLayouts = distributedTiles.map(rowTiles => this.calculateLayout(rowTiles, w, rowHeight));
        const minRowHeight = Math.min(...rowLayouts.map(layout => layout.height));
        const layoutHeight = minRowHeight * rows + GAP * (rows - 1);
        const yOffset = (h - layoutHeight) / 2;
        const newRowLayouts = distributedTiles.map(rowTiles => this.calculateLayout(rowTiles, w, minRowHeight));
        const layoutTiles = [];
        newRowLayouts.forEach(({ tiles }, row) => tiles.forEach(tile => {
            tile.y = yOffset + row * (minRowHeight + GAP);
            layoutTiles.push(tile);
        }));
        return {
            tiles: layoutTiles,
            rows,
            height: minRowHeight * rows + GAP * (rows - 1),
            viewportUse: newRowLayouts.reduce((sum, layout) => sum + layout.viewportUse, 0) * minRowHeight / h,
        };
    }
    // the expensive one, costs ~2ms on M1 Pro for 16 tiles, and up to 6-8ms for 25 tiles
    // TODO optimize to slightly prioritize more non-cropped layouts
    findOptimalLayout(tiles, w, h) {
        if (tiles.length === 1)
            return this.calculateLayout(tiles, w, h);
        const firstAttempts = Array.from({ length: Math.min(tiles.length, 5) }, (_, i) => this.calculateMultiRowLayout(tiles, w, h, i + 1));
        let bestUse = firstAttempts[0].viewportUse;
        let bestIndex = 0;
        for (let i = 1; i < firstAttempts.length; i++) {
            if (firstAttempts[i].viewportUse > bestUse) {
                bestUse = firstAttempts[i].viewportUse;
                bestIndex = i;
            }
        }
        if (tiles.length <= 5) {
            // already have one layout as optimal
            return firstAttempts[bestIndex];
        }
        // binary search for the "rows" with the best viewportUse
        let left = 6;
        let right = tiles.length;
        let bestBinarySearchLayout = this.calculateMultiRowLayout(tiles, w, h, 6); // Start with the 6th layout
        while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            const midLayout = this.calculateMultiRowLayout(tiles, w, h, mid);
            // Check if we found a better layout
            if (midLayout.viewportUse > bestBinarySearchLayout.viewportUse) {
                bestBinarySearchLayout = midLayout;
            }
            // Check layouts to the left and right to determine search direction
            const leftLayout = this.calculateMultiRowLayout(tiles, w, h, mid - 1);
            const rightLayout = this.calculateMultiRowLayout(tiles, w, h, mid + 1);
            if (leftLayout.viewportUse > midLayout.viewportUse) {
                // If left is better, search left
                right = mid - 1;
            }
            else if (rightLayout.viewportUse > midLayout.viewportUse) {
                // If right is better, search right
                left = mid + 1;
            }
            else {
                // We found a local maximum
                break;
            }
        }
        // Return the layout with the highest viewportUse (either from first 5 or from binary search)
        return bestBinarySearchLayout.viewportUse > bestUse ? bestBinarySearchLayout : firstAttempts[bestIndex];
    }
}
