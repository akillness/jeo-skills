"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Palette } from "./icons/houseIcons";
import {
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";

import {
  STANDARD_COLORS,
  normalizeHexColor,
  paletteById,
  themeGrid,
} from "../../lib/office-color-palette";
import { OFFICE_HIGHLIGHT_COLORS } from "../../lib/office-theme-color-grid";
import { OfficeNativeColorInput } from "./OfficeNativeColorInput";
import {
  officePreviewIgnoresPointer,
  useOfficeFormatPreview,
  type OfficeFormatPreviewApi,
} from "./officeFormatPreview";
import styles from "./OfficeColorPalettePanel.module.css";

export interface OfficeColorPalettePanelLabels {
  automatic?: string;
  themeColors: string;
  standardColors: string;
  recentColors?: string;
  moreColors: string;
  noFill?: string;
}

export type OfficeColorPaletteEntry = Readonly<{
  kind:
    | "automatic"
    | "theme"
    | "standard"
    | "recent"
    | "no-fill"
    | "more";
  occurrenceId: string;
  color?: string;
}>;

export interface OfficeColorPalettePanelProps {
  value?: string;
  paletteId?: string;
  /** Editor-owned theme catalog; omitted callers retain the shared default. */
  themeColumns?: readonly (readonly string[])[];
  onPickEntry?: (color: string | null, entry?: OfficeColorPaletteEntry) => void;
  selectedThemeOccurrenceId?: string;
  recents?: readonly string[];
  labels: OfficeColorPalettePanelLabels;
  onPick: (color: string | null) => void;
  onAutomatic?: () => void;
  automaticSelected?: boolean;
  allowNoFill?: boolean;
  noFillSelected?: boolean;
  focusOnMount?: boolean;
  disabled?: boolean;
  testIdPrefix: string;
  controlId?: string;
  controlSurface?: string;
  entryOccurrenceId?: (entry: OfficeColorPaletteEntry) => string;
  entryControlId?: (entry: OfficeColorPaletteEntry) => string | undefined;
  /** Host-owned controls, outside the palette's cell navigation. */
  footer?: ReactNode;
  /**
   * `highlighter`: Text Highlight Color's fifteen fixed swatches (Office's
   * highlighter colours, five a row) with the No Color row under them, and no
   * theme, standard, recent or More Colors -- the menu PowerPoint and Word
   * show. The panel is as wide as that grid, not a theme palette's width.
   */
  swatchSet?: "theme" | "highlighter";
  /**
   * Live Preview: which text property a swatch under the pointer or the
   * keyboard focus shows on the host editor's selection. Omitted for fills,
   * borders and every other palette, which do not preview.
   */
  formatPreview?: "color" | "highlight";
}

const PREVIEW_COLOR_ATTRIBUTE = "data-preview-color";

/**
 * Live Preview over a palette by delegation: every swatch carries its colour
 * in `data-preview-color`; hovering it, or reaching it with the keyboard,
 * previews; leaving the panel or the swatch's focus clears. The focus the
 * panel itself places on open is not a preview.
 */
function usePalettePreviewHandlers(
  kind: "color" | "highlight" | undefined,
  api: OfficeFormatPreviewApi,
) {
  const keyboardRef = useRef(false);
  if (!kind || !api.available) return {};
  const colorOf = (target: EventTarget | null) =>
    target instanceof Element
      ? target.closest(`[${PREVIEW_COLOR_ATTRIBUTE}]`)?.getAttribute(PREVIEW_COLOR_ATTRIBUTE) ?? null
      : null;
  const show = (color: string | null) => {
    if (color) api.preview(kind === "color" ? { color } : { highlight: color });
    else api.clearPreview();
  };
  return {
    onPointerOver: (event: PointerEvent<HTMLElement>) => {
      if (officePreviewIgnoresPointer(event)) return;
      show(colorOf(event.target));
    },
    onPointerLeave: () => api.clearPreview(),
    onKeyDownCapture: (event: KeyboardEvent<HTMLElement>) => {
      // Before the grid moves focus, so the swatch reached previews.
      keyboardRef.current = true;
      handlePaletteKeyDown(event);
    },
    onFocus: (event: FocusEvent<HTMLElement>) => {
      if (keyboardRef.current) show(colorOf(event.target));
    },
    onBlur: () => api.clearPreview(),
  };
}

/**
 * The names Office shows on a swatch's tooltip ("Dark Red"; "Accent 1,
 * Lighter 80%"). An editor window provides them once for every palette it
 * opens; without a provider a swatch is labelled with its hex.
 */
export interface OfficeColorNames {
  /** The ten standard colours' names, in the catalog's order. */
  readonly standard?: readonly string[];
  /** A theme swatch's name, by grid column (slot) and row (0 = the colour). */
  readonly theme?: (column: number, row: number) => string | undefined;
  /** The fifteen highlighter colours' names, in `OFFICE_HIGHLIGHT_COLORS` order. */
  readonly highlight?: readonly string[];
}

const OfficeColorNamesContext = createContext<OfficeColorNames | null>(null);

export const OfficeColorNamesProvider = OfficeColorNamesContext.Provider;

/**
 * The document's own Theme Colors for every palette an editor window opens.
 * PowerPoint's pickers list the CURRENT presentation's theme; a host that
 * knows its document's theme provides the grid once, and each palette under
 * it that names neither `paletteId` nor `themeColumns` shows that grid.
 * Without a provider (Docs, the worksheet) nothing changes.
 */
export interface OfficeColorPaletteTheme {
  readonly columns: readonly (readonly string[])[];
  /**
   * Told which entry a palette under the provider picked -- a theme swatch's
   * grid cell, a standard or recent colour, No Fill or More Colors -- just
   * before that palette's own pick handler runs, so the host can keep the
   * theme reference a swatch stands for beside the colour it writes.
   */
  readonly onEntry?: (
    color: string | null,
    entry: OfficeColorPaletteEntry,
  ) => void;
}

const OfficeColorPaletteThemeContext =
  createContext<OfficeColorPaletteTheme | null>(null);

export const OfficeColorPaletteThemeProvider =
  OfficeColorPaletteThemeContext.Provider;

const PALETTE_CELL_SELECTOR = "[data-office-palette-cell='true']";
const useBrowserLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

type PaletteCell = Readonly<{
  element: HTMLElement;
  row: number;
  column: number;
}>;

function paletteCells(container: HTMLElement): PaletteCell[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(PALETTE_CELL_SELECTOR),
  ).flatMap((element) => {
    const row = Number(element.dataset.paletteRow);
    const column = Number(element.dataset.paletteColumn);
    return Number.isInteger(row) && Number.isInteger(column)
      ? [{ element, row, column }]
      : [];
  });
}

function movePaletteFocus(
  container: HTMLElement,
  current: HTMLElement,
  key:
    | "ArrowDown"
    | "ArrowLeft"
    | "ArrowRight"
    | "ArrowUp"
    | "End"
    | "Home",
): boolean {
  const cells = paletteCells(container);
  const active = cells.find((cell) => cell.element === current);
  if (!active) return false;
  const rowCells = cells
    .filter((cell) => cell.row === active.row)
    .sort((left, right) => left.column - right.column);
  let next: PaletteCell | undefined;

  if (key === "Home") next = rowCells[0];
  if (key === "End") next = rowCells[rowCells.length - 1];
  if (key === "ArrowLeft" || key === "ArrowRight") {
    const direction =
      document.documentElement.dir ||
      container.closest<HTMLElement>("[dir]")?.dir ||
      getComputedStyle(container).direction ||
      "ltr";
    const rtl = direction === "rtl";
    const forward = key === (rtl ? "ArrowLeft" : "ArrowRight");
    const index = Math.max(
      0,
      rowCells.findIndex((cell) => cell.element === current),
    );
    next =
      rowCells[
        (index + (forward ? 1 : -1) + rowCells.length) % rowCells.length
      ];
  }
  if (key === "ArrowUp" || key === "ArrowDown") {
    const rows = [...new Set(cells.map((cell) => cell.row))].sort(
      (left, right) => left - right,
    );
    const rowIndex = rows.indexOf(active.row);
    const nextRow =
      rows[
        Math.max(
          0,
          Math.min(
            rows.length - 1,
            rowIndex + (key === "ArrowDown" ? 1 : -1),
          ),
        )
      ];
    next = cells
      .filter((cell) => cell.row === nextRow)
      .sort(
        (left, right) =>
          Math.abs(left.column - active.column) -
            Math.abs(right.column - active.column) ||
          left.column - right.column,
      )[0];
  }

  if (!next) return false;
  next.element.focus({ preventScroll: true });
  return true;
}

function handlePaletteKeyDown(event: KeyboardEvent<HTMLElement>) {
  if (
    event.key !== "ArrowDown" &&
    event.key !== "ArrowLeft" &&
    event.key !== "ArrowRight" &&
    event.key !== "ArrowUp" &&
    event.key !== "End" &&
    event.key !== "Home"
  ) {
    return;
  }
  if (!(event.target instanceof HTMLElement)) return;
  if (!event.target.matches(PALETTE_CELL_SELECTOR)) return;
  if (movePaletteFocus(event.currentTarget, event.target, event.key)) {
    event.preventDefault();
    event.stopPropagation();
  }
}

export function OfficeColorPalettePanel({
  value,
  paletteId,
  recents = [],
  labels,
  onPick,
  onAutomatic,
  automaticSelected = false,
  allowNoFill = false,
  noFillSelected = false,
  focusOnMount = true,
  disabled = false,
  testIdPrefix,
  controlId,
  controlSurface,
  entryOccurrenceId,
  entryControlId,
  themeColumns,
  onPickEntry,
  selectedThemeOccurrenceId,
  footer,
  swatchSet = "theme",
  formatPreview,
}: OfficeColorPalettePanelProps) {
  const previewApi = useOfficeFormatPreview();
  const previewHandlers = usePalettePreviewHandlers(formatPreview, previewApi);
  const palette = paletteById(paletteId);
  const documentTheme = useContext(OfficeColorPaletteThemeContext);
  const grid =
    themeColumns ??
    (paletteId === undefined ? documentTheme?.columns : undefined) ??
    themeGrid(palette);
  const highlighter = swatchSet === "highlighter";
  const themeRowCount = Math.max(0, ...grid.map((column) => column.length));
  const standardRow = themeRowCount + (onAutomatic ? 1 : 0);
  const recentRow = standardRow + 1;
  const clearRow = recentRow + (recents.length > 0 ? 1 : 0);
  const current = normalizeHexColor(value);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const colorNames = useContext(OfficeColorNamesContext);
  const automaticEntry = {
    kind: "automatic",
    occurrenceId: "automatic",
  } as const;
  const noFillEntry = {
    kind: "no-fill",
    occurrenceId: "no-fill",
  } as const;
  const moreEntry = { kind: "more", occurrenceId: "more" } as const;

  const semanticProps = (entry: OfficeColorPaletteEntry) => ({
    "data-control-id": controlSurface
      ? (entryControlId?.(entry) ?? controlId)
      : undefined,
    "data-control-occurrence-id": controlSurface
      ? (entryOccurrenceId?.(entry) ?? entry.occurrenceId)
      : undefined,
    "data-control-surface": controlSurface,
  });

  const swatch = (
    color: string,
    key: string,
    testId: string,
    kind: "theme" | "standard" | "recent",
    row: number,
    column: number,
    name?: string,
  ) => {
    const entry = { kind, occurrenceId: key, color } as const;
    const pick = () => {
      documentTheme?.onEntry?.(color, entry);
      if (onPickEntry) onPickEntry(color, entry);
      else onPick(color);
    };
    return (
      <button
        key={key}
        type="button"
        role="gridcell"
        aria-label={name || color}
        aria-selected={!automaticSelected && (selectedThemeOccurrenceId ? kind === "theme" && key === selectedThemeOccurrenceId : current === color)}
        title={name || color}
        disabled={disabled}
        className={styles.colorCell}
        data-office-palette-cell="true"
        data-palette-row={row}
        data-palette-column={column}
        data-preview-color={color}
        data-testid={testId}
        onClick={pick}
        {...semanticProps(entry)}
      >
        <span
          className={styles.colorChip}
          style={{ backgroundColor: color } as CSSProperties}
          aria-hidden
        />
      </button>
    );
  };

  useBrowserLayoutEffect(() => {
    if (!focusOnMount) return;
    const selected = panelRef.current?.querySelector<HTMLElement>(
      `${PALETTE_CELL_SELECTOR}[aria-selected='true'], ${PALETTE_CELL_SELECTOR}[aria-pressed='true']`,
    );
    const first = panelRef.current?.querySelector<HTMLElement>(
      `${PALETTE_CELL_SELECTOR}, input`,
    );
    (selected ?? first)?.focus({ preventScroll: true });
  }, [focusOnMount]);

  if (highlighter) {
    const highlightEntry = (index: number, color: string) =>
      ({ kind: "standard", occurrenceId: `highlight-${index}`, color }) as const;
    // Office's menu: the fifteen swatches first, No Color under them.
    const noColorRow = Math.ceil(OFFICE_HIGHLIGHT_COLORS.length / 5);
    return (
      <div
        ref={panelRef}
        className={`${styles.panel} ${styles.highlightPanel}`}
        role="group"
        aria-label={labels.themeColors}
        onKeyDownCapture={handlePaletteKeyDown}
        {...previewHandlers}
        data-office-text-format-control={formatPreview ? "true" : undefined}
        data-testid={`${testIdPrefix}-palette`}
        data-palette-set="highlighter"
        data-control-surface={controlSurface}
      >
        <div
          className={`${styles.colorGrid} ${styles.highlightGrid}`}
          role="grid"
          aria-label={labels.themeColors}
        >
          {OFFICE_HIGHLIGHT_COLORS.map(({ color }, index) => {
            const name = colorNames?.highlight?.[index];
            const entry = highlightEntry(index, color);
            return (
              <button
                key={color}
                type="button"
                role="gridcell"
                aria-label={name || color}
                aria-selected={!noFillSelected && current === color}
                title={name || color}
                disabled={disabled}
                className={styles.colorCell}
                data-office-palette-cell="true"
                data-palette-row={Math.floor(index / 5)}
                data-palette-column={index % 5}
                data-preview-color={color}
                data-testid={`${testIdPrefix}-highlight-${index}`}
                onClick={() => {
                  documentTheme?.onEntry?.(color, entry);
                  if (onPickEntry) onPickEntry(color, entry);
                  else onPick(color);
                }}
                {...semanticProps(entry)}
              >
                <span
                  className={styles.colorChip}
                  style={{ backgroundColor: color } as CSSProperties}
                  aria-hidden
                />
              </button>
            );
          })}
        </div>
        {labels.noFill ? (
          <>
            <div className={styles.separator} />
            <button
              type="button"
              aria-label={labels.noFill}
              aria-pressed={noFillSelected}
              disabled={disabled}
              className={styles.actionRow}
              data-office-palette-cell="true"
              data-palette-row={noColorRow}
              data-palette-column={0}
              data-testid={`${testIdPrefix}-no-fill`}
              onClick={() => {
                documentTheme?.onEntry?.(null, noFillEntry);
                onPick(null);
              }}
              {...semanticProps(noFillEntry)}
            >
              <span className={styles.noFillChip} data-chrome-preview aria-hidden />
              <span>{labels.noFill}</span>
            </button>
          </>
        ) : null}
        {footer ? <><div className={styles.separator} />{footer}</> : null}
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      className={styles.panel}
      role="group"
      aria-label={labels.themeColors}
      onKeyDownCapture={handlePaletteKeyDown}
      {...previewHandlers}
      data-office-text-format-control={formatPreview ? "true" : undefined}
      data-testid={`${testIdPrefix}-palette`}
      data-control-surface={controlSurface}
    >
      {onAutomatic && labels.automatic ? (
        <>
          <button
            type="button"
            aria-label={labels.automatic}
            aria-pressed={automaticSelected}
            disabled={disabled}
            className={styles.actionRow}
            data-office-palette-cell="true"
            data-palette-row={0}
            data-palette-column={0}
            data-testid={`${testIdPrefix}-automatic`}
            onClick={onAutomatic}
            {...semanticProps(automaticEntry)}
          >
            <span
              className={styles.automaticChip}
              style={{ backgroundColor: "#000000" }}
              aria-hidden
            />
            <span>{labels.automatic}</span>
          </button>
          <div className={styles.separator} />
        </>
      ) : null}

      <div className={styles.heading}>{labels.themeColors}</div>
      <div
        className={styles.colorGrid}
        role="grid"
        aria-label={labels.themeColors}
      >
        {Array.from({ length: themeRowCount }, (_, rowIndex) =>
          grid.map((column, columnIndex) =>
            swatch(
              column[rowIndex] ?? "#000000",
              `theme-${columnIndex}-${rowIndex}`,
              `${testIdPrefix}-theme-${columnIndex}-${rowIndex}`,
              "theme",
              rowIndex + (onAutomatic ? 1 : 0),
              columnIndex,
              colorNames?.theme?.(columnIndex, rowIndex),
            ),
          ),
        )}
      </div>

      <div className={styles.separator} />
      <div className={styles.heading}>{labels.standardColors}</div>
      <div
        className={styles.colorGrid}
        role="grid"
        aria-label={labels.standardColors}
      >
        {STANDARD_COLORS.map((color, index) =>
          swatch(
            color,
            `standard-${index}`,
            `${testIdPrefix}-standard-${index}`,
            "standard",
            standardRow,
            index,
            colorNames?.standard?.[index],
          ),
        )}
      </div>

      {recents.length > 0 && labels.recentColors ? (
        <>
          <div className={styles.separator} />
          <div className={styles.heading}>{labels.recentColors}</div>
          <div
            className={styles.colorGrid}
            role="grid"
            aria-label={labels.recentColors}
          >
            {recents.flatMap((candidate, index) => {
              const color = normalizeHexColor(candidate);
              return color
                ? [
                    swatch(
                      color,
                      `recent-${index}`,
                      `${testIdPrefix}-recent-${index}`,
                      "recent",
                      recentRow,
                      index,
                    ),
                  ]
                : [];
            })}
          </div>
        </>
      ) : null}

      {allowNoFill && labels.noFill ? (
        <>
          <div className={styles.separator} />
          <button
            type="button"
            aria-label={labels.noFill}
            aria-pressed={noFillSelected}
            disabled={disabled}
            className={styles.actionRow}
            data-office-palette-cell="true"
            data-palette-row={clearRow}
            data-palette-column={0}
            data-testid={`${testIdPrefix}-no-fill`}
            onClick={() => {
              documentTheme?.onEntry?.(null, noFillEntry);
              onPick(null);
            }}
            {...semanticProps(noFillEntry)}
          >
            {/* A swatch standing for "no fill": white paper, in dark mode too. */}
            <span className={styles.noFillChip} data-chrome-preview aria-hidden />
            <span>{labels.noFill}</span>
          </button>
        </>
      ) : null}

      <div className={styles.separator} />
      <label className={styles.moreColors}>
        <Palette size={16} aria-hidden />
        <span>{labels.moreColors}</span>
        {/* Adjusting inside the browser's picker previews only; the colour
            is picked once, when the picker closes (see OfficeNativeColorInput). */}
        <OfficeNativeColorInput
          value={current ?? "#000000"}
          disabled={disabled}
          aria-label={labels.moreColors}
          data-testid={`${testIdPrefix}-more`}
          onCommit={(color) => {
            documentTheme?.onEntry?.(color, moreEntry);
            onPick(color);
          }}
          {...semanticProps(moreEntry)}
        />
      </label>
      {footer ? <><div className={styles.separator} />{footer}</> : null}
    </div>
  );
}

/**
 * A host row under a palette (Shape Fill's Picture… and More Gradients…),
 * drawn as the palette's own action rows are.
 */
export function OfficeColorPaletteActionRow({
  label,
  onSelect,
  disabled = false,
  disabledReason,
  testId,
}: {
  readonly label: string;
  readonly onSelect: () => void;
  readonly disabled?: boolean;
  readonly disabledReason?: string;
  readonly testId: string;
}) {
  return (
    <button
      type="button"
      className={styles.actionRow}
      disabled={disabled}
      title={disabled ? disabledReason : undefined}
      data-disabled-reason={disabled ? disabledReason : undefined}
      data-testid={testId}
      onClick={onSelect}
    >
      <span>{label}</span>
    </button>
  );
}
