/**
 * HUD.js
 *
 * Bottom-right HUD: clock + toggles for ambient occlusion / grid / borders.
 */

import { playUiClick } from './Audio.js';

export class HUD {
    constructor(game) {
        this.game = game;
        this.timeEl    = document.getElementById('hud-time');
        this.aoToggle  = document.getElementById('toggle-ao');
        this.gridToggle= document.getElementById('toggle-grid');
        this.bordersToggle = document.getElementById('toggle-borders');

        this.aoToggle.addEventListener('change', () => {
            playUiClick();
            game.renderer.ambientOcclusion = this.aoToggle.checked;
            game.renderer.markDirty();
        });
        this.gridToggle.addEventListener('change', () => {
            playUiClick();
            game.renderer.showGrid = this.gridToggle.checked;
            game.renderer.markDirty();
            game.toolbar?.update();
        });
        this.bordersToggle.addEventListener('change', () => {
            playUiClick();
            game.renderer.showBorders = this.bordersToggle.checked;
            game.renderer.markDirty();
        });

        this._tick();
        setInterval(() => this._tick(), 30000);
    }

    _tick() {
        // Animated golden-hour clock for atmosphere.
        const d = new Date();
        const hh = d.getHours().toString().padStart(2, '0');
        const mm = d.getMinutes().toString().padStart(2, '0');
        if (this.timeEl) this.timeEl.textContent = `${hh}:${mm}`;
    }

    syncToggles() {
        this.gridToggle.checked = this.game.renderer.showGrid;
        this.aoToggle.checked   = this.game.renderer.ambientOcclusion;
        this.bordersToggle.checked = this.game.renderer.showBorders;
    }
}
