"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  ChevronDown,
  FilterX,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from "react";

import {
  DEFAULT_PIVOT_TIMELINE_HEIGHT,
  DEFAULT_PIVOT_TIMELINE_WIDTH,
  PIVOT_TIMELINE_LEVELS,
  pivotTimelineGroupLabel,
  pivotTimelinePeriods,
  pivotTimelineRangeForTiles,
  pivotTimelineScrollIndex,
  pivotTimelineSelectedTileSpan,
  pivotTimelineSelectionLabel,
  pivotTimelineStyleRecipe,
  pivotTimelineTileLabel,
  pivotTimelineTileState,
  type PivotTimeline,
  type PivotTimelineChange,
  type PivotTimelineLevel,
  type PivotTimelineRange,
} from "../../../../lib/spreadsheet/pivot-timeline";

export interface SpreadsheetPivotTimelineLabels {
  allPeriods: string;
  clearFilter: string;
  timeLevel: string;
  periods: string;
  levels: Record<PivotTimelineLevel, string>;
}

interface Props {
  timeline: PivotTimeline;
  /** Why the viewer cannot use the timeline; the view stays readable. */
  disabledReason?: string;
  active: boolean;
  accents?: readonly string[];
  locale?: string;
  labels: SpreadsheetPivotTimelineLabels;
  onSelect: () => void;
  onChange: (change: PivotTimelineChange) => void;
  style?: CSSProperties;
}

const TILE_WIDTH: Record<PivotTimelineLevel, number> = {
  years: 52,
  quarters: 44,
  months: 40,
  days: 28,
};

interface DragState {
  pointerId: number;
  anchor: number;
  focus: number;
}

/**
 * An Excel timeline (Excel for the web use-state): caption with Clear
 * Filter, the selection label, the time-level menu, and a scrolling strip of
 * period tiles. Click selects one period, drag or Shift+click selects a
 * contiguous span, a span handle moves one end of the selection, arrow keys
 * move between tiles. The host owns persistence; this component only reports
 * the requested use-state change.
 */
export function SpreadsheetPivotTimeline({
  timeline,
  disabledReason,
  active,
  accents,
  locale,
  labels,
  onSelect,
  onChange,
  style,
}: Props): ReactElement {
  const recipe = pivotTimelineStyleRecipe(timeline.style, accents);
  const t = useTranslations("console-notebooks");
  const baseId = useId();
  const [level, setLevel] = useState<PivotTimelineLevel>(timeline.level);
  useEffect(() => setLevel(timeline.level), [timeline.level]);
  const periods = useMemo(
    () => pivotTimelinePeriods(timeline.bounds, level),
    [timeline.bounds, level],
  );
  const tileWidth = TILE_WIDTH[level];
  const stripRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const disabled = Boolean(disabledReason);

  const scrollIndex = pivotTimelineScrollIndex(periods, timeline);
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    strip.scrollLeft = scrollIndex * tileWidth;
    setFocusIndex(scrollIndex);
  }, [scrollIndex, tileWidth]);

  const firstVisibleDay = useCallback((): string | undefined => {
    const strip = stripRef.current;
    const index = strip ? Math.floor(strip.scrollLeft / tileWidth) : 0;
    return periods[Math.max(0, Math.min(periods.length - 1, index))]?.start;
  }, [periods, tileWidth]);

  const preview: PivotTimelineRange | undefined = drag
    ? pivotTimelineRangeForTiles(periods, drag.anchor, drag.focus) ?? undefined
    : timeline.selection;
  // The span handles sit on the outer tiles of the shown selection.
  const previewSpan = disabled ? null : pivotTimelineSelectedTileSpan(periods, preview);

  const commitRange = useCallback(
    (anchor: number, focus: number) => {
      const range = pivotTimelineRangeForTiles(periods, anchor, focus);
      if (!range) return;
      onChange({
        selection: range,
        selectionLevel: level,
        level,
        scrollPosition: firstVisibleDay(),
      });
    },
    [firstVisibleDay, level, onChange, periods],
  );

  const anchorFor = useCallback(
    (index: number, extend: boolean): number => {
      if (!extend) return index;
      const span = pivotTimelineSelectedTileSpan(periods, timeline.selection);
      if (!span) return index;
      // Excel keeps the far end of the current selection fixed.
      return index >= span.first ? span.first : span.last;
    },
    [periods, timeline.selection],
  );

  // The tile under the pointer: the event target's tile, or (while the strip
  // holds pointer capture and receives every move) the column under clientX.
  const tileIndexAt = (event: ReactPointerEvent<HTMLDivElement>): number | null => {
    const tile =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-period-index]")
        : null;
    if (tile && event.currentTarget.contains(tile)) {
      const index = Number(tile.dataset.periodIndex);
      return Number.isInteger(index) && index >= 0 && index < periods.length ? index : null;
    }
    const strip = stripRef.current;
    if (!strip) return null;
    const box = strip.getBoundingClientRect();
    const index = Math.floor((event.clientX - box.left + strip.scrollLeft) / tileWidth);
    return index >= 0 && index < periods.length ? index : null;
  };

  const onTilePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || event.button !== 0) return;
    const index = tileIndexAt(event);
    if (index === null) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setFocusIndex(index);
    // A span handle moves its own end; the other end stays where it is.
    const handle =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-timeline-handle]")?.dataset.timelineHandle
        : undefined;
    const span = handle ? pivotTimelineSelectedTileSpan(periods, timeline.selection) : null;
    const anchor = span
      ? handle === "start"
        ? span.last
        : span.first
      : anchorFor(index, event.shiftKey);
    setDrag({ pointerId: event.pointerId, anchor, focus: index });
  };
  const onTilePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const index = tileIndexAt(event);
    if (index === null || index === drag.focus) return;
    setDrag({ ...drag, focus: index });
  };
  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>, commit: boolean) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    setDrag(null);
    if (commit) commitRange(drag.anchor, drag.focus);
  };

  const onStripKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (disabled || periods.length === 0) return;
    const move = (index: number) => {
      const clamped = Math.max(0, Math.min(periods.length - 1, index));
      setFocusIndex(clamped);
      const strip = stripRef.current;
      if (strip) {
        const left = clamped * tileWidth;
        if (left < strip.scrollLeft) strip.scrollLeft = left;
        else if (left + tileWidth > strip.scrollLeft + strip.clientWidth) {
          strip.scrollLeft = left + tileWidth - strip.clientWidth;
        }
      }
      return clamped;
    };
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowRight": {
        event.preventDefault();
        const next = move(focusIndex + (event.key === "ArrowLeft" ? -1 : 1));
        if (event.shiftKey) commitRange(anchorFor(next, true), next);
        return;
      }
      case "Home":
      case "End": {
        event.preventDefault();
        move(event.key === "Home" ? 0 : periods.length - 1);
        return;
      }
      case "Enter":
      case " ": {
        event.preventDefault();
        commitRange(anchorFor(focusIndex, event.shiftKey), focusIndex);
        return;
      }
      default:
    }
  };

  const groups = useMemo(() => {
    const out: Array<{ key: string; label: string; count: number }> = [];
    for (const period of periods) {
      const last = out.at(-1);
      if (last && last.key === period.groupKey) {
        last.count += 1;
      } else {
        out.push({
          key: period.groupKey,
          label: pivotTimelineGroupLabel(period, level, locale),
          count: 1,
        });
      }
    }
    return out;
  }, [level, locale, periods]);

  const width = timeline.width ?? DEFAULT_PIVOT_TIMELINE_WIDTH;
  const height = timeline.height ?? DEFAULT_PIVOT_TIMELINE_HEIGHT;
  const selectionLabel = pivotTimelineSelectionLabel(
    timeline.selection,
    timeline.selectionLevel,
    labels.allPeriods,
    locale,
    t,
  );

  return (
    <div
      role="group"
      tabIndex={-1}
      aria-label={timeline.caption}
      className="spreadsheet-window__timeline"
      data-testid={`spreadsheet-timeline-${timeline.id}`}
      data-selected={active ? "true" : "false"}
      data-disabled={disabled ? "true" : "false"}
      onPointerDown={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      style={{
        position: "absolute",
        zIndex: 20,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        width,
        height,
        boxSizing: "border-box",
        padding: "6px 8px",
        background: recipe.surface,
        color: recipe.headerText,
        border: `1px solid ${recipe.border}`,
        borderRadius: 2,
        boxShadow: active
          ? "0 0 0 2px var(--console-accent, #15803d), 0 8px 24px rgba(0,0,0,0.14)"
          : "0 2px 8px rgba(0,0,0,0.10)",
        fontSize: 12,
        overflow: "hidden",
        outline: "none",
        userSelect: "none",
        ...style,
      }}
    >
      {timeline.showHeader ? (
        <div style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 20 }}>
          <span
            data-testid={`spreadsheet-timeline-caption-${timeline.id}`}
            title={timeline.caption}
            style={{
              flex: 1,
              minWidth: 0,
              fontWeight: 600,
              fontSize: 13,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {timeline.caption}
          </span>
          <button
            type="button"
            onClick={() => onChange({ selection: null })}
            disabled={disabled || !timeline.selection}
            title={disabledReason ?? labels.clearFilter}
            aria-label={labels.clearFilter}
            data-testid={`spreadsheet-timeline-clear-${timeline.id}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 22,
              height: 20,
              padding: 0,
              border: `1px solid ${recipe.border}`,
              borderRadius: 2,
              background: "transparent",
              color: recipe.headerText,
              opacity: disabled || !timeline.selection ? 0.45 : 1,
              cursor: disabled || !timeline.selection ? "default" : "pointer",
            }}
          >
            <FilterX size={12} aria-hidden="true" />
          </button>
        </div>
      ) : null}
      {timeline.showSelectionLabel || timeline.showTimeLevel ? (
        <div style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 18 }}>
          <span
            data-testid={`spreadsheet-timeline-selection-${timeline.id}`}
            style={{
              flex: 1,
              minWidth: 0,
              color: recipe.labelText,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              visibility: timeline.showSelectionLabel ? "visible" : "hidden",
            }}
          >
            {selectionLabel}
          </span>
          {timeline.showTimeLevel ? (
            <label
              style={{
                position: "relative",
                display: "inline-flex",
                alignItems: "center",
                color: recipe.labelText,
                fontWeight: 600,
                fontSize: 11,
              }}
            >
              <select
                value={level}
                disabled={disabled}
                aria-label={labels.timeLevel}
                data-testid={`spreadsheet-timeline-level-${timeline.id}`}
                onChange={(event) => {
                  const next = event.target.value as PivotTimelineLevel;
                  setLevel(next);
                  onChange({
                    selection: timeline.selection ?? null,
                    level: next,
                  });
                }}
                style={{
                  appearance: "none",
                  border: 0,
                  background: "transparent",
                  color: "inherit",
                  font: "inherit",
                  paddingRight: 14,
                  cursor: disabled ? "default" : "pointer",
                }}
              >
                {PIVOT_TIMELINE_LEVELS.map((candidate) => (
                  <option key={candidate} value={candidate}>
                    {labels.levels[candidate]}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={11}
                aria-hidden="true"
                style={{ position: "absolute", right: 0, pointerEvents: "none" }}
              />
            </label>
          ) : null}
        </div>
      ) : null}
      {disabledReason ? (
        <div
          role="note"
          data-testid={`spreadsheet-timeline-disabled-${timeline.id}`}
          style={{ color: recipe.labelText, fontSize: 11, lineHeight: 1.3 }}
        >
          {disabledReason}
        </div>
      ) : null}
      <div
        ref={stripRef}
        role="listbox"
        aria-label={`${timeline.caption}: ${labels.periods}`}
        aria-multiselectable="true"
        aria-disabled={disabled || undefined}
        aria-activedescendant={
          periods[focusIndex] ? `${baseId}-period-${focusIndex}` : undefined
        }
        tabIndex={disabled ? -1 : 0}
        data-testid={`spreadsheet-timeline-strip-${timeline.id}`}
        onKeyDown={onStripKeyDown}
        onPointerDown={onTilePointerDown}
        onPointerMove={onTilePointerMove}
        onPointerUp={(event) => finishDrag(event, true)}
        onPointerCancel={(event) => finishDrag(event, false)}
        style={{
          flex: 1,
          minHeight: 0,
          overflowX: timeline.showHorizontalScrollbar ? "auto" : "hidden",
          overflowY: "hidden",
          outline: "none",
          cursor: disabled ? "default" : "pointer",
          scrollbarColor: `${recipe.scrollbar} transparent`,
        }}
      >
        <div style={{ display: "flex", width: periods.length * tileWidth }}>
          {groups.map((group) => (
            <span
              key={group.key}
              style={{
                width: group.count * tileWidth,
                flexShrink: 0,
                boxSizing: "border-box",
                paddingLeft: 2,
                fontSize: 11,
                color: recipe.labelText,
                borderLeft: `1px solid ${recipe.border}`,
                whiteSpace: "nowrap",
                overflow: "hidden",
              }}
            >
              {group.label}
            </span>
          ))}
        </div>
        <div style={{ display: "flex", width: periods.length * tileWidth }}>
          {periods.map((period, index) => {
            const state = pivotTimelineTileState(period, preview);
            return (
              <div
                key={period.key}
                id={`${baseId}-period-${index}`}
                role="option"
                data-period-index={index}
                aria-selected={state !== "none"}
                data-testid={`spreadsheet-timeline-period-${timeline.id}-${period.key}`}
                data-state={state}
                title={`${period.start} - ${period.end}`}
                style={{
                  width: tileWidth,
                  flexShrink: 0,
                  boxSizing: "border-box",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 2,
                  padding: "1px 1px 0",
                  outline:
                    index === focusIndex && !disabled
                      ? `1px dotted ${recipe.headerText}`
                      : "none",
                  outlineOffset: -1,
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    color: recipe.tileText,
                    whiteSpace: "nowrap",
                  }}
                >
                  {pivotTimelineTileLabel(period, level, locale, t)}
                </span>
                <span
                  aria-hidden="true"
                  style={{
                    position: "relative",
                    alignSelf: "stretch",
                    height: 12,
                    marginInline: -1,
                    background:
                      state === "selected"
                        ? recipe.selected
                        : state === "partial"
                          ? recipe.partial
                          : recipe.tile,
                  }}
                >
                  {(["start", "end"] as const).map((end) =>
                    previewSpan &&
                    index === (end === "start" ? previewSpan.first : previewSpan.last) ? (
                      <span
                        key={end}
                        data-timeline-handle={end}
                        data-testid={`spreadsheet-timeline-handle-${timeline.id}-${end}`}
                        style={{
                          position: "absolute",
                          top: -2,
                          bottom: -2,
                          left: end === "start" ? 0 : undefined,
                          right: end === "end" ? 0 : undefined,
                          width: 5,
                          borderRadius: 1,
                          background: recipe.headerText,
                          cursor: "ew-resize",
                          // A finger on a span's end drags it; a swipe over
                          // the tiles still scrolls the strip.
                          touchAction: "none",
                        }}
                      />
                    ) : null,
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
