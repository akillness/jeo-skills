/**
 * UIManager.js
 *
 * Aggregates all DOM-driven UI subsystems and toast feedback.
 */

import { Toolbar } from './Toolbar.js';
import { AssetPalette } from './AssetPalette.js';
import { HUD } from './HUD.js';
import { playUiClick } from './Audio.js';

export class UIManager {
    constructor(game) {
        this.game = game;
        this.toolbar = new Toolbar(document.getElementById('toolbar'), game);
        this.palette = new AssetPalette(
            document.getElementById('palette-tabs'),
            document.getElementById('palette-grid'),
            game,
        );
        this.hud = new HUD(game);
        this.toast = document.getElementById('toast');

        // The Controls cheatsheet is a native <details> disclosure: clicking
        // the summary toggles it. Wire the same UI click sound to that
        // toggle so it feels consistent with the toolbar / palette / HUD.
        const ins = document.getElementById('instructions');
        if (ins) {
            ins.addEventListener('toggle', () => playUiClick());
        }

        // Expose for sibling modules
        game.toolbar = this.toolbar;
        game.palette = this.palette;
        game.hud = this.hud;
    }

    update() {
        this.toolbar.update();
        this.palette.update();
    }

    showToast(text, ms = 1600) {
        this.toast.textContent = text;
        this.toast.classList.add('show');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => {
            this.toast.classList.remove('show');
        }, ms);
    }
}
