"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { doubleClickOnDoubleTap } from "@mrnote/core/web/lib/double-tap.ts";
import { officeDialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import type { TranslationFn } from "@mrnote/core/web/lib/errors/user-message.ts";

import { normalizeFixedWidthBreaks } from "@mrnote/core/web/lib/spreadsheet/text-to-columns.ts";

const FIXED_WIDTH_RULER_MAX_CHARACTERS = 160;

interface SpreadsheetFixedWidthBreakRulerProps {
  readonly lines: readonly string[];
  readonly breaks: readonly number[];
  readonly onChange: (breaks: readonly number[]) => void;
  readonly translate: TranslationFn;
  readonly testIdPrefix: string;
  readonly helpId?: string;
}

/**
 * Shared Spreadsheet fixed-width preview authority. Both Text Import and
 * Text-to-Columns write every pointer/keyboard gesture back to their existing
 * break-position draft; parsing and committing remain owned by each adapter.
 */
export default function SpreadsheetFixedWidthBreakRuler({
  lines,
  breaks,
  onChange,
  translate: t,
  testIdPrefix,
  helpId,
}: SpreadsheetFixedWidthBreakRulerProps) {
  const sourceLines = lines.slice(0, 8);
  const sourceLength = Math.max(
    0,
    ...sourceLines.map((line) => line.length),
  );
  const rulerLength = Math.min(
    sourceLength,
    FIXED_WIDTH_RULER_MAX_CHARACTERS,
  );
  const normalizedBreaks = normalizeFixedWidthBreaks(breaks);
  const visibleBreaks = normalizedBreaks.filter(
    (position) => position > 0 && position < rulerLength,
  );

  const updateBreaks = (next: readonly number[]) => {
    onChange(normalizeFixedWidthBreaks(next));
  };

  const focusPosition = (position: number) => {
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(
          `[data-fixed-width-ruler="${testIdPrefix}"] [data-fixed-width-break-position="${position}"]`,
        )
        ?.focus({ preventScroll: true });
    });
  };

  if (rulerLength < 2) {
    return (
      <p className={officeDialogParts.hint}>
        {t("spreadsheet.helperCopy.fixedWidth.emptyPreview")}
      </p>
    );
  }

  const breakPositions = Array.from(
    { length: rulerLength - 1 },
    (_, index) => index + 1,
  );

  return (
    <div className="grid gap-1">
      <div
        role="group"
        aria-label={
          t("spreadsheet.helperCopy.fixedWidth.ruler")
        }
        data-fixed-width-ruler={testIdPrefix}
        data-testid={`${testIdPrefix}-ruler`}
        className={`${officeDialogParts.well} overflow-x-auto`}
      >
        <div
          className="relative min-w-full font-mono text-[11px] font-normal"
          style={{ width: `${rulerLength}ch` }}
        >
          {visibleBreaks.map((position) => (
            <span
              key={`line-${position}`}
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 z-10 border-l-2 border-emerald-600"
              style={{ left: `${position}ch` }}
            />
          ))}
          <div
            className="relative z-20 grid h-8 border-b border-[color:var(--office-dialog-divider)] bg-[color:var(--office-dialog-surface-muted)]"
            style={{
              gridTemplateColumns: `repeat(${rulerLength - 1}, 1ch)`,
            }}
          >
            {breakPositions.map((position) => {
              const isBreak = normalizedBreaks.includes(position);
              const label = t(isBreak ? "spreadsheet.helperCopy.fixedWidth.existingBreak" : "spreadsheet.helperCopy.fixedWidth.addBreak", { position });
              return (
                <button
                  key={position}
                  type="button"
                  aria-label={label}
                  title={label}
                  aria-pressed={isBreak}
                  aria-describedby={helpId}
                  draggable={isBreak}
                  data-fixed-width-break-position={position}
                  onClick={(event) => {
                    // A finger's double tap removes a break as a
                    // double-click does.
                    if (isBreak) {
                      doubleClickOnDoubleTap(event);
                      return;
                    }
                    updateBreaks([...normalizedBreaks, position]);
                    focusPosition(position);
                  }}
                  onDoubleClick={(event) => {
                    if (!isBreak) return;
                    event.preventDefault();
                    updateBreaks(
                      normalizedBreaks.filter(
                        (candidate) => candidate !== position,
                      ),
                    );
                  }}
                  onDragStart={(event) => {
                    if (!isBreak) {
                      event.preventDefault();
                      return;
                    }
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", String(position));
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const draggedBreak = Number(
                      event.dataTransfer.getData("text/plain"),
                    );
                    if (!Number.isInteger(draggedBreak) || draggedBreak <= 0) {
                      return;
                    }
                    updateBreaks([
                      ...normalizedBreaks.filter(
                        (candidate) => candidate !== draggedBreak,
                      ),
                      position,
                    ]);
                    focusPosition(position);
                  }}
                  onKeyDown={(event) => {
                    if (
                      isBreak &&
                      (event.key === "Delete" || event.key === "Backspace")
                    ) {
                      event.preventDefault();
                      updateBreaks(
                        normalizedBreaks.filter(
                          (candidate) => candidate !== position,
                        ),
                      );
                      return;
                    }
                    if (
                      !isBreak ||
                      (event.key !== "ArrowLeft" &&
                        event.key !== "ArrowRight")
                    ) {
                      return;
                    }
                    event.preventDefault();
                    const nextPosition = Math.max(
                      1,
                      Math.min(
                        rulerLength - 1,
                        position + (event.key === "ArrowLeft" ? -1 : 1),
                      ),
                    );
                    if (nextPosition === position) return;
                    updateBreaks([
                      ...normalizedBreaks.filter(
                        (candidate) => candidate !== position,
                      ),
                      nextPosition,
                    ]);
                    focusPosition(nextPosition);
                  }}
                  className={`relative h-8 w-[1ch] cursor-col-resize border-0 p-0 focus:z-30 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-600 ${
                    isBreak
                      ? "bg-emerald-100 text-emerald-900"
                      : "bg-transparent text-[color:var(--office-dialog-muted)] hover:bg-[color:var(--office-dialog-surface-muted)]"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`absolute bottom-0 left-1/2 h-2 border-l ${
                      isBreak ? "border-emerald-700" : "border-[color:var(--office-dialog-control-border)]"
                    }`}
                  />
                  {position % 5 === 0 ? (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 text-[8px] leading-3"
                    >
                      {position}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <div className="relative z-0 divide-y divide-[color:var(--office-dialog-divider)]">
            {sourceLines.map((line, rowIndex) => (
              <div
                key={rowIndex}
                className="h-5 overflow-hidden whitespace-pre px-0 leading-5"
                style={{ width: `${rulerLength}ch` }}
              >
                {line.slice(0, rulerLength) || "\u00a0"}
              </div>
            ))}
          </div>
        </div>
      </div>
      {sourceLength > FIXED_WIDTH_RULER_MAX_CHARACTERS ? (
        <p className={officeDialogParts.hint}>
          {t("spreadsheet.helperCopy.fixedWidth.displayLimit", { count: FIXED_WIDTH_RULER_MAX_CHARACTERS })}
        </p>
      ) : null}
    </div>
  );
}
