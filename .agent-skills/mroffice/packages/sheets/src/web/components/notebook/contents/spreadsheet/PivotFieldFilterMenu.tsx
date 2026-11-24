/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useLayoutEffect, useRef, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";

import PivotFieldConditionForm, {
  type PivotFieldConditionDraft,
  type PivotFieldConditionFamily,
} from "./PivotFieldConditionForm";
import type { PivotFieldFilter } from "@mrnote/core/web/lib/spreadsheet/pivot-field-filters.ts";

/** A row or column field's Label / Date / Value filters in its dropdown. */
export interface PivotFieldFilterMenuConditions {
  fieldCaption: string;
  /** Excel shows Date Filters for a field of dates, Label Filters else. */
  dateField: boolean;
  label: PivotFieldFilter | undefined;
  value: PivotFieldFilter | undefined;
  /** The report's value fields, by caption (a Value filter judges by one). */
  valueFields: readonly string[];
  /** Hidden items or a field filter: Clear Filter From is offered. */
  active: boolean;
  /** The field's sort by a value field (Sort Largest to Smallest). */
  valueSort?: { order: "ascending" | "descending"; valueIndex: number };
  onSortByValue: (order: "ascending" | "descending" | undefined, valueIndex: number) => void;
  onChange: (next: PivotFieldConditionDraft | null, family: "label" | "value") => void;
  onClearAll: () => void;
  t: (key: string, values?: Record<string, string | number>) => string;
}

export interface PivotFieldFilterMenuProps {
  /** A report filter lists items only; a row or column field sorts too. */
  kind: "page" | "axis";
  items: readonly string[];
  /** The items shown; [] = every item. */
  selected: readonly string[];
  /** Select All was cleared and nothing is picked yet (every box unchecked
   * while the report keeps its last selection, live audit B134). */
  none?: boolean;
  sortOrder?: "ascending" | "descending";
  left: number;
  top: number;
  testId: string;
  portalTarget: Element;
  labels: {
    sortAscending: string;
    sortDescending: string;
    selectAll: string;
    close: string;
  };
  itemCaption: (item: string) => string;
  onNoneChange: (none: boolean) => void;
  onApply: (shown: string[]) => void;
  onSort: (order: "ascending" | "descending" | undefined) => void;
  onClose: () => void;
  conditions?: PivotFieldFilterMenuConditions;
}

/**
 * Excel's field dropdown on a PivotTable header or a PivotChart field
 * button: the two sort rows (row and column fields), Select All and the
 * item check list, Close. Rendered on the portal target: the menu is fixed to
 * the viewport, and a transformed ancestor (the window frame, the dev gallery
 * host) would otherwise become its containing block.
 */
export default function PivotFieldFilterMenu({
  kind,
  items,
  selected,
  none = false,
  sortOrder,
  left,
  top,
  testId,
  portalTarget,
  labels,
  itemCaption,
  onNoneChange,
  onApply,
  onSort,
  onClose,
  conditions,
}: PivotFieldFilterMenuProps): ReactElement {
  const isShown = (item: string) => selected.length === 0 || selected.includes(item);
  const [editing, setEditing] = useState<PivotFieldConditionFamily | null>(null);
  const labelFamily: PivotFieldConditionFamily = conditions?.dateField ? "date" : "label";
  const [sortValueIndex, setSortValueIndex] = useState(conditions?.valueSort?.valueIndex ?? 0);
  // The menu stays on screen: it grows when a condition form opens in it (a
  // Value Filter's field, operator and value rows), and from a header low in
  // the window its OK and Cancel ran past the bottom (S-127). It moves up as
  // far as it must and, taller than the window, scrolls inside it.
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [fit, setFit] = useState<{ top: number; maxHeight: number } | null>(null);
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu || typeof window === "undefined") return;
    const place = () => {
      const margin = 8;
      const room = Math.max(160, window.innerHeight - margin * 2);
      const height = Math.min(menu.scrollHeight, room);
      const placedTop = Math.max(margin, Math.min(top, window.innerHeight - margin - height));
      setFit((current) =>
        current && current.top === placedTop && current.maxHeight === room ? current : { top: placedTop, maxHeight: room },
      );
    };
    place();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place);
    observer?.observe(menu);
    for (const child of Array.from(menu.children)) observer?.observe(child);
    window.addEventListener("resize", place);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [top, editing]);
  return createPortal(
    <div
      ref={menuRef}
      className="docs-cupertino-menu spreadsheet-window__pivot-field-menu"
      data-office-menu-enter=""
      data-testid={testId}
      role="menu"
      style={{ left, top: fit?.top ?? top, maxHeight: fit?.maxHeight, overflowY: "auto" }}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      {kind === "axis" ? (
        <div className="spreadsheet-window__pivot-field-menu-sorts">
          <button
            type="button"
            role="menuitem"
            aria-pressed={sortOrder === "ascending"}
            onClick={() => onSort(sortOrder === "ascending" ? undefined : "ascending")}
          >
            {labels.sortAscending}
          </button>
          <button
            type="button"
            role="menuitem"
            aria-pressed={sortOrder === "descending"}
            onClick={() => onSort(sortOrder === "descending" ? undefined : "descending")}
          >
            {labels.sortDescending}
          </button>
        </div>
      ) : null}
      {kind === "axis" && conditions && conditions.valueFields.length > 0 ? (
        // Sort by a value field (Excel's Sort Largest to Smallest on a value,
        // More Sort Options' "by" field).
        <div className="spreadsheet-window__pivot-field-menu-sorts" data-testid={`${testId}-value-sorts`}>
          {conditions.valueFields.length > 1 ? (
            <select
              value={String(sortValueIndex)}
              aria-label={conditions.t("spreadsheet.pivotFilterValueField")}
              data-testid={`${testId}-value-sort-field`}
              onChange={(event) => setSortValueIndex(Number(event.target.value))}
            >
              {conditions.valueFields.map((caption, index) => (
                <option key={index} value={String(index)}>
                  {caption}
                </option>
              ))}
            </select>
          ) : null}
          {(["descending", "ascending"] as const).map((order) => {
            const on =
              conditions.valueSort?.order === order && conditions.valueSort.valueIndex === sortValueIndex;
            return (
              <button
                key={order}
                type="button"
                role="menuitemcheckbox"
                aria-checked={on}
                data-testid={`${testId}-value-sort-${order}`}
                onClick={() => conditions.onSortByValue(on ? undefined : order, sortValueIndex)}
              >
                {conditions.t(order === "descending" ? "spreadsheet.filterSortNumberDesc" : "spreadsheet.filterSortNumberAsc")}
              </button>
            );
          })}
        </div>
      ) : null}
      {kind === "axis" && conditions ? (
        <div className="spreadsheet-window__pivot-field-menu-sorts" data-testid={`${testId}-conditions`}>
          {conditions.active ? (
            <button
              type="button"
              role="menuitem"
              data-testid={`${testId}-clear-filter`}
              onClick={() => {
                setEditing(null);
                conditions.onClearAll();
              }}
            >
              {conditions.t("spreadsheet.filterClearFromColumn", { column: conditions.fieldCaption })}
            </button>
          ) : null}
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={conditions.label !== undefined}
            data-testid={`${testId}-label-filters`}
            onClick={() => setEditing((current) => (current === labelFamily ? null : labelFamily))}
          >
            {conditions.dateField
              ? conditions.t("spreadsheet.filterDateFilters")
              : conditions.t("spreadsheet.pivotLabelFilters")}
          </button>
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={conditions.value !== undefined}
            disabled={conditions.valueFields.length === 0}
            data-testid={`${testId}-value-filters`}
            onClick={() => setEditing((current) => (current === "value" ? null : "value"))}
          >
            {conditions.t("spreadsheet.pivotValueFilters")}
          </button>
        </div>
      ) : null}
      {kind === "axis" && conditions && editing ? (
        <PivotFieldConditionForm
          key={editing}
          family={editing}
          fieldCaption={conditions.fieldCaption}
          current={editing === "value" ? conditions.value : conditions.label}
          valueFields={conditions.valueFields}
          testId={`${testId}-condition`}
          t={conditions.t}
          onApply={(draft) => {
            conditions.onChange(draft, editing === "value" ? "value" : "label");
            setEditing(null);
          }}
          onClear={() => {
            conditions.onChange(null, editing === "value" ? "value" : "label");
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      ) : null}
      <label className="spreadsheet-window__pivot-field-menu-item">
        <input
          type="checkbox"
          checked={!none && items.every(isShown)}
          onChange={(event) => {
            if (event.target.checked) {
              onNoneChange(false);
              onApply([]);
            } else {
              // Nothing is picked yet: Excel leaves the list empty until an
              // item is ticked.
              onNoneChange(true);
            }
          }}
        />
        {labels.selectAll}
      </label>
      <div className="spreadsheet-window__pivot-field-menu-items">
        {items.map((item) => (
          <label key={item} className="spreadsheet-window__pivot-field-menu-item">
            <input
              type="checkbox"
              checked={!none && isShown(item)}
              onChange={(event) => {
                const shownNow = none ? [] : items.filter(isShown);
                const next = event.target.checked
                  ? [...shownNow, item]
                  : shownNow.filter((entry) => entry !== item);
                if (next.length === 0) {
                  onNoneChange(true);
                  return;
                }
                if (none) onNoneChange(false);
                onApply(next);
              }}
            />
            {itemCaption(item)}
          </label>
        ))}
      </div>
      <button
        type="button"
        className="spreadsheet-window__pivot-field-menu-close"
        onClick={onClose}
      >
        {labels.close}
      </button>
    </div>,
    portalTarget,
  );
}
