"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { SquarePlus, SquareMinus } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { type GutterCell, type OutlineAxis } from "@mrnote/core/web/lib/spreadsheet/outline-groups.ts";
import { SPREADSHEET_OUTLINE_TOGGLE_HIT_PX } from "./spreadsheetGridConstants";

/** What spreadsheetOutlineRenderers reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetOutlineRenderersInputs {
  applyOutlineLevel: (axis: OutlineAxis, depth: number) => void;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  toggleOutlineGroup: (axis: OutlineAxis, range: { start: number; end: number; }) => void;
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function spreadsheetOutlineRenderers({
  applyOutlineLevel,
  t,
  toggleOutlineGroup,
}: SpreadsheetOutlineRenderersInputs) {
  // Outline gutter renderers (Excel/WPS parity). Pure-ish closures over the
  // group actions; cheap enough to recreate per render (not used as a memo dep).
  // A gutter cell draws a spanning bracket segment for its level plus, on a
  // group's summary line, the [-]/[+] collapse toggle.
  const renderOutlineCell = (
    cell: GutterCell | undefined,
    axis: OutlineAxis,
  ) => {
    if (!cell) return null;
    const toggles = cell.toggles ?? (cell.toggle ? [cell.toggle] : []);
    const stacked = toggles.length > 1;
    // Two boxes share a default-height row: Excel's own box is about 9px.
    const glyph = stacked && axis === "row" ? 9 : 11;
    const toggleBox = !stacked
      ? { width: SPREADSHEET_OUTLINE_TOGGLE_HIT_PX, height: SPREADSHEET_OUTLINE_TOGGLE_HIT_PX, minWidth: SPREADSHEET_OUTLINE_TOGGLE_HIT_PX, flex: "0 0 auto" }
      : axis === "row"
        ? { width: SPREADSHEET_OUTLINE_TOGGLE_HIT_PX, minHeight: 0, flex: "1 1 0" }
        : { height: SPREADSHEET_OUTLINE_TOGGLE_HIT_PX, minWidth: 0, flex: "1 1 0" };
    // Bracket line: a thin rule down (rows) / across (cols) the group body, with
    // a short cap at the first/last body line so the span reads as a bracket.
    const bracket =
      cell.level > 0 ? (
        <span
          aria-hidden
          className="spreadsheet-window__outline-bracket"
          data-bracket-top={cell.bracketTop ? "true" : undefined}
          data-bracket-bottom={cell.bracketBottom ? "true" : undefined}
          style={
            axis === "row"
              ? {
                  position: "absolute",
                  left: 7,
                  top: cell.bracketTop ? "50%" : 0,
                  bottom: cell.bracketBottom ? "50%" : 0,
                  width: 1,
                  background: "var(--border, #9ca3af)",
                }
              : {
                  position: "absolute",
                  top: 7,
                  left: cell.bracketTop ? "50%" : 0,
                  right: cell.bracketBottom ? "50%" : 0,
                  height: 1,
                  background: "var(--border, #9ca3af)",
                }
          }
        />
      ) : null;
    return (
      <span
        style={{
          position: "relative",
          // A column's bar cell is a block: an inline box would stand on
          // the heading's line box and stretch the 16px bar.
          display: axis === "row" ? "inline-flex" : "flex",
          alignItems: "center",
          justifyContent: "center",
          width: axis === "row" ? 16 : "100%",
          height: axis === "row" ? "100%" : 16,
        }}
      >
        {bracket}
        {toggles.length > 0 ? (
          // Nested groups that end on the same line each keep a button
          // (S-047): stacked in a row's band, side by side in a column's,
          // outermost first, as Excel's level columns order them.
          <span
            style={{
              position: "relative",
              zIndex: 1,
              display: "flex",
              flexDirection: axis === "row" ? "column" : "row",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              height: "100%",
            }}
          >
            {toggles.map((toggle) => (
              <button
                key={`${toggle.start}-${toggle.end}`}
                type="button"
                className="spreadsheet-window__outline-toggle"
                data-collapsed={toggle.collapsed ? "true" : "false"}
                title={
                  toggle.collapsed
                    ? t("spreadsheet.expandGroup")
                    : t("spreadsheet.collapseGroup")
                }
                aria-label={
                  toggle.collapsed
                    ? t("spreadsheet.expandGroup")
                    : t("spreadsheet.collapseGroup")
                }
                aria-expanded={!toggle.collapsed}
                data-testid={`spreadsheet-outline-toggle-${axis}-${toggle.start}-${toggle.end}`}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleOutlineGroup(axis, {
                    start: toggle.start,
                    end: toggle.end,
                  });
                }}
                style={{
                  position: "relative",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  // The window's buttons are 36px at least; this one is the
                  // outline bar's (16px), which it would otherwise stretch.
                  minHeight: 0,
                  padding: 0,
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  color: "inherit",
                  // Excel draws a small box (about 13px) but takes the click
                  // over the whole width of the outline gutter; here the button
                  // was exactly as big as its 11px glyph, so a click a pixel or
                  // two off its edge fell through to the gutter cell and
                  // selected the row instead of collapsing the group. Buttons
                  // sharing a line share its length.
                  ...toggleBox,
                }}
              >
                {toggle.collapsed ? (
                  <SquarePlus size={glyph} />
                ) : (
                  <SquareMinus size={glyph} />
                )}
              </button>
            ))}
          </span>
        ) : null}
      </span>
    );
  };

  // The corner level buttons (1/2/3…): button N collapses every group at level
  // >= N and expands the rest. The highest button (maxLevel + 1) shows the full
  // detail. Compact numeric buttons matching Excel's outline corner.
  const renderOutlineLevelButtons = (axis: OutlineAxis, maxLevel: number) => (
    <span
      className="spreadsheet-window__outline-levels"
      data-testid={`spreadsheet-outline-levels-${axis}`}
      style={{
        // A block: an inline box would stand on the heading's line box and
        // stretch the 16px bar to its font's line height.
        display: "flex",
        gap: 1,
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
      }}
    >
      {Array.from({ length: maxLevel + 1 }, (_, i) => i + 1).map((depth) => (
        <button
          key={depth}
          type="button"
          className="spreadsheet-window__outline-level"
          title={t("spreadsheet.outlineLevel", { level: depth })}
          aria-label={t("spreadsheet.outlineLevel", { level: depth })}
          data-testid={`spreadsheet-outline-level-${axis}-${depth}`}
          onClick={(event) => {
            event.stopPropagation();
            applyOutlineLevel(axis, depth);
          }}
          style={{
            fontSize: 9,
            lineHeight: 1,
            width: 12,
            height: 12,
            // Not the window's 36px button: the outline bar is 16px (and the
            // row levels sit in the 26px corner).
            minHeight: 0,
            padding: 0,
            border: "1px solid var(--border, #d1d5db)",
            borderRadius: 2,
            background: "transparent",
            cursor: "pointer",
            color: "inherit",
          }}
        >
          {depth}
        </button>
      ))}
    </span>
  );
  return {
    renderOutlineCell,
    renderOutlineLevelButtons,
  };
}
