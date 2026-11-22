/**
 * AssetPalette.js
 *
 * Bottom palette: category tabs + horizontal swatch row. Each swatch
 * displays the asset's generated bitmap so the player sees exactly what
 * they'll be placing.
 */

import { ASSET_MANIFEST, CATEGORIES } from '../assets/assetManifest.js';
import { allAssets } from '../assets/assetLoader.js';
import { playUiClick } from './Audio.js';

export class AssetPalette {
    constructor(tabsEl, gridEl, game) {
        this.tabsEl = tabsEl;
        this.gridEl = gridEl;
        this.game = game;
        this.tabButtons = new Map();
        this._buildTabs();
        this._renderGrid();
    }

    _buildTabs() {
        this.tabsEl.innerHTML = '';
        for (const c of CATEGORIES) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'tab';
            btn.textContent = c[0].toUpperCase() + c.slice(1);
            btn.addEventListener('click', () => {
                playUiClick();
                this.game.setCategory(c);
            });
            this.tabsEl.appendChild(btn);
            this.tabButtons.set(c, btn);
        }
        this.update();
    }

    _renderGrid() {
        this.gridEl.innerHTML = '';
        const generated = allAssets();
        const items = ASSET_MANIFEST.filter(a => a.category === this.game.category);
        for (const def of items) {
            const swatch = document.createElement('button');
            swatch.type = 'button';
            swatch.className = 'swatch';
            swatch.dataset.assetId = def.id;

            const gen = generated[def.id];
            if (gen) {
                const img = document.createElement('canvas');
                const max = 56;
                const scale = Math.min(max / gen.width, max / gen.height, 2);
                img.width  = Math.ceil(gen.width  * scale);
                img.height = Math.ceil(gen.height * scale);
                const ctx = img.getContext('2d');
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(gen.canvas, 0, 0, img.width, img.height);
                swatch.appendChild(img);
            }

            const name = document.createElement('span');
            name.className = 'name';
            name.textContent = def.name;
            swatch.appendChild(name);

            swatch.addEventListener('click', () => {
                playUiClick();
                this.game.selectAsset(def.id);
            });
            this.gridEl.appendChild(swatch);
        }
        this.update();
    }

    update() {
        for (const [c, btn] of this.tabButtons) {
            btn.classList.toggle('active', c === this.game.category);
        }
        // Re-render grid only when category changed.
        const visibleIds = Array.from(this.gridEl.querySelectorAll('.swatch'))
            .map(el => el.dataset.assetId);
        const expectedIds = ASSET_MANIFEST
            .filter(a => a.category === this.game.category)
            .map(a => a.id);
        const sameSet = visibleIds.length === expectedIds.length
            && visibleIds.every((id, i) => id === expectedIds[i]);
        if (!sameSet) this._renderGrid();

        for (const sw of this.gridEl.querySelectorAll('.swatch')) {
            sw.classList.toggle('selected', sw.dataset.assetId === this.game.selectedAssetId);
        }
    }
}
