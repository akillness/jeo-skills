/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { DEFAULT_SPREADSHEET_COLUMN_COUNT, DEFAULT_SPREADSHEET_COLUMN_WIDTH_PX, DEFAULT_SPREADSHEET_HEADER_HEIGHT_PX, DEFAULT_SPREADSHEET_HEADER_WIDTH_PX, DEFAULT_SPREADSHEET_ROW_COUNT, DEFAULT_SPREADSHEET_ROW_HEIGHT_PX, MAX_GRID_COLUMNS, MAX_GRID_ROWS } from "@mrnote/core/web/lib/spreadsheet/grid-sizing.ts";

// One address authority for UI navigation, mutations and persisted schemas.
// The workbook remains sparse: these bounds never allocate their full area.
export const MAX_SHEET_COLS = MAX_GRID_COLUMNS;
export const MAX_SHEET_ROWS = MAX_GRID_ROWS;

export const DEFAULT_SHEET_ROWS = DEFAULT_SPREADSHEET_ROW_COUNT;
export const DEFAULT_SHEET_COLUMNS = DEFAULT_SPREADSHEET_COLUMN_COUNT;

export const SPREADSHEET_CELL_WIDTH_PX = DEFAULT_SPREADSHEET_COLUMN_WIDTH_PX;
export const SPREADSHEET_CELL_HEIGHT_PX = DEFAULT_SPREADSHEET_ROW_HEIGHT_PX;
export const SPREADSHEET_HEADER_WIDTH_PX = DEFAULT_SPREADSHEET_HEADER_WIDTH_PX;
export const SPREADSHEET_HEADER_HEIGHT_PX = DEFAULT_SPREADSHEET_HEADER_HEIGHT_PX;
// The outline gutter's show/hide detail symbol (Microsoft Support, "Outline
// (group) data in a worksheet"). Excel draws a box of about 13px but answers a
// click across the gutter; the drawn glyph stays 11px and only the hit area
// grows, so the gutter never gets wider.
export const SPREADSHEET_OUTLINE_TOGGLE_HIT_PX = 16;
// The column outline bar above the letters (the thead gutter row's height).
export const SPREADSHEET_COLUMN_OUTLINE_BAND_PX = 16;
// The row/column headings are the workbook's coordinate axes, not ordinary
// cells. Keep every grid-content layer below them (floating charts/drawings use
// <= 20 and the sticky structured-table header uses 25), while leaving real UI
// overlays such as validation pickers and split handles (>= 30) above them.
// The corner owns both axes, so it sits one tier above either heading band; an
// open heading menu gets the last axis-local tier.
// The grid's stacking scale, bottom to top. Everything drawn INSIDE a cell —
// its display text (1), the active outline (1), conditional-format icons (1),
// the validation caret (2), the fill handle (5), the comment indicator (8) —
// stays at or below 8 and escapes the cell (a cell is not a stacking
// context), so every tier here is above all of it: a frozen band's cells
// cover the body cells sliding under them handle and indicator included,
// and a chart covers the cells it stands on, with panes frozen as without
// (where the drawing layer is 20). The CSS rules for the active frozen /
// corner cell (`!important`, styles/native-page-window.css) pin the same
// numbers; tests/unit/spreadsheet-grid-layers-css.test.ts keeps them equal.
/** The touch selection grips: over everything a body cell draws, under its
 * drawings, the frozen bands and the headings, which they pass under as the
 * cells do while the grid scrolls. */
export const SPREADSHEET_GRID_TOUCH_GRIP_LAYER = 9;
/** The body's drawings and charts while panes are frozen (a per-pane box). */
export const SPREADSHEET_GRID_BODY_DRAWINGS_LAYER = 10;
/** A frozen row's or column's cells, pinned over the scrolling body. */
export const SPREADSHEET_GRID_FROZEN_CELL_LAYER = 12;
/** The active (or selection-edged) frozen cell, over its band. */
export const SPREADSHEET_GRID_FROZEN_CELL_ACTIVE_LAYER = 13;
/** A frozen band's drawings: over its cells, under the corner's. */
export const SPREADSHEET_GRID_FROZEN_BAND_DRAWINGS_LAYER = 14;
/** The corner's cells (frozen in both axes), over both bands. */
export const SPREADSHEET_GRID_CORNER_CELL_LAYER = 16;
export const SPREADSHEET_GRID_CORNER_CELL_ACTIVE_LAYER = 17;
/** The corner's drawings, over everything frozen. */
export const SPREADSHEET_GRID_CORNER_DRAWINGS_LAYER = 18;
/** Page Break Preview's lines and shading: over the cells and the frozen panes, under the headings. */
export const SPREADSHEET_GRID_PAGE_BREAK_LAYER = 19;
/** The stand-in heading band and gutter shown while the table is carried
 * away by a fling: over every cell part, frozen band and drawing (as the
 * real headings are), under the real headings. Painted under the cells it
 * made WebKit composite each cell (a sticky box is a compositing layer, and
 * whatever is painted after one and over it is promoted too): hundreds of
 * layers, a heavy scroll, and rows that came into view as bare gridlines
 * until their layers were painted. */
export const SPREADSHEET_GRID_UNRENDERED_AXIS_LAYER = 25;
export const SPREADSHEET_GRID_AXIS_LAYER = 26;
// A frozen row's number and a frozen column's letter stay put while the
// scrolling axis cells slide under them; at the same layer a later sibling
// would win the tie and the scrolled row's number covered the pinned one.
export const SPREADSHEET_GRID_AXIS_PINNED_LAYER = 27;
export const SPREADSHEET_GRID_AXIS_CORNER_LAYER = 28;
// Covers a 1440px desktop viewport plus generous scroll overscan without
// mounting three thousand editable inputs on every cell/history render.
export const SPREADSHEET_RENDER_ROW_BUDGET = 64;
export const SPREADSHEET_RENDER_COL_BUDGET = 24;
export const SPREADSHEET_RENDER_ROW_OVERSCAN = 10;
/** Rows a scrolling band brings in per frame (lib/spreadsheet/grid-scroll
 * revealGridWindowRows): about 180 cells, well inside a frame; a wheel tick
 * needs at most six new rows. */
export const SPREADSHEET_GRID_ROWS_PER_FRAME = 8;
export const SPREADSHEET_RENDER_COL_OVERSCAN = 4;
export const SPREADSHEET_NO_SCROLL_REACH = { left: 0, top: 0 };
export const CHART_FORMAT_VIEWPORT_GUTTER_PX = 12;
// The workbook stays sparse while the viewport grows in bounded chunks. Each
// chunk is smaller than the render budget, so reaching an edge reserves several
// screens without mounting any more cells than the existing virtualizer allows.
export const SPREADSHEET_VIEWPORT_ROW_GROWTH = 64;
export const SPREADSHEET_VIEWPORT_COL_GROWTH = 16;
export const SPREADSHEET_VIEWPORT_EDGE_RATIO = 0.25;

// How far the SmartArt diagram frame sits outside its members, so the frame's
// handles never land on the selected member's own (Presentation's number).
export const SPREADSHEET_SMARTART_FRAME_PAD_PX = 10;
/** The smallest a diagram member may be scaled to from the diagram frame. */
export const SPREADSHEET_SMARTART_MEMBER_MIN_PX = 16;
