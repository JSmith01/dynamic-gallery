export const GAP = 8;
export const FOCUS_CROP_REDUCTION = 0.7;
export const MIN_ASPECT_RATIO_DEFAULT = 3 / 4;
export const NOVIDEO_SPLIT = 4;
export const NO_VIDEO_USE_K = 0.3;
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
        let usedPixels = 0;
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
            usedPixels += outputTile.width * height * (tile.hasVideo ? 1 : NO_VIDEO_USE_K);
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
        const constraint1Penalty = 0;
        const constraint2Cost = Math.pow(rowAspectRatio - sumActualRatio, 2);
        return constraint1Penalty + constraint2Cost;
    }
    distributeTilesToRows(tiles, rows, rowAspectRatio) {
        if (tiles.length === rows) {
            return tiles.map(tile => [tile]);
        }
        const minTileRatios = tiles.map(tile => this.getTileMinRatio(tile));
        const n = tiles.length;
        const memo = new Map();
        const findOptimalDistribution = (tileIndex, remainingRows) => {
            if (remainingRows === 1) {
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
        if (tiles.length < rows) {
            rows = tiles.length;
        }
        const usableHeight = h - GAP * (rows - 1);
        const rowHeight = usableHeight / rows;
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
            return firstAttempts[bestIndex];
        }
        let left = 6;
        let right = tiles.length;
        let bestBinarySearchLayout = this.calculateMultiRowLayout(tiles, w, h, 6);
        while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            const midLayout = this.calculateMultiRowLayout(tiles, w, h, mid);
            if (midLayout.viewportUse > bestBinarySearchLayout.viewportUse) {
                bestBinarySearchLayout = midLayout;
            }
            const leftLayout = this.calculateMultiRowLayout(tiles, w, h, mid - 1);
            const rightLayout = this.calculateMultiRowLayout(tiles, w, h, mid + 1);
            if (leftLayout.viewportUse > midLayout.viewportUse) {
                right = mid - 1;
            }
            else if (rightLayout.viewportUse > midLayout.viewportUse) {
                left = mid + 1;
            }
            else {
                break;
            }
        }
        return bestBinarySearchLayout.viewportUse > bestUse ? bestBinarySearchLayout : firstAttempts[bestIndex];
    }
    halfHeightNoVideo(tiles, w, h) {
        const videoTiles = tiles.filter(tile => tile.hasVideo);
        const noVideoTiles = tiles.filter(tile => !tile.hasVideo);
        if (videoTiles.length === 0 || noVideoTiles.length === 0)
            return this.findOptimalLayout(tiles, w, h);
        if (noVideoTiles.length % NOVIDEO_SPLIT === 1) {
            videoTiles.push(noVideoTiles.shift());
        }
        const pseudoTilesCount = Math.ceil(noVideoTiles.length / NOVIDEO_SPLIT);
        if (pseudoTilesCount > 0) {
            videoTiles.push(...Array.from({ length: pseudoTilesCount }, (_, i) => ({
                id: noVideoTiles[i * NOVIDEO_SPLIT].id,
                aspectRatio: noVideoTiles[i * NOVIDEO_SPLIT].aspectRatio,
                canBeCropped: true,
                isFocused: false,
                hasVideo: false,
            })));
        }
        const optimalLayout = this.findOptimalLayout(videoTiles, w, h);
        if (pseudoTilesCount === 0)
            return optimalLayout;
        const layoutPseudoTiles = optimalLayout.tiles.splice(-pseudoTilesCount);
        const noVideoLayout = [];
        for (let i = 0; i < pseudoTilesCount; i++) {
            const tileLayout = layoutPseudoTiles[i];
            const height = (tileLayout.height - GAP * (NOVIDEO_SPLIT - 1)) / NOVIDEO_SPLIT;
            const tileOffset = i * NOVIDEO_SPLIT;
            for (let j = 0; j < NOVIDEO_SPLIT; j++) {
                if (!noVideoTiles[tileOffset + j])
                    break;
                noVideoLayout.push({
                    ...tileLayout,
                    id: noVideoTiles[tileOffset + j].id,
                    height,
                    y: tileLayout.y + (height + GAP) * j,
                });
            }
        }
        optimalLayout.tiles.push(...noVideoLayout);
        return optimalLayout;
    }
}
