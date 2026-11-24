"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { CellSelection, isInTable, selectionCell } from "@tiptap/pm/tables";
import { useRef, useState } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import { OfficeColorPalettePopover } from "@mrnote/core/web/components/office-ribbon/OfficeColorPalettePopover.tsx";
import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { OfficeSemanticIcon } from "@mrnote/core/web/components/office-ribbon/icons/OfficeSemanticIcon.tsx";
import { officeBorderWeightLabel } from "@mrnote/core/web/components/office-ribbon/OfficeBordersMenu.tsx";

import { documentValueInputClassName } from "@mrnote/core/web/components/console/editor/documentValueInput.ts";
import styles from "@mrnote/core/web/components/console/editor/native-document/DocumentLayoutDialogs.module.css";
import {
  DEFAULT_PAGE_BORDER_EDGE,
  PAGE_BORDER_APPLY_SCOPES,
  PAGE_BORDER_MENU_STYLES,
  PAGE_BORDER_WEIGHT_POINTS,
  pageBorderApplyScope,
  pageBorderSides,
  type PageBorderApplyScope,
  type PageBorderMenuStyle,
  type PageBorders,
} from "./documentPageBorder";
import {
  effectiveSectionPageBorders,
  resolveSectionAtSelection,
  SECTION_BORDER_EDGE_NAMES,
  type SectionBorderEdge,
  type SectionBorderEdgeName,
} from "@mrnote/core/web/components/console/editor/native-document/sectionLayouts.ts";
import { normalizeCellBackgroundColor } from "@mrnote/core/web/components/console/editor/native-document/tableCellStyle.ts";
import {
  normalizeCellShadingPattern,
  normalizeTableShading,
  shadingCss,
  WORD_SHADING_PATTERNS,
  type WordShadingPattern,
} from "@mrnote/core/web/components/console/editor/native-document/tableShading.ts";

/*
 * The Page Border and Shading pages of Word's Borders and Shading dialog
 * ("Add a border to a page", "Add shading to a table", Microsoft Support;
 * ECMA-376 17.6.10 pgBorders, 17.3.4 CT_Border, 17.3.5 CT_Shd):
 *
 * Page Border
 * - Setting: None, Box, Shadow (w:shadow on every side), 3-D (w:frame, which
 *   Word draws on the right and bottom sides).
 * - Style, Color (Automatic = w:color auto), Width (w:sz, eighths of a
 *   point), Art (picture borders: not offered, see the report).
 * - Apply to: Whole document / This section / This section - First page only
 *   / This section - All except first page (w:display).
 * - Options…: Margin top/bottom/left/right in points (w:space), Measure from
 *   Edge of page or Text (w:offsetFrom), Always display in front (w:zOrder).
 * Shading
 * - Fill (w:fill), Patterns Style (w:val) and Color (w:color), Apply to Cell
 *   (w:tcPr/w:shd) or Table (w:tblPr/w:shd).
 */

// ---------------------------------------------------------------- page border

export type PageBorderSetting = "none" | "box" | "shadow" | "threeD" | "custom";

export interface PageBorderDialogValue {
  /**
   * Word's Setting. "custom" is a border on only some sides (Word selects
   * Custom for it): those sides are kept as they are.
   */
  setting: PageBorderSetting;
  /** The sides a Custom border has. */
  sides: readonly SectionBorderEdgeName[];
  /**
   * The border as the dialog opened on it: a side whose pen (style, colour,
   * width) the dialog did not change keeps its OWN pen, so opening and
   * pressing OK changes nothing.
   */
  opened: PageBorders | null;
  openedLine: { style: PageBorderMenuStyle; color: string; sizeEighths: number };
  style: PageBorderMenuStyle;
  /** `auto` or `rrggbb` (no hash), exactly as w:color stores it. */
  color: string;
  sizeEighths: number;
  spacePt: Record<SectionBorderEdgeName, number>;
  offsetFrom: "page" | "text";
  inFront: boolean;
  applyTo: PageBorderApplyScope;
}

export function pageBorderDialogValueFrom(
  borders: PageBorders | null,
  sectionCount: number,
): PageBorderDialogValue {
  const sides = pageBorderSides(borders);
  const first = sides.length && borders ? borders.edges[sides[0]] : undefined;
  const edge = first ?? DEFAULT_PAGE_BORDER_EDGE;
  const setting: PageBorderSetting = !first
    ? "none"
    : sides.length < SECTION_BORDER_EDGE_NAMES.length
      ? "custom"
      : sides.some((side) => borders?.edges[side]?.shadow)
        ? "shadow"
        : sides.some((side) => borders?.edges[side]?.frame)
          ? "threeD"
          : "box";
  const style = (PAGE_BORDER_MENU_STYLES as readonly string[]).includes(edge.style)
    ? (edge.style as PageBorderMenuStyle)
    : "single";
  const color = edge.color ?? "auto";
  const sizeEighths = edge.sizeEighths ?? 4;
  return {
    setting,
    sides: sides.length ? sides : SECTION_BORDER_EDGE_NAMES,
    opened: borders,
    openedLine: { style, color, sizeEighths },
    style,
    color,
    sizeEighths,
    spacePt: Object.fromEntries(
      SECTION_BORDER_EDGE_NAMES.map((side) => [
        side,
        borders?.edges[side]?.spacePt ?? edge.spacePt ?? 24,
      ]),
    ) as Record<SectionBorderEdgeName, number>,
    offsetFrom: borders?.offsetFrom ?? "page",
    inFront: (borders?.zOrder ?? "front") === "front",
    applyTo: borders
      ? sectionCount > 1
        ? pageBorderApplyScope(borders)
        : borders.display === "allPages"
          ? "wholeDocument"
          : pageBorderApplyScope(borders)
      : "wholeDocument",
  };
}

/** The complete `<w:pgBorders>` a dialog value describes (null for None). */
export function pageBordersFromDialogValue(
  value: PageBorderDialogValue,
): PageBorders | null {
  if (value.setting === "none") return null;
  const edges: Partial<Record<SectionBorderEdgeName, SectionBorderEdge>> = {};
  const penChanged =
    value.style !== value.openedLine.style ||
    value.color !== value.openedLine.color ||
    value.sizeEighths !== value.openedLine.sizeEighths;
  const sides =
    value.setting === "custom" ? value.sides : SECTION_BORDER_EDGE_NAMES;
  for (const side of sides) {
    const own = penChanged ? undefined : value.opened?.edges[side];
    edges[side] = {
      style: own?.style ?? value.style,
      sizeEighths: Math.min(
        96,
        Math.max(2, Math.round(own?.sizeEighths ?? value.sizeEighths)),
      ),
      spacePt: Math.min(31, Math.max(0, Math.round(value.spacePt[side]))),
      color: own?.color ?? value.color,
      ...(value.setting === "shadow" ||
      (value.setting === "custom" && own?.shadow)
        ? { shadow: true }
        : {}),
      // Word's 3-D setting frames the right and bottom sides.
      ...((value.setting === "threeD" && (side === "right" || side === "bottom")) ||
      (value.setting === "custom" && own?.frame)
        ? { frame: true }
        : {}),
    };
  }
  return {
    offsetFrom: value.offsetFrom,
    display:
      value.applyTo === "thisSectionFirstPageOnly"
        ? "firstPage"
        : value.applyTo === "thisSectionAllExceptFirstPage"
          ? "notFirstPage"
          : "allPages",
    zOrder: value.inFront ? "front" : "back",
    edges,
  };
}

type SectionLayoutChain = {
  updateSectionLayout: (
    index: number,
    patch: { pageBorders: PageBorders | null },
  ) => SectionLayoutChain;
  run: () => boolean;
};

/**
 * Write a Page Border page in one transaction: the border is replaced whole
 * (cleared, then set) on the section(s) Apply to names, so no edge property
 * of the old border survives under the new one.
 */
export function applyPageBorderDialogValue(
  editor: Editor,
  value: PageBorderDialogValue,
): boolean {
  if (editor.isDestroyed || !editor.isEditable) return false;
  const borders = pageBordersFromDialogValue(value);
  const { sectionIndex, sectionCount } = resolveSectionAtSelection(editor.state);
  const indexes =
    value.applyTo === "wholeDocument"
      ? Array.from({ length: sectionCount }, (_, index) => index)
      : [sectionIndex];
  let chain = editor.chain() as unknown as SectionLayoutChain;
  for (const index of indexes) {
    chain = chain.updateSectionLayout(index, { pageBorders: null });
    if (borders) chain = chain.updateSectionLayout(index, { pageBorders: borders });
  }
  return chain.run();
}

export function currentPageBorderDialogValue(editor: Editor): PageBorderDialogValue {
  return pageBorderDialogValueFrom(
    effectiveSectionPageBorders(editor.state),
    resolveSectionAtSelection(editor.state).sectionCount,
  );
}

function hashColor(color: string): string {
  return color === "auto" ? "#000000" : `#${color}`;
}

export function DocumentPageBorderPanel({
  value,
  onChange,
  disabled = false,
}: {
  value: PageBorderDialogValue;
  onChange: (next: PageBorderDialogValue) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("console-notebooks");
  const colorRef = useRef<HTMLButtonElement | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const set = (patch: Partial<PageBorderDialogValue>) => onChange({ ...value, ...patch });
  const lineDisabled = disabled || value.setting === "none";
  return (
    <div className="office-dialog__body" data-testid="document-borders-page-panel">
      <fieldset className="office-dialog__group" disabled={disabled}>
        <legend>{t("toolbar.pageBorderSetting")}</legend>
        <div className={styles.choiceRow} role="radiogroup">
          {(["none", "box", "shadow", "threeD"] as const).map((setting) => (
            <label className="office-dialog__check" key={setting}>
              <input
                type="radio"
                name="document-page-border-setting"
                checked={value.setting === setting}
                data-testid={`document-page-border-setting-${setting}`}
                onChange={() =>
                  // Box, Shadow and 3-D are all four sides.
                  set({ setting, sides: SECTION_BORDER_EDGE_NAMES })
                }
              />
              <OfficeSemanticIcon
                semanticId={`page.border.${setting}`}
                size={16}
                className="office-dialog__icon"
              />
              {t(`toolbar.pageBorderSetting_${setting}` as "toolbar.pageBorderSetting_box")}
            </label>
          ))}
          {value.sides.length < SECTION_BORDER_EDGE_NAMES.length ? (
            <label className="office-dialog__check" key="custom">
              <input
                type="radio"
                name="document-page-border-setting"
                checked={value.setting === "custom"}
                data-testid="document-page-border-setting-custom"
                onChange={() => set({ setting: "custom" })}
              />
              <OfficeSemanticIcon
                semanticId="page.border.custom"
                size={16}
                className="office-dialog__icon"
              />
              {t("toolbar.pageBorderSetting_custom")}
            </label>
          ) : null}
        </div>
      </fieldset>
      <div className={styles.twoColumns}>
        <label className="office-dialog__field">
          <span className="office-dialog__label">{t("toolbar.pageBorderStyle")}</span>
          <select
            data-testid="document-page-border-style"
            value={value.style}
            disabled={lineDisabled}
            onChange={(event) =>
              set({ style: event.currentTarget.value as PageBorderMenuStyle })
            }
          >
            {PAGE_BORDER_MENU_STYLES.map((style) => (
              <option key={style} value={style}>
                {t(`toolbar.pageBorderStyle_${style}` as "toolbar.pageBorderStyle_single")}
              </option>
            ))}
          </select>
        </label>
        <label className="office-dialog__field">
          <span className="office-dialog__label">{t("toolbar.pageBorderWidthLabel")}</span>
          <select
            data-testid="document-page-border-width"
            value={String(value.sizeEighths / 8)}
            disabled={lineDisabled}
            onChange={(event) =>
              set({ sizeEighths: Math.round(Number(event.currentTarget.value) * 8) })
            }
          >
            {PAGE_BORDER_WEIGHT_POINTS.map((points) => (
              <option key={points} value={String(points)}>
                {officeBorderWeightLabel(points)}
              </option>
            ))}
          </select>
        </label>
        <div className="office-dialog__field" style={{ position: "relative" }}>
          <span className="office-dialog__label">{t("toolbar.pageBorderColor")}</span>
          <button
            ref={colorRef}
            type="button"
            className="office-dialog__button"
            disabled={lineDisabled}
            data-testid="document-page-border-color"
            data-color={value.color}
            aria-haspopup="dialog"
            aria-expanded={paletteOpen}
            onClick={() => setPaletteOpen((open) => !open)}
          >
            <span
              className={styles.swatch}
              style={{ background: hashColor(value.color) }}
              aria-hidden
            />
            {value.color === "auto" ? t("toolbar.textColorAutomatic") : null}
          </button>
          {paletteOpen ? (
            <OfficeColorPalettePopover
              anchorRef={colorRef}
              zIndex={1000}
              value={hashColor(value.color)}
              labels={{
                automatic: t("toolbar.textColorAutomatic"),
                themeColors: t("toolbar.themeColors"),
                standardColors: t("toolbar.standardColors"),
                recentColors: t("spreadsheet.recentColors"),
                moreColors: t("toolbar.pageBorderColor"),
              }}
              onAutomatic={() => {
                set({ color: "auto" });
                setPaletteOpen(false);
              }}
              onPick={(color) => {
                if (color) set({ color: color.replace(/^#/, "").toLowerCase() });
                setPaletteOpen(false);
              }}
              onDismiss={() => setPaletteOpen(false)}
              testIdPrefix="document-page-border-color"
            />
          ) : null}
        </div>
        <label className="office-dialog__field">
          <span className="office-dialog__label">{t("toolbar.pageBorderArt")}</span>
          <select disabled data-testid="document-page-border-art" value="none">
            <option value="none">{t("toolbar.pageBorderArtNone")}</option>
          </select>
        </label>
      </div>
      <label className="office-dialog__row">
        <span className="office-dialog__label">{t("toolbar.pageBorderApplyTo")}</span>
        <select
          data-testid="document-page-border-apply-to"
          value={value.applyTo}
          disabled={disabled}
          onChange={(event) =>
            set({ applyTo: event.currentTarget.value as PageBorderApplyScope })
          }
        >
          {PAGE_BORDER_APPLY_SCOPES.map((scope) => (
            <option key={scope} value={scope}>
              {t(
                scope === "wholeDocument"
                  ? "toolbar.pageBorderApplyWholeDocument"
                  : scope === "thisSection"
                    ? "toolbar.pageBorderApplyThisSection"
                    : scope === "thisSectionFirstPageOnly"
                      ? "toolbar.pageBorderApplyFirstPageOnly"
                      : "toolbar.pageBorderApplyExceptFirstPage",
              )}
            </option>
          ))}
        </select>
      </label>
      <section className="office-dialog__group">
        <h3 className="office-dialog__section-title">{t("toolbar.pageBorderOptions")}</h3>
        <div className={styles.twoColumns}>
          {SECTION_BORDER_EDGE_NAMES.map((side) => (
            <label className="office-dialog__field" key={side}>
              <span className="office-dialog__label">
                {t(
                  side === "top"
                    ? "toolbar.pageSetupMarginTop"
                    : side === "bottom"
                      ? "toolbar.pageSetupMarginBottom"
                      : side === "left"
                        ? "toolbar.pageSetupMarginLeft"
                        : "toolbar.pageSetupMarginRight",
                )}
              </span>
              <span className={styles.valueRow}>
                <input
                  type="number"
                  min={0}
                  max={31}
                  className={documentValueInputClassName("note-editor-office-toolbar__input")}
                  data-testid={`document-page-border-margin-${side}`}
                  value={String(value.spacePt[side])}
                  disabled={lineDisabled}
                  onChange={(event) => {
                    const next = Number(event.currentTarget.value);
                    if (Number.isFinite(next)) {
                      set({ spacePt: { ...value.spacePt, [side]: next } });
                    }
                  }}
                />
                <span className={styles.unit}>pt</span>
              </span>
            </label>
          ))}
        </div>
        <div className={styles.twoColumns}>
          <label className="office-dialog__field">
            <span className="office-dialog__label">{t("toolbar.pageBorderMeasureFrom")}</span>
            <select
              data-testid="document-page-border-measure-from"
              value={value.offsetFrom}
              disabled={lineDisabled}
              onChange={(event) =>
                set({ offsetFrom: event.currentTarget.value === "text" ? "text" : "page" })
              }
            >
              <option value="page">{t("toolbar.pageBorderMeasureFromPage")}</option>
              <option value="text">{t("toolbar.pageBorderMeasureFromText")}</option>
            </select>
          </label>
          <div className="office-dialog__field">
            <label className="office-dialog__check">
              <input
                type="checkbox"
                checked={value.inFront}
                disabled={lineDisabled}
                data-testid="document-page-border-in-front"
                onChange={(event) => set({ inFront: event.currentTarget.checked })}
              />
              {t("toolbar.pageBorderInFrontOfText")}
            </label>
          </div>
        </div>
      </section>
    </div>
  );
}

// -------------------------------------------------------------------- shading

export interface ShadingDialogValue {
  fill: string | null;
  pattern: WordShadingPattern;
  /** `#rrggbb`, or null for Automatic. */
  patternColor: string | null;
  applyTo: "cell" | "table";
}

function findTable(editor: Editor): { pos: number; node: import("@tiptap/pm/model").Node } | null {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === "table") return { pos: $from.before(depth), node };
  }
  return null;
}

export function currentShadingDialogValue(editor: Editor): ShadingDialogValue {
  const { $from } = editor.state.selection;
  let cellPattern = null as ReturnType<typeof normalizeCellShadingPattern>;
  let cellFill: string | null = null;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === "tableCell" || node.type.name === "tableHeader") {
      cellPattern = normalizeCellShadingPattern(node.attrs.cellShading);
      cellFill = normalizeCellBackgroundColor(node.attrs.backgroundColor);
      break;
    }
  }
  return {
    fill: cellFill,
    pattern: cellPattern?.pattern ?? "clear",
    patternColor: cellPattern?.color ?? null,
    applyTo: "cell",
  };
}

/** Write the Shading page: the selected cells' w:shd, or the table's. */
export function applyShadingDialogValue(
  editor: Editor,
  value: ShadingDialogValue,
): boolean {
  if (editor.isDestroyed || !editor.isEditable) return false;
  const pattern =
    value.pattern === "clear"
      ? null
      : normalizeCellShadingPattern({
          pattern: value.pattern,
          ...(value.patternColor ? { color: value.patternColor } : {}),
        });
  if (value.applyTo === "table") {
    const table = findTable(editor);
    if (!table) return false;
    const shading = normalizeTableShading({
      ...(value.fill ? { fill: value.fill } : {}),
      ...(pattern ?? {}),
    });
    const tr = editor.state.tr.setNodeMarkup(table.pos, undefined, {
      ...table.node.attrs,
      tableShading: shading,
    });
    editor.view.dispatch(tr);
    return true;
  }
  // The selected cells (or the caret's cell) take the fill and the pattern
  // in one step. A cell that already has one of them is not a failure: the
  // table command used before refused a fill the cell already had, so a
  // pattern change on a white cell applied yet reported "the table or
  // selection changed" and the dialog stayed open (WUA 240).
  const { state } = editor;
  if (!isInTable(state)) return false;
  const tr = state.tr;
  const write = (node: ProseMirrorNode, pos: number) => {
    if (
      node.attrs.backgroundColor === value.fill &&
      JSON.stringify(node.attrs.cellShading ?? null) === JSON.stringify(pattern)
    ) {
      return;
    }
    tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      backgroundColor: value.fill,
      cellShading: pattern,
    });
  };
  if (state.selection instanceof CellSelection) {
    state.selection.forEachCell(write);
  } else {
    const $cell = selectionCell(state);
    if (!$cell.nodeAfter) return false;
    write($cell.nodeAfter, $cell.pos);
  }
  if (tr.docChanged) editor.view.dispatch(tr);
  return true;
}

const PATTERN_LABEL_KEYS: Partial<Record<WordShadingPattern, string>> = {
  clear: "toolbar.shadingPatternClear",
  solid: "toolbar.shadingPatternSolid",
  horzStripe: "toolbar.shadingPatternHorzStripe",
  vertStripe: "toolbar.shadingPatternVertStripe",
  reverseDiagStripe: "toolbar.shadingPatternReverseDiagStripe",
  diagStripe: "toolbar.shadingPatternDiagStripe",
  horzCross: "toolbar.shadingPatternHorzCross",
  diagCross: "toolbar.shadingPatternDiagCross",
  thinHorzStripe: "toolbar.shadingPatternThinHorzStripe",
  thinVertStripe: "toolbar.shadingPatternThinVertStripe",
  thinReverseDiagStripe: "toolbar.shadingPatternThinReverseDiagStripe",
  thinDiagStripe: "toolbar.shadingPatternThinDiagStripe",
  thinHorzCross: "toolbar.shadingPatternThinHorzCross",
  thinDiagCross: "toolbar.shadingPatternThinDiagCross",
};

export function DocumentShadingPanel({
  value,
  onChange,
  tableAvailable,
  disabled = false,
}: {
  value: ShadingDialogValue;
  onChange: (next: ShadingDialogValue) => void;
  tableAvailable: boolean;
  disabled?: boolean;
}) {
  const t = useTranslations("console-notebooks");
  const fillRef = useRef<HTMLButtonElement | null>(null);
  const colorRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState<"fill" | "pattern" | null>(null);
  const set = (patch: Partial<ShadingDialogValue>) => onChange({ ...value, ...patch });
  const preview = shadingCss(value.fill, {
    pattern: value.pattern,
    ...(value.patternColor ? { color: value.patternColor } : {}),
  });
  const labels = {
    themeColors: t("toolbar.themeColors"),
    standardColors: t("toolbar.standardColors"),
    recentColors: t("spreadsheet.recentColors"),
    moreColors: t("toolbar.cellShading"),
    noFill: t("toolbar.shadingNoColor"),
    automatic: t("toolbar.textColorAutomatic"),
  };
  return (
    <div className="office-dialog__body" data-testid="document-borders-shading-panel">
      <div className={styles.twoColumns}>
        <div className="office-dialog__field" style={{ position: "relative" }}>
          <span className="office-dialog__label">{t("toolbar.shadingFill")}</span>
          <button
            ref={fillRef}
            type="button"
            className="office-dialog__button"
            disabled={disabled}
            data-testid="document-shading-fill"
            data-color={value.fill ?? "none"}
            onClick={() => setOpen(open === "fill" ? null : "fill")}
          >
            <span
              className={styles.swatch}
              style={{ background: value.fill ?? "transparent" }}
              aria-hidden
            />
            {value.fill ? null : t("toolbar.shadingNoColor")}
          </button>
          {open === "fill" ? (
            <OfficeColorPalettePopover
              anchorRef={fillRef}
              zIndex={1000}
              value={value.fill ?? undefined}
              allowNoFill
              noFillSelected={value.fill === null}
              labels={labels}
              onPick={(color) => {
                set({ fill: color ? color.toLowerCase() : null });
                setOpen(null);
              }}
              onDismiss={() => setOpen(null)}
              testIdPrefix="document-shading-fill"
            />
          ) : null}
        </div>
        <label className="office-dialog__field">
          <span className="office-dialog__label">{t("toolbar.shadingApplyTo")}</span>
          <select
            data-testid="document-shading-apply-to"
            value={value.applyTo}
            disabled={disabled}
            onChange={(event) =>
              set({ applyTo: event.currentTarget.value === "table" ? "table" : "cell" })
            }
          >
            <option value="cell">{t("toolbar.shadingApplyCell")}</option>
            <option value="table" disabled={!tableAvailable}>
              {t("toolbar.shadingApplyTable")}
            </option>
          </select>
        </label>
      </div>
      <section className="office-dialog__group">
        <h3 className="office-dialog__section-title">{t("toolbar.shadingPatterns")}</h3>
        <div className={styles.twoColumns}>
          <label className="office-dialog__field">
            <span className="office-dialog__label">{t("toolbar.shadingPatternStyle")}</span>
            <select
              data-testid="document-shading-pattern"
              value={value.pattern}
              disabled={disabled}
              onChange={(event) =>
                set({ pattern: event.currentTarget.value as WordShadingPattern })
              }
            >
              {WORD_SHADING_PATTERNS.map((pattern) => (
                <option key={pattern} value={pattern}>
                  {PATTERN_LABEL_KEYS[pattern]
                    ? t(PATTERN_LABEL_KEYS[pattern] as "toolbar.shadingPatternClear")
                    : `${pattern.replace("pct", "")}%`}
                </option>
              ))}
            </select>
          </label>
          <div className="office-dialog__field" style={{ position: "relative" }}>
            <span className="office-dialog__label">{t("toolbar.shadingPatternColor")}</span>
            <button
              ref={colorRef}
              type="button"
              className="office-dialog__button"
              disabled={disabled || value.pattern === "clear"}
              data-testid="document-shading-pattern-color"
              data-color={value.patternColor ?? "auto"}
              onClick={() => setOpen(open === "pattern" ? null : "pattern")}
            >
              <span
                className={styles.swatch}
                style={{ background: value.patternColor ?? "#000000" }}
                aria-hidden
              />
              {value.patternColor ? null : t("toolbar.textColorAutomatic")}
            </button>
            {open === "pattern" ? (
              <OfficeColorPalettePopover
                anchorRef={colorRef}
                zIndex={1000}
                value={value.patternColor ?? "#000000"}
                labels={labels}
                onAutomatic={() => {
                  set({ patternColor: null });
                  setOpen(null);
                }}
                onPick={(color) => {
                  if (color) set({ patternColor: color.toLowerCase() });
                  setOpen(null);
                }}
                onDismiss={() => setOpen(null)}
                testIdPrefix="document-shading-pattern-color"
              />
            ) : null}
          </div>
        </div>
      </section>
      <div
        className={`office-dialog__well ${styles.previewWell}`}
        data-testid="document-shading-preview"
        style={{
          backgroundColor: preview.backgroundColor ?? "transparent",
          backgroundImage: preview.backgroundImage,
        }}
        aria-hidden
      />
    </div>
  );
}

/**
 * Borders and Shading opened on its Page Border page from Design/Layout >
 * Page Borders (Word opens the same dialog there). Outside a table the
 * Borders and Shading pages about table cells have nothing to act on, so
 * this entrance carries the Page Border page alone.
 */
export function DocumentPageBordersDialog({
  editor,
  onClose,
}: {
  editor: Editor;
  onClose: () => void;
}) {
  const t = useTranslations("console-notebooks");
  const [value, setValue] = useState(() => currentPageBorderDialogValue(editor));
  const [error, setError] = useState<string | null>(null);
  const canEdit = !editor.isDestroyed && editor.isEditable;
  return (
    <OfficeDialogShell
      open
      testIdPrefix="document-page-borders"
      title={t("toolbar.bordersShading")}
      description=""
      defaultActionLabel={t("toolbar.dialogOk")}
      defaultActionDisabled={!canEdit}
      cancelActionLabel={t("toolbar.pageSetupCancel")}
      onDefaultAction={() => {
        if (applyPageBorderDialogValue(editor, value)) onClose();
        else setError(t("toolbar.tableBordersStale"));
      }}
      onCancel={onClose}
      className="sm:max-w-[560px]"
      tabStrip={
        <div className="office-dialog__tabs" role="tablist" aria-label={t("toolbar.bordersShading")}>
          <button type="button" role="tab" aria-selected className="office-dialog__tab">
            {t("toolbar.bordersShadingTabPageBorder")}
          </button>
        </div>
      }
    >
      <DocumentPageBorderPanel value={value} onChange={setValue} disabled={!canEdit} />
      {error ? (
        <p className="office-dialog__message" role="alert">
          {error}
        </p>
      ) : null}
    </OfficeDialogShell>
  );
}
