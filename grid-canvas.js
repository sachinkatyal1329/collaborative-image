class WordGrid {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');

        // Grid configuration
        this.gridCols = 100;
        this.gridRows = 100;
        this.cellWidth = 64;
        this.cellHeight = 28;
        this.cellPadding = 2; // gap between cells
        this.cellRadius = 6;  // rounded corners

        // Camera state
        this.camera = { x: 0, y: 0, zoom: 1 };

        // Interaction state
        this.isDragging = false;
        this.dragStart = { x: 0, y: 0 };
        this.mouseDownPos = { x: 0, y: 0 };
        this.hasDragged = false;

        // Word data: position (int) -> { word, user_id, user_color, row, col }
        this.words = new Map();

        // Current cursor position (next cell to type into)
        this.cursorPosition = 0;
        this.currentWord = ''; // word being typed

        // Remote cursors
        this.remoteCursors = new Map();

        // Camera animation
        this.cameraAnim = null;
        this.animationFrame = 0;

        // Callbacks
        this.onCellClick = null;

        this.init();
    }

    init() {
        this.resizeCanvas();
        this.setupEventListeners();
        this.centerOnPosition(0);
        this.startAnimationLoop();
    }

    startAnimationLoop() {
        const animate = () => {
            this.animationFrame++;
            this.tickCameraAnimation();
            if (this.animationFrame % 2 === 0) {
                this.render();
            }
            requestAnimationFrame(animate);
        };
        animate();
    }

    resizeCanvas() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        this.render();
    }

    getMinZoom() {
        const gridW = this.gridCols * this.cellWidth;
        const gridH = this.gridRows * this.cellHeight;
        const fitW = this.canvas.width / gridW;
        const fitH = this.canvas.height / gridH;
        return Math.min(fitW, fitH) * 0.9;
    }

    centerOnPosition(position) {
        const row = Math.floor(position / this.gridCols);
        const col = position % this.gridCols;
        const worldX = col * this.cellWidth + this.cellWidth / 2;
        const worldY = row * this.cellHeight + this.cellHeight / 2;
        this.camera.x = this.canvas.width / 2 - worldX * this.camera.zoom;
        this.camera.y = this.canvas.height / 2 - worldY * this.camera.zoom;
    }

    animateTo(position, zoom, duration = 400) {
        const row = Math.floor(position / this.gridCols);
        const col = position % this.gridCols;
        const worldX = col * this.cellWidth + this.cellWidth / 2;
        const worldY = row * this.cellHeight + this.cellHeight / 2;
        const targetZoom = zoom || this.camera.zoom;
        const targetX = this.canvas.width / 2 - worldX * targetZoom;
        const targetY = this.canvas.height / 2 - worldY * targetZoom;

        this.cameraAnim = {
            from: { x: this.camera.x, y: this.camera.y, zoom: this.camera.zoom },
            to: { x: targetX, y: targetY, zoom: targetZoom },
            start: performance.now(),
            duration
        };
    }

    easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
    }

    tickCameraAnimation() {
        if (!this.cameraAnim) return;

        const elapsed = performance.now() - this.cameraAnim.start;
        const t = Math.min(1, elapsed / this.cameraAnim.duration);
        const eased = this.easeOutCubic(t);

        const { from, to } = this.cameraAnim;
        this.camera.x = from.x + (to.x - from.x) * eased;
        this.camera.y = from.y + (to.y - from.y) * eased;
        this.camera.zoom = from.zoom + (to.zoom - from.zoom) * eased;

        this.render();

        if (t >= 1) {
            this.cameraAnim = null;
        }
    }

    screenToWorld(screenX, screenY) {
        return {
            x: (screenX - this.camera.x) / this.camera.zoom,
            y: (screenY - this.camera.y) / this.camera.zoom
        };
    }

    getCellAtScreen(screenX, screenY) {
        const world = this.screenToWorld(screenX, screenY);
        const col = Math.floor(world.x / this.cellWidth);
        const row = Math.floor(world.y / this.cellHeight);
        if (col >= 0 && col < this.gridCols && row >= 0 && row < this.gridRows) {
            return { row, col, position: row * this.gridCols + col };
        }
        return null;
    }

    setupEventListeners() {
        this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
        this.canvas.addEventListener('wheel', this.onWheel.bind(this), { passive: false });

        window.addEventListener('resize', () => {
            this.resizeCanvas();
        });
    }

    onMouseDown(e) {
        this.cameraAnim = null;
        this.hasDragged = false;
        this.mouseDownPos = { x: e.clientX, y: e.clientY };
        this.isDragging = true;
        this.dragStart = {
            x: e.clientX - this.camera.x,
            y: e.clientY - this.camera.y
        };
    }

    onMouseMove(e) {
        const dx = e.clientX - this.mouseDownPos.x;
        const dy = e.clientY - this.mouseDownPos.y;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
            this.hasDragged = true;
        }

        if (this.isDragging) {
            this.camera.x = e.clientX - this.dragStart.x;
            this.camera.y = e.clientY - this.dragStart.y;
            this.render();
        }
    }

    onMouseUp(e) {
        this.isDragging = false;

        if (!this.hasDragged && this.onCellClick) {
            const rect = this.canvas.getBoundingClientRect();
            const cell = this.getCellAtScreen(e.clientX - rect.left, e.clientY - rect.top);
            if (cell) {
                this.onCellClick(cell);
            }
        }
    }

    onWheel(e) {
        e.preventDefault();
        this.cameraAnim = null;

        const zoomIntensity = 0.1;
        const wheel = e.deltaY < 0 ? 1 : -1;
        const zoom = Math.exp(wheel * zoomIntensity);

        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const worldX = (mouseX - this.camera.x) / this.camera.zoom;
        const worldY = (mouseY - this.camera.y) / this.camera.zoom;

        this.camera.zoom *= zoom;
        const minZoom = this.getMinZoom();
        this.camera.zoom = Math.max(minZoom, Math.min(20, this.camera.zoom));

        this.camera.x = mouseX - worldX * this.camera.zoom;
        this.camera.y = mouseY - worldY * this.camera.zoom;

        this.render();
    }

    setWord(position, wordData) {
        this.words.set(position, {
            ...wordData,
            row: Math.floor(position / this.gridCols),
            col: position % this.gridCols
        });
        this._groupCache = null; // invalidate
    }

    // Build groups: consecutive cells on the same row with the same group_id
    // become a single visual block
    _buildGroups() {
        if (this._groupCache) return this._groupCache;

        const groups = []; // { group_id, color, cells: [{pos, row, col, word}], startCol, endCol, row }
        const assigned = new Set();

        // Sort positions
        const sorted = Array.from(this.words.entries()).sort((a, b) => a[0] - b[0]);

        for (const [pos, data] of sorted) {
            if (assigned.has(pos)) continue;

            const row = data.row;
            const col = data.col;
            const gid = data.group_id;

            // Collect consecutive cells in same row with same group_id
            const cells = [{ pos, row, col, word: data.word }];
            assigned.add(pos);

            if (gid) {
                // Look ahead for consecutive cells in the same row & group
                let nextPos = pos + 1;
                while (this.words.has(nextPos)) {
                    const next = this.words.get(nextPos);
                    if (next.group_id !== gid || next.row !== row) break;
                    cells.push({ pos: nextPos, row: next.row, col: next.col, word: next.word });
                    assigned.add(nextPos);
                    nextPos++;
                }
            }

            groups.push({
                group_id: gid,
                color: data.user_color,
                cells,
                row,
                startCol: cells[0].col,
                endCol: cells[cells.length - 1].col
            });
        }

        this._groupCache = groups;
        return groups;
    }

    setCursorPosition(position) {
        this.cursorPosition = position;
    }

    setCurrentWord(word) {
        this.currentWord = word;
    }

    setRemoteCursor(id, position, color) {
        this.remoteCursors.set(id, { position, color });
    }

    removeRemoteCursor(id) {
        this.remoteCursors.delete(id);
    }

    // Helper: draw a rounded rect path
    roundRect(ctx, x, y, w, h, r) {
        r = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    // Softer user colors (pastel palette for light theme)
    softenColor(hex, opacity) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }

    // Generate a stable pastel color from a group_id string
    _groupColorCache = new Map();
    groupColor(groupId) {
        if (!groupId) return { h: 230, s: 30, l: 75 };
        if (this._groupColorCache.has(groupId)) return this._groupColorCache.get(groupId);

        // Simple hash to get a deterministic number from the string
        let hash = 0;
        for (let i = 0; i < groupId.length; i++) {
            hash = ((hash << 5) - hash + groupId.charCodeAt(i)) | 0;
        }

        const hue = ((hash & 0xFFFF) % 360 + 360) % 360;
        const sat = 25 + ((hash >>> 16) & 0xFF) % 20;   // 25-45%
        const lit = 72 + ((hash >>> 8) & 0xFF) % 12;     // 72-84%

        const color = { h: hue, s: sat, l: lit };
        this._groupColorCache.set(groupId, color);
        return color;
    }

    groupColorStr(groupId, opacity) {
        const c = this.groupColor(groupId);
        return `hsla(${c.h}, ${c.s}%, ${c.l}%, ${opacity})`;
    }

    render() {
        const ctx = this.ctx;
        const zoom = this.camera.zoom;
        const pad = this.cellPadding;

        // Clear with light background
        ctx.fillStyle = '#f8f8f8';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        ctx.save();
        ctx.translate(this.camera.x, this.camera.y);
        ctx.scale(zoom, zoom);

        // Visible bounds
        const startCol = Math.max(0, Math.floor(-this.camera.x / zoom / this.cellWidth) - 1);
        const endCol = Math.min(this.gridCols, Math.ceil((this.canvas.width - this.camera.x) / zoom / this.cellWidth) + 1);
        const startRow = Math.max(0, Math.floor(-this.camera.y / zoom / this.cellHeight) - 1);
        const endRow = Math.min(this.gridRows, Math.ceil((this.canvas.height - this.camera.y) / zoom / this.cellHeight) + 1);

        const cellScreenW = this.cellWidth * zoom;
        const cellScreenH = this.cellHeight * zoom;

        // Determine detail level
        const showText = cellScreenW > 35;
        const showDots = cellScreenW > 8 && cellScreenW <= 35;

        // Draw subtle dot grid at intersections (only when zoomed in enough)
        if (cellScreenW > 8 && cellScreenW < 200) {
            const dotSize = Math.max(0.8, 1.8 / zoom);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';

            const step = cellScreenW < 12 ? 5 : (cellScreenW < 25 ? 2 : 1);

            for (let row = startRow; row <= endRow; row += step) {
                for (let col = startCol; col <= endCol; col += step) {
                    ctx.beginPath();
                    ctx.arc(col * this.cellWidth, row * this.cellHeight, dotSize, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }

        // Build visual groups (consecutive same-group words on same row)
        const groups = this._buildGroups();

        // Draw filled word cells — always visible at every zoom
        if (showText) {
            // Close zoom: connected rounded pills per group, with text
            const fontSize = Math.min(11, this.cellHeight * 0.42);
            ctx.font = `500 ${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            for (const group of groups) {
                if (group.row < startRow || group.row >= endRow) continue;
                if (group.endCol < startCol || group.startCol >= endCol) continue;

                // Draw one connected rounded rect for the whole group
                const gx = group.startCol * this.cellWidth + pad;
                const gy = group.row * this.cellHeight + pad;
                const gw = (group.endCol - group.startCol + 1) * this.cellWidth - pad * 2;
                const gh = this.cellHeight - pad * 2;
                const gr = Math.min(this.cellRadius, gw / 2, gh / 2);

                this.roundRect(ctx, gx, gy, gw, gh, gr);
                ctx.fillStyle = this.groupColorStr(group.group_id, 0.35);
                ctx.fill();

                this.roundRect(ctx, gx, gy, gw, gh, gr);
                ctx.strokeStyle = this.groupColorStr(group.group_id, 0.18);
                ctx.lineWidth = 1 / zoom;
                ctx.stroke();

                // Draw each word inside
                for (const cell of group.cells) {
                    if (cell.col < startCol || cell.col >= endCol) continue;
                    const cx = cell.col * this.cellWidth + this.cellWidth / 2;
                    const cy = group.row * this.cellHeight + this.cellHeight / 2;

                    ctx.fillStyle = '#444';
                    const maxLen = Math.floor(this.cellWidth / (fontSize * 0.58));
                    const displayText = cell.word.length > maxLen
                        ? cell.word.substring(0, maxLen - 1) + '\u2026'
                        : cell.word;
                    ctx.fillText(displayText, cx, cy + 0.5);
                }
            }
        } else if (showDots) {
            // Medium zoom: one elongated pill per group
            for (const group of groups) {
                if (group.row < startRow || group.row >= endRow) continue;
                if (group.endCol < startCol || group.startCol >= endCol) continue;

                const gx = group.startCol * this.cellWidth + pad + 2;
                const gy = group.row * this.cellHeight + pad + 2;
                const gw = (group.endCol - group.startCol + 1) * this.cellWidth - pad * 2 - 4;
                const gh = this.cellHeight - pad * 2 - 4;
                const gr = Math.min(gh / 2, gw / 2, 4);

                this.roundRect(ctx, gx, gy, gw, gh, gr);
                ctx.fillStyle = this.groupColorStr(group.group_id, 0.45);
                ctx.fill();
            }
        } else {
            // Far zoom: solid blocks per group, stay visible at any distance
            const opacity = Math.min(0.9, 0.4 + (1 - Math.min(cellScreenW / 8, 1)) * 0.5);
            for (const group of groups) {
                if (group.row < startRow || group.row >= endRow) continue;
                if (group.endCol < startCol || group.startCol >= endCol) continue;

                ctx.fillStyle = this.groupColorStr(group.group_id, opacity);
                ctx.fillRect(
                    group.startCol * this.cellWidth,
                    group.row * this.cellHeight,
                    (group.endCol - group.startCol + 1) * this.cellWidth,
                    this.cellHeight
                );
            }
        }

        // Draw cursor (current typing position)
        const cursorRow = Math.floor(this.cursorPosition / this.gridCols);
        const cursorCol = this.cursorPosition % this.gridCols;
        const pulse = (Math.sin(this.animationFrame * 0.06) + 1) / 2;

        const cursorCenterX = cursorCol * this.cellWidth + this.cellWidth / 2;
        const cursorCenterY = cursorRow * this.cellHeight + this.cellHeight / 2;

        const cx = cursorCol * this.cellWidth + pad;
        const cy = cursorRow * this.cellHeight + pad;
        const cw = this.cellWidth - pad * 2;
        const ch = this.cellHeight - pad * 2;
        const cr = Math.min(this.cellRadius, cw / 2, ch / 2);

        // Glow
        ctx.shadowColor = `rgba(99, 102, 241, ${0.2 + pulse * 0.15})`;
        ctx.shadowBlur = 12 / zoom;

        this.roundRect(ctx, cx, cy, cw, ch, cr);
        ctx.fillStyle = `rgba(99, 102, 241, ${0.06 + pulse * 0.04})`;
        ctx.fill();

        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;

        // Border
        this.roundRect(ctx, cx, cy, cw, ch, cr);
        ctx.strokeStyle = `rgba(99, 102, 241, ${0.4 + pulse * 0.4})`;
        ctx.lineWidth = 2 / zoom;
        ctx.stroke();

        // Render current word being typed inside the cursor cell
        if (this.currentWord && cellScreenW > 20) {
            const fontSize = Math.min(11, this.cellHeight * 0.42);
            ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#6366F1';

            const maxLen = Math.floor(this.cellWidth / (fontSize * 0.58));
            const displayText = this.currentWord.length > maxLen
                ? this.currentWord.substring(0, maxLen - 1) + '\u2026'
                : this.currentWord;
            ctx.fillText(displayText, cursorCenterX, cursorCenterY + 0.5);

            // Blinking text cursor after the word
            if (pulse > 0.5) {
                const textW = ctx.measureText(displayText).width;
                ctx.fillStyle = '#6366F1';
                ctx.fillRect(cursorCenterX + textW / 2 + 2 / zoom, cursorCenterY - fontSize * 0.4, 1.5 / zoom, fontSize * 0.8);
            }
        }

        // Draw remote cursors
        this.remoteCursors.forEach((cursor) => {
            const row = Math.floor(cursor.position / this.gridCols);
            const col = cursor.position % this.gridCols;
            if (row < startRow || row >= endRow || col < startCol || col >= endCol) return;

            const x = col * this.cellWidth + pad;
            const y = row * this.cellHeight + pad;
            const w = this.cellWidth - pad * 2;
            const h = this.cellHeight - pad * 2;
            const r = Math.min(this.cellRadius, w / 2, h / 2);

            this.roundRect(ctx, x, y, w, h, r);
            ctx.strokeStyle = this.softenColor(cursor.color, 0.5);
            ctx.lineWidth = 1.5 / zoom;
            ctx.stroke();
        });

        ctx.restore();

        this.updateInfoPanel();
    }

    updateInfoPanel() {
        const zoomEl = document.getElementById('zoom-level');
        if (zoomEl) zoomEl.textContent = Math.round(this.camera.zoom * 100) + '%';
    }

    ensureCursorVisible() {
        // Always smoothly scroll to keep cursor in view
        this.animateTo(this.cursorPosition, null, 200);
    }
}
