"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { DropdownMenuItem } from "../../../ui/dropdown-menu";

/**
 * One square cell of a Word-style equation Symbols gallery.
 *
 * Word previews every symbol as a font-backed glyph in a uniform square cell,
 * never as artwork and never as a text row, so a cell carries only the glyph it
 * paints plus the localized command name its tooltip and accessible name use.
 */
export interface EquationSymbolGalleryCell {
  readonly id: string;
  readonly glyph: string;
  readonly label: string;
}

/**
 * One heading plus the cells under it. Microsoft's "Insert mathematical
 * symbols" describes the gallery as a set of named categories (Basic Math,
 * Greek Letters, Letter-Like Symbols, Operators, Arrows, Negated Relations,
 * Scripts, Frakturs, Double-Struck, Geometry); Word draws a heading for every
 * one of them and never an unheaded block of symbols.
 */
export interface EquationSymbolGalleryGroup {
  readonly id: string;
  readonly label: string;
  readonly cells: readonly EquationSymbolGalleryCell[];
}

/**
 * Each surface keeps its own skin. The shared primitive owns the anatomy —
 * one section per group, one heading per section, one grid of equal cells, and
 * an optional full-width command row — so no surface can grow a second,
 * differently-shaped symbol palette.
 */
export interface EquationSymbolGalleryClassNames {
  readonly root?: string;
  readonly group?: string;
  readonly heading?: string;
  readonly grid?: string;
  readonly cell?: string;
  readonly glyph?: string;
  readonly footer?: string;
}

export interface DocumentEquationSymbolGalleryProps {
  groups: readonly EquationSymbolGalleryGroup[];
  /** Runs the surface's own insertion command for one cell. */
  onSelectCell: (
    cell: EquationSymbolGalleryCell,
    group: EquationSymbolGalleryGroup,
  ) => void;
  disabled?: boolean;
  galleryTestId: string;
  groupTestId: (groupId: string) => string;
  cellTestId: (cellId: string) => string;
  /** Stable id wiring each heading to its section's `aria-labelledby`. */
  headingId: (groupId: string) => string;
  classNames?: EquationSymbolGalleryClassNames;
  /**
   * Merged into every cell's inner button. The contextual Formula ribbon uses
   * it to keep MathLive's focus ownership while the Radix portal is open, so
   * the shape has to admit that surface's `data-` marker as well.
   */
  cellButtonProps?: ButtonHTMLAttributes<HTMLButtonElement> & {
    readonly [dataAttribute: `data-${string}`]: unknown;
  };
  /**
   * Word's gallery tail ("More symbols…"): a full-width command row below the
   * cells, never a grid cell — a cell squeezes the label into one column and
   * wraps it onto several lines beside its icon.
   */
  footer?: ReactNode;
}

/**
 * The grouped symbol gallery shared by Docs' Insert ▸ Equation ▸ Symbols panel
 * and the contextual Formula ribbon's full palette. Keyboard order follows the
 * visual order (group by group, left to right), because the cells are rendered
 * in document order and the footer command is the last focusable row.
 */
export function DocumentEquationSymbolGallery({
  groups,
  onSelectCell,
  disabled = false,
  galleryTestId,
  groupTestId,
  cellTestId,
  headingId,
  classNames,
  cellButtonProps,
  footer,
}: DocumentEquationSymbolGalleryProps) {
  return (
    <>
      <div className={classNames?.root} data-testid={galleryTestId}>
        {groups.map((group) => {
          const groupHeadingId = headingId(group.id);
          return (
            <section
              key={group.id}
              className={classNames?.group}
              role="group"
              aria-labelledby={groupHeadingId}
              data-testid={groupTestId(group.id)}
            >
              <div id={groupHeadingId} className={classNames?.heading}>
                {group.label}
              </div>
              <div className={classNames?.grid}>
                {group.cells.map((cell) => (
                  <DropdownMenuItem
                    asChild
                    key={cell.id}
                    disabled={disabled}
                    aria-label={cell.label}
                    className={classNames?.cell}
                    data-testid={cellTestId(cell.id)}
                    onSelect={() => onSelectCell(cell, group)}
                  >
                    <button
                      {...cellButtonProps}
                      type="button"
                      disabled={disabled}
                      title={cell.label}
                    >
                      <span className={classNames?.glyph} aria-hidden>
                        {cell.glyph}
                      </span>
                    </button>
                  </DropdownMenuItem>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      {footer ? <div className={classNames?.footer}>{footer}</div> : null}
    </>
  );
}
