"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { type CSSProperties, type ReactElement } from "react";
import { Check, FilterX, ListChecks, X } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { DEFAULT_SLICER_BUTTON_HEIGHT, DEFAULT_SLICER_COLUMNS, DEFAULT_SLICER_HEIGHT, DEFAULT_SLICER_WIDTH, slicerHeaderShortcut, type Slicer, type SlicerStyleId } from "../../../../lib/spreadsheet/slicer";

/**
 * A floating SLICER panel (Excel/WPS parity): a header (column title + a
 * Multi-Select toggle + a clear button + a remove button) over a list of value
 * chips with checkmarks. It owns no filter state — `selected` is the set
 * DERIVED by the host from the bound column's AutoFilter, and clicking a chip /
 * clearing calls back into the host, which writes that column's filter (the
 * single source of truth). When the column has no filter every chip reads as
 * selected (all rows visible). Multi-Select is a host-held view state that is
 * never saved: while it is on, every chip click toggles like a Ctrl+click.
 */
export const SLICER_STYLE_RECIPES: Record<
  SlicerStyleId,
  {
    border: string;
    header: string;
    headerText: string;
    selected: string;
    selectedText: string;
    surface: string;
  }
> = {
  light1: {
    border: "#94a3b8",
    header: "#f1f5f9",
    headerText: "#0f172a",
    selected: "#dbeafe",
    selectedText: "#1e3a8a",
    surface: "#ffffff",
  },
  light2: {
    border: "#60a5fa",
    header: "#dbeafe",
    headerText: "#1e3a8a",
    selected: "#bfdbfe",
    selectedText: "#1e40af",
    surface: "#eff6ff",
  },
  light3: {
    border: "#a78bfa",
    header: "#ede9fe",
    headerText: "#5b21b6",
    selected: "#ddd6fe",
    selectedText: "#5b21b6",
    surface: "#faf5ff",
  },
  dark1: {
    border: "#334155",
    header: "#334155",
    headerText: "#ffffff",
    selected: "#475569",
    selectedText: "#ffffff",
    surface: "#f8fafc",
  },
  dark2: {
    border: "#0369a1",
    header: "#0369a1",
    headerText: "#ffffff",
    selected: "#0284c7",
    selectedText: "#ffffff",
    surface: "#f0f9ff",
  },
  dark3: {
    border: "#6d28d9",
    header: "#6d28d9",
    headerText: "#ffffff",
    selected: "#7c3aed",
    selectedText: "#ffffff",
    surface: "#faf5ff",
  },
};

/** The workbook-session identity of one slicer's Multi-Select view state. */
export function slicerMultiSelectKey(sheetId: string, slicerId: string): string {
  return JSON.stringify([sheetId, slicerId]);
}

export function SlicerPanel({
  slicer,
  title,
  values,
  selected,
  filtered = false,
  disabledReason,
  active,
  multiSelect,
  onSelect,
  onToggle,
  onToggleMultiSelect,
  onClear,
  onRemove,
  style,
  t,
}: {
  slicer: Slicer;
  /** The resolved header label for the bound column. */
  title: string;
  /** The column's distinct display values (the chip list). */
  values: string[];
  /** The currently selected values (empty === no filter === all selected). */
  selected: Set<string>;
  /** The column IS filtered even though none of the current values is
   *  selected (the filtered value was edited away): no chip is lit and Clear
   *  stays available (live audit B172). */
  filtered?: boolean;
  /** Exact native-authority blocker; source metadata remains visible/readable. */
  disabledReason?: string;
  active: boolean;
  /** The header's Multi-Select button is on (a view state, never saved). */
  multiSelect: boolean;
  onSelect: () => void;
  onToggle: (value: string, additive: boolean) => void;
  onToggleMultiSelect: () => void;
  onClear: () => void;
  onRemove: () => void;
  style?: CSSProperties;
  t: (key: string) => string;
}): ReactElement {
  // No filter on the column means every value is "on" (Excel: an unfiltered
  // slicer shows all chips lit). A non-empty selection lights only its members;
  // a filter that matches nothing lights none.
  const allOn = selected.size === 0 && !filtered;
  const columns = slicer.columns ?? DEFAULT_SLICER_COLUMNS;
  const buttonHeight = slicer.buttonHeight ?? DEFAULT_SLICER_BUTTON_HEIGHT;
  const recipe = SLICER_STYLE_RECIPES[slicer.styleId ?? "light1"];
  return (
    <div
      role="group"
      tabIndex={0}
      aria-label={title}
      className="spreadsheet-window__slicer"
      data-testid={`spreadsheet-slicer-${slicer.column}`}
      data-slicer-column={slicer.column}
      data-selected={active ? "true" : "false"}
      onFocusCapture={onSelect}
      onPointerDown={(event) => {
        event.stopPropagation();
        if (!(
          event.target instanceof Element &&
          event.target.closest(
            "button,input,select,textarea,[contenteditable='true']",
          )
        )) {
          event.currentTarget.focus({ preventScroll: true });
        }
        onSelect();
      }}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        // The header shortcuts (Alt+S = Multi-Select, Alt+C = Clear Filter)
        // work from anywhere inside the slicer, and still work when the
        // header is hidden.
        const shortcut = slicerHeaderShortcut(event.nativeEvent);
        if (shortcut) {
          event.preventDefault();
          event.stopPropagation();
          if (event.repeat || disabledReason) return;
          if (shortcut === "multiSelect") onToggleMultiSelect();
          else if (selected.size > 0) onClear();
          return;
        }
        // Delete / Backspace removes the selected slicer, as Excel removes
        // the selected object (Microsoft Support, "Use slicers to filter
        // data": "select the slicer, and then press Delete"). Clicking an
        // item button leaves the focus on that button, so the key is taken
        // from any control inside the panel except a text field.
        if (
          !active ||
          (event.key !== "Delete" && event.key !== "Backspace") ||
          (event.target instanceof Element &&
            event.target.closest(
              "input,select,textarea,[contenteditable='true']",
            ))
        ) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        onRemove();
      }}
      style={{
        position: "absolute",
        zIndex: 20,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        width: slicer.width ?? DEFAULT_SLICER_WIDTH,
        // A slicer is the size its Size boxes say, as Excel's is: an unsized
        // one is the default height, not its content's (180 px under a box
        // reading 220; user audit S-025). Its buttons scroll inside it.
        height: slicer.height ?? DEFAULT_SLICER_HEIGHT,
        maxHeight: slicer.height ?? DEFAULT_SLICER_HEIGHT,
        padding: 6,
        background: recipe.surface,
        border: `1px solid ${recipe.border}`,
        borderRadius: 4,
        boxShadow: active
          ? "0 0 0 2px var(--console-accent, #15803d), 0 8px 24px rgba(0,0,0,0.14)"
          : "0 8px 24px rgba(0,0,0,0.12)",
        fontSize: 12,
        outline: "none",
        ...style,
      }}
    >
      {slicer.showHeader !== false ? (
        <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          fontWeight: 600,
          margin: -6,
          marginBottom: 2,
          padding: "6px 7px",
          background: recipe.header,
          color: recipe.headerText,
        }}
      >
        <span
          style={{
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={title}
          data-testid={`spreadsheet-slicer-title-${slicer.column}`}
        >
          {title}
        </span>
        <button
          type="button"
          onClick={onToggleMultiSelect}
          disabled={Boolean(disabledReason)}
          aria-pressed={multiSelect}
          aria-keyshortcuts="Alt+S"
          title={disabledReason ?? t("spreadsheet.slicerMultiSelectTooltip")}
          aria-label={
            disabledReason
              ? `${t("spreadsheet.slicerMultiSelect")}: ${disabledReason}`
              : t("spreadsheet.slicerMultiSelect")
          }
          data-testid={`spreadsheet-slicer-multi-select-${slicer.column}`}
          style={{
            fontSize: 11,
            padding: "1px 4px",
            borderRadius: 3,
            background: multiSelect ? recipe.selected : undefined,
            color: multiSelect ? recipe.selectedText : undefined,
            boxShadow: multiSelect ? "inset 0 0 0 1px currentColor" : undefined,
            cursor: disabledReason ? "default" : "pointer",
          }}
        >
          <ListChecks size={11} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={Boolean(disabledReason) || (selected.size === 0 && !filtered)}
          aria-keyshortcuts="Alt+C"
          title={disabledReason ?? t("spreadsheet.slicerClearTooltip")}
          aria-label={
            disabledReason
              ? `${t("spreadsheet.slicerClear")}: ${disabledReason}`
              : t("spreadsheet.slicerClear")
          }
          data-testid={`spreadsheet-slicer-clear-${slicer.column}`}
          style={{
            fontSize: 11,
            padding: "1px 4px",
            cursor:
              disabledReason || (selected.size === 0 && !filtered) ? "default" : "pointer",
          }}
        >
          <FilterX size={11} />
        </button>
        <button
          type="button"
          onClick={onRemove}
          title={t("spreadsheet.slicerRemove")}
          aria-label={t("spreadsheet.slicerRemove")}
          data-testid={`spreadsheet-slicer-remove-${slicer.column}`}
          style={{ fontSize: 11, padding: "1px 4px", cursor: "pointer" }}
        >
          <X size={11} />
        </button>
      </div>
      ) : null}
      {disabledReason ? (
        <div
          role="note"
          data-testid={`spreadsheet-slicer-disabled-${slicer.column}`}
          style={{
            padding: "4px 6px",
            borderRadius: 4,
            background: "rgba(148, 163, 184, 0.12)",
            color: "var(--muted-foreground, #64748b)",
            fontSize: 11,
            lineHeight: 1.35,
          }}
        >
          {disabledReason}
        </div>
      ) : null}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gap: 2,
          overflowY: "auto",
        }}
      >
        {values.length === 0 ? (
          <span style={{ fontSize: 12, opacity: 0.6, padding: "2px 0" }}>
            {t("spreadsheet.filterNoValues")}
          </span>
        ) : (
          values.map((value) => {
            const on = allOn || selected.has(value);
            return (
              <button
                type="button"
                key={value || "__blank__"}
                disabled={Boolean(disabledReason)}
                onClick={(event) =>
                  onToggle(
                    value,
                    multiSelect || event.ctrlKey || event.metaKey,
                  )
                }
                title={disabledReason}
                aria-pressed={on}
                data-testid={`spreadsheet-slicer-value-${slicer.column}`}
                data-value={value}
                data-selected={on ? "true" : "false"}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  textAlign: "left",
                  padding: "3px 6px",
                  minHeight: buttonHeight,
                  border: "1px solid var(--border, #e5e7eb)",
                  borderRadius: 5,
                  cursor: "pointer",
                  background: on
                    ? recipe.selected
                    : "transparent",
                  color: on ? recipe.selectedText : "inherit",
                  fontWeight: on ? 600 : 400,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 12,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {on ? <Check size={12} strokeWidth={2.5} /> : null}
                </span>
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontStyle: value === "" ? "italic" : undefined,
                    opacity: value === "" ? 0.7 : undefined,
                  }}
                >
                  {value === "" ? t("spreadsheet.filterBlanks") : value}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
