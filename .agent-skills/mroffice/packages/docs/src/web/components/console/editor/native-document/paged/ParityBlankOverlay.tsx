/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { CSSProperties } from "react";

export interface ParityBlankSheetBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface ParityBlankOverlayBox extends ParityBlankSheetBox {
  beforeSheetIndex: number;
  physicalPageNumber: number;
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * Resolve the real paper boxes that live in parity gaps between editable
 * sheets. The following sheet owns the gap (the same convention used by
 * `computePhysicalPageStarts`), and its geometry owns the filler paper.
 *
 * The surrounding gutters are derived from measured sheet positions rather
 * than duplicated from CSS. This keeps the overlay exact if the editor's
 * paper gap or a section's page size changes.
 */
export function computeParityBlankOverlayBoxes(
  sheets: ReadonlyArray<ParityBlankSheetBox>,
  gapsBefore: ReadonlyArray<number>,
  physicalStarts: ReadonlyArray<number>,
): ParityBlankOverlayBox[] {
  const blanks: ParityBlankOverlayBox[] = [];
  for (let sheetIndex = 1; sheetIndex < sheets.length; sheetIndex += 1) {
    const current = sheets[sheetIndex];
    const previous = sheets[sheetIndex - 1];
    const gapCount = Math.max(0, Math.floor(gapsBefore[sheetIndex] ?? 0));
    if (!current || !previous || gapCount === 0) continue;

    const height = finiteNonNegative(current.height);
    const previousBottom =
      finiteNonNegative(previous.top) + finiteNonNegative(previous.height);
    const openSpace = Math.max(
      0,
      finiteNonNegative(current.top) - previousBottom,
    );
    const gutter = Math.max(
      0,
      (openSpace - gapCount * height) / (gapCount + 1),
    );
    const firstPhysicalPage = Math.max(
      1,
      Math.floor(physicalStarts[sheetIndex] ?? 1) - gapCount,
    );

    for (let offset = 0; offset < gapCount; offset += 1) {
      blanks.push({
        beforeSheetIndex: sheetIndex,
        physicalPageNumber: firstPhysicalPage + offset,
        top: previousBottom + gutter + offset * (height + gutter),
        left: finiteNonNegative(current.left),
        width: finiteNonNegative(current.width),
        height,
      });
    }
  }
  return blanks;
}

export interface ParityBlankOverlayProps {
  sheets: ReadonlyArray<ParityBlankSheetBox>;
  gapsBefore: ReadonlyArray<number>;
  physicalStarts: ReadonlyArray<number>;
}

/** A completely blank, non-editable Word/WPS odd/even-section filler page. */
export default function ParityBlankOverlay({
  sheets,
  gapsBefore,
  physicalStarts,
}: ParityBlankOverlayProps) {
  const blanks = computeParityBlankOverlayBoxes(
    sheets,
    gapsBefore,
    physicalStarts,
  );
  if (blanks.length === 0) return null;

  return (
    <div
      className="sheet-parity-blank-overlay"
      data-testid="sheet-parity-blank-overlay"
      contentEditable={false}
      aria-hidden
    >
      {blanks.map((blank) => (
        <div
          key={`${blank.beforeSheetIndex}:${blank.physicalPageNumber}`}
          className="note-editor-parity-blank-sheet"
          data-testid="note-editor-parity-blank-sheet"
          data-page-parity-blank="true"
          data-physical-page-number={blank.physicalPageNumber}
          style={
            {
              top: blank.top,
              left: blank.left,
              width: blank.width,
              height: blank.height,
            } satisfies CSSProperties
          }
        />
      ))}
    </div>
  );
}
