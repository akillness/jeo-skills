/**
 * Toolbar.js
 *
 * Renders the left-side tool dock. The icons are tiny canvases drawn
 * inline (no external icon fonts), matching the rest of the asset style.
 */

import { playUiClick } from './Audio.js';

const TOOL_ICONS = {
    place: drawPlaceIcon,
    fill:  drawFillIcon,
    erase: drawEraseIcon,
    pan:   drawPanIcon,
    grid:  drawGridIcon,
    save:  drawSaveIcon,
    reset: drawResetIcon,
};

const TOOL_BUTTONS = [
    { id: 'place',  label: 'Place'  },
    { id: 'fill',   label: 'Fill'   },
    { id: 'erase',  label: 'Erase'  },
    { id: 'pan',    label: 'Pan'    },
    { id: 'grid',   label: 'Grid'   },
    { id: 'save',   label: 'Save'   },
    { id: 'reset',  label: 'Reset'  },
];

export class Toolbar {
    constructor(rootEl, game) {
        this.root = rootEl;
        this.game = game;
        this.buttons = new Map();
        this._build();
    }

    _build() {
        this.root.innerHTML = '';
        // Each icon drawer uses a 44×44 logical coordinate space
        // (centered at 22, 22). We allocate the backing canvas at
        // `44 × dpr_factor` so the icon stays crisp on every display
        // density — including 3× retina iPhones where a flat 44 backing
        // would have been visibly upsampled.
        const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
        const dprFactor = Math.max(1, Math.min(3, Math.ceil(dpr)));
        const backing = 44 * dprFactor;
        for (const def of TOOL_BUTTONS) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'tool';
            btn.dataset.toolId = def.id;
            const cv = document.createElement('canvas');
            cv.className = 'ti';
            cv.width = backing;
            cv.height = backing;
            const ctx = cv.getContext('2d');
            // Pre-scale so drawer logic stays in the 44×44 logical
            // coordinate space regardless of backing density.
            if (dprFactor !== 1) ctx.scale(dprFactor, dprFactor);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            const drawer = TOOL_ICONS[def.id];
            if (drawer) drawer(ctx);
            const label = document.createElement('span');
            label.className = 'label';
            label.textContent = def.label;
            btn.appendChild(cv);
            btn.appendChild(label);
            btn.addEventListener('click', () => this._onClick(def.id));
            this.root.appendChild(btn);
            this.buttons.set(def.id, btn);
        }
        this.update();
    }

    _onClick(id) {
        playUiClick();
        switch (id) {
            case 'place': this.game.setTool('place'); break;
            case 'erase': this.game.setTool('erase'); break;
            case 'pan':   this.game.setTool('pan');   break;
            case 'grid':  this.game.toggleGrid();     break;
            case 'save':  this.game.save();           break;
            case 'reset': this.game.reset();          break;
            case 'fill':  this.game.fillGrass();      break;
        }
    }

    update() {
        const tool = this.game.tool;
        const grid = this.game.renderer.showGrid;
        for (const [id, btn] of this.buttons) {
            btn.classList.toggle('active',
                (id === 'place' && tool === 'place')
             || (id === 'erase' && tool === 'erase')
             || (id === 'pan'   && tool === 'pan')
             || (id === 'grid'  && grid)
            );
        }
    }
}

/* ── Tool icons ───────────────────────────────────────────────────
 *
 * Each icon is drawn on its own 44×44 canvas, centered at (22, 22).
 * The shapes use universally-recognised metaphors so the user can
 * understand what each tool does without reading the label:
 *
 *   place → map pin (Google-Maps-style "drop here")
 *   fill  → paint bucket with green paint inside
 *   erase → classic pencil eraser block (rubber + metal collar)
 *   pan   → four-direction move arrows (Figma / Photoshop move tool)
 *   grid  → 3×3 mesh
 *   save  → floppy disk with sliding shutter + label area
 *   reset → circular arrow (refresh / undo)
 *
 * All icons share the cobalt ink colour so the rail reads as one set.
 */

const INK       = '#1b5ba8';
const INK_DARK  = '#134680';
const PAPER     = '#fafaf5';
const GRASS     = '#7eaa5f';
const GRASS_DK  = '#5c8a44';
const ERASER_PINK = '#e89a9a';

function drawPlaceIcon(ctx) {
    // Map-pin marker — the universally-recognised "drop something here"
    // glyph. Teardrop body with a hollow circle in the bell.
    ctx.save();
    ctx.translate(22, 22);

    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.moveTo(0, 14);                              // tip pointing down
    ctx.bezierCurveTo(-10, 4, -10, -10, 0, -10);
    ctx.bezierCurveTo(10, -10, 10, 4, 0, 14);
    ctx.closePath();
    ctx.fill();

    // Inner hollow circle so the pin reads as a pin and not a balloon.
    ctx.fillStyle = PAPER;
    ctx.beginPath();
    ctx.arc(0, -3, 3.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

function drawFillIcon(ctx) {
    // Paint bucket holding green paint — combines the universal "fill"
    // metaphor with a colour that signals what gets filled (grass).
    ctx.save();
    ctx.translate(22, 22);

    // Bucket body (slightly wider at the top, like a real paint pail).
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.moveTo(-9, -3);
    ctx.lineTo(9, -3);
    ctx.lineTo(7, 11);
    ctx.lineTo(-7, 11);
    ctx.closePath();
    ctx.fill();

    // Paint inside (green ellipse "viewed from above" through the rim).
    ctx.fillStyle = GRASS;
    ctx.beginPath();
    ctx.ellipse(0, -3, 9, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = GRASS_DK;
    ctx.beginPath();
    ctx.ellipse(0, -3, 7, 1.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Wire handle arching above the bucket.
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, -3, 11, Math.PI * 1.2, Math.PI * 1.8, false);
    ctx.stroke();

    ctx.restore();
}

function drawEraseIcon(ctx) {
    // Classic pencil eraser — pink rubber tip + metal collar +
    // cobalt body. Tilted like a real eraser caught mid-stroke, with
    // a small dust speck below to reinforce the "erase" meaning.
    ctx.save();
    ctx.translate(22, 22);
    ctx.rotate(-0.5);

    // Cobalt body (the wood/plastic part of the eraser)
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.moveTo(-2, -7);
    ctx.lineTo(11, -7);
    ctx.lineTo(11, 7);
    ctx.lineTo(-2, 7);
    ctx.closePath();
    ctx.fill();

    // Pink rubber tip (the part that does the erasing — leftmost)
    ctx.fillStyle = ERASER_PINK;
    ctx.beginPath();
    ctx.moveTo(-11, -7);
    ctx.lineTo(-2, -7);
    ctx.lineTo(-2, 7);
    ctx.lineTo(-11, 7);
    ctx.closePath();
    ctx.fill();

    // Metal collar separating the two
    ctx.fillStyle = PAPER;
    ctx.fillRect(-3, -7, 1.5, 14);

    ctx.restore();

    // Eraser shavings below — sells the "erasing motion" meaning.
    ctx.save();
    ctx.translate(22, 22);
    ctx.fillStyle = INK;
    ctx.fillRect(-12, 11, 3, 1.5);
    ctx.fillRect(-7,  13, 2, 1.2);
    ctx.fillRect(-3,  11, 2, 1.2);
    ctx.restore();
}

function drawPanIcon(ctx) {
    // Four-direction move arrows — the universal move/pan glyph used by
    // Figma, Photoshop, Sketch, and basically every design tool.
    ctx.save();
    ctx.translate(22, 22);
    ctx.fillStyle = INK;

    // Central "+" stem
    ctx.fillRect(-2, -7, 4, 14);
    ctx.fillRect(-7, -2, 14, 4);

    // Top arrowhead
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(-5, -7);
    ctx.lineTo(5, -7);
    ctx.closePath();
    ctx.fill();

    // Bottom arrowhead
    ctx.beginPath();
    ctx.moveTo(0, 12);
    ctx.lineTo(-5, 7);
    ctx.lineTo(5, 7);
    ctx.closePath();
    ctx.fill();

    // Left arrowhead
    ctx.beginPath();
    ctx.moveTo(-12, 0);
    ctx.lineTo(-7, -5);
    ctx.lineTo(-7, 5);
    ctx.closePath();
    ctx.fill();

    // Right arrowhead
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(7, -5);
    ctx.lineTo(7, 5);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
}

function drawGridIcon(ctx) {
    // Clean 3×3 grid (4 lines each direction). Reads as "show / hide
    // the cell grid" at a glance.
    ctx.save();
    ctx.translate(22, 22);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'square';
    ctx.beginPath();
    for (let i = -9; i <= 9; i += 6) {
        ctx.moveTo(-9, i);
        ctx.lineTo(9, i);
        ctx.moveTo(i, -9);
        ctx.lineTo(i, 9);
    }
    ctx.stroke();
    ctx.restore();
}

function drawSaveIcon(ctx) {
    // Floppy disk — the file-save icon decades of users instantly grok.
    // Top metal shutter (with the small write-protect notch) and a
    // bottom label area with two text-rules to suggest "writeable".
    ctx.save();
    ctx.translate(22, 22);

    // Disk body with the classic chamfered upper-right corner
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.moveTo(-11, -11);
    ctx.lineTo(8, -11);
    ctx.lineTo(11, -8);
    ctx.lineTo(11, 11);
    ctx.lineTo(-11, 11);
    ctx.closePath();
    ctx.fill();

    // Top metal shutter
    ctx.fillStyle = PAPER;
    ctx.fillRect(-7, -11, 13, 7);
    // Shutter notch (the rectangular slot on the metal slider)
    ctx.fillStyle = INK;
    ctx.fillRect(2, -10, 2.5, 5);

    // Bottom paper label
    ctx.fillStyle = PAPER;
    ctx.fillRect(-7, -1, 14, 9);
    // Two text-rule lines on the label
    ctx.fillStyle = INK;
    ctx.fillRect(-5, 2, 10, 1);
    ctx.fillRect(-5, 5, 10, 1);

    ctx.restore();
}

function drawResetIcon(ctx) {
    // Circular refresh arrow — universal "reset / start over" icon.
    // ~270° arc with the gap (and arrowhead) at the upper-right.
    ctx.save();
    ctx.translate(22, 22);

    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, 9, Math.PI * 0.2, Math.PI * 1.75);
    ctx.stroke();

    // Bold triangular arrowhead capping the upper-right end of the
    // arc, with its tip pointing toward the centre so the loop reads
    // as "circle back to the start".
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.moveTo(2, -6);   // inner tip near the arc end
    ctx.lineTo(10, -3);  // outer-right
    ctx.lineTo(8, -11);  // upper-right
    ctx.closePath();
    ctx.fill();

    ctx.restore();
}
