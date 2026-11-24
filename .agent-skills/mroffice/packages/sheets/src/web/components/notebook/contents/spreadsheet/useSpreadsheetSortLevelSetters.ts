"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useCallback, type RefObject } from "react";
import { type SpreadsheetSortDialogLevel } from "./SpreadsheetSortDialog";
import { parseSortDialogLine, parseSortDialogOrder } from "./spreadsheetDialogDrafts";
import { type Dispatch, type SetStateAction } from "react";
import { type SpreadsheetSortDialogFormatOption } from "./SpreadsheetSortDialog";

/** What useSpreadsheetSortLevelSetters reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetSortLevelSettersInputs {
  rejectSortDialogGrammar: () => void;
  setSortDialogLevels: Dispatch<SetStateAction<SpreadsheetSortDialogLevel[]>>;
  setSortDialogStatus: Dispatch<SetStateAction<{ kind: "success" | "error"; text: string; } | null>>;
  sortDialogCustomLists: (readonly string[])[];
  sortDialogFormatOptions: SpreadsheetSortDialogFormatOption[][];
  sortDialogFormatOptionsForLine: (line: number) => SpreadsheetSortDialogFormatOption[];
  sortDialogGrammarInvalidRef: RefObject<boolean>;
  sortDialogKeyLines: number[];
  sortDialogLevels: SpreadsheetSortDialogLevel[];
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function useSpreadsheetSortLevelSetters({
  rejectSortDialogGrammar,
  setSortDialogLevels,
  setSortDialogStatus,
  sortDialogCustomLists,
  sortDialogFormatOptions,
  sortDialogFormatOptionsForLine,
  sortDialogGrammarInvalidRef,
  sortDialogKeyLines,
  sortDialogLevels,
}: SpreadsheetSortLevelSettersInputs) {
  const setSortLevelColumn = useCallback(
    (index: number, encoded: string) => {
      const column = parseSortDialogLine(encoded, sortDialogKeyLines);
      if (
        column === null ||
        !Number.isInteger(index) ||
        index < 0 ||
        index >= sortDialogLevels.length
      ) {
        rejectSortDialogGrammar();
        return;
      }
      sortDialogGrammarInvalidRef.current = false;
      setSortDialogLevels((prev) =>
        prev.map((lvl, i) => {
          if (i !== index) return lvl;
          const sortOn = lvl.sortOn ?? "values";
          if (sortOn === "values") return { ...lvl, column };
          const options = sortDialogFormatOptionsForLine(column).filter(
            (option) => option.kind === sortOn,
          );
          const nextFormat =
            options.find((option) => option.key === lvl.formatKey) ?? options[0];
          return nextFormat
            ? { ...lvl, column, formatKey: nextFormat.key }
            : {
                id: lvl.id,
                column,
                direction: "asc",
                sortOn: "values",
              };
        }),
      );
      setSortDialogStatus(null);
    },
    [
      rejectSortDialogGrammar,
      sortDialogFormatOptionsForLine,
      sortDialogKeyLines,
      sortDialogLevels.length,
    ],
  );

  const setSortLevelSortOn = useCallback(
    (index: number, encoded: string) => {
      if (
        !["values", "cellColor", "fontColor", "icon"].includes(encoded) ||
        !Number.isInteger(index) ||
        index < 0 ||
        index >= sortDialogLevels.length
      ) {
        rejectSortDialogGrammar();
        return;
      }
      const sortOn = encoded as
        | "values"
        | "cellColor"
        | "fontColor"
        | "icon";
      if (
        sortOn !== "values" &&
        !sortDialogFormatOptions[index]?.some(
          (option) => option.kind === sortOn,
        )
      ) {
        rejectSortDialogGrammar();
        return;
      }
      sortDialogGrammarInvalidRef.current = false;
      setSortDialogLevels((prev) =>
        prev.map((lvl, i) => {
          if (i !== index) return lvl;
          if (sortOn === "values") {
            return {
              id: lvl.id,
              column: lvl.column,
              direction:
                (lvl.sortOn ?? "values") === "values"
                  ? lvl.direction
                  : "asc",
              sortOn,
              ...((lvl.sortOn ?? "values") === "values" &&
              lvl.customListIndex !== undefined
                ? { customListIndex: lvl.customListIndex }
                : {}),
            };
          }
          const options = sortDialogFormatOptions[index] ?? [];
          const selected =
            options.find(
              (option) =>
                option.kind === sortOn && option.key === lvl.formatKey,
            ) ?? options.find((option) => option.kind === sortOn);
          return {
            id: lvl.id,
            column: lvl.column,
            direction: "asc",
            sortOn,
            formatKey: selected?.key,
            placement: lvl.placement ?? "first",
          };
        }),
      );
      setSortDialogStatus(null);
    },
    [
      rejectSortDialogGrammar,
      sortDialogFormatOptions,
      sortDialogLevels.length,
    ],
  );

  // Set a level's ORDER from the Order dropdown (Excel "Order ▸ A→Z / Z→A /
  // Custom List"). The encoded value is "asc", "desc", or "custom:<index>". A→Z /
  // Z→A clear any custom list and set the direction; a custom-list choice sets the
  // index and keeps ascending (its own sequence is the order).
  const setSortLevelOrder = useCallback(
    (index: number, encoded: string) => {
      const order = parseSortDialogOrder(encoded, sortDialogCustomLists);
      if (
        order === null ||
        !Number.isInteger(index) ||
        index < 0 ||
        index >= sortDialogLevels.length
      ) {
        rejectSortDialogGrammar();
        return;
      }
      sortDialogGrammarInvalidRef.current = false;
      setSortDialogLevels((prev) =>
        prev.map((lvl, i) =>
          i === index
            ? {
                id: lvl.id,
                column: lvl.column,
                sortOn: "values",
                ...order,
              }
            : lvl,
        ),
      );
      setSortDialogStatus(null);
    },
    [rejectSortDialogGrammar, sortDialogCustomLists, sortDialogLevels.length],
  );

  const setSortLevelFormat = useCallback(
    (index: number, encoded: string) => {
      const level = sortDialogLevels[index];
      const sortOn = level?.sortOn ?? "values";
      const option =
        sortOn === "values" || encoded.length > 128
          ? undefined
          : sortDialogFormatOptions[index]?.find(
              (candidate) =>
                candidate.kind === sortOn && candidate.key === encoded,
            );
      if (!level || !option) {
        rejectSortDialogGrammar();
        return;
      }
      sortDialogGrammarInvalidRef.current = false;
      setSortDialogLevels((prev) =>
        prev.map((candidate, i) =>
          i === index ? { ...candidate, formatKey: option.key } : candidate,
        ),
      );
      setSortDialogStatus(null);
    },
    [rejectSortDialogGrammar, sortDialogFormatOptions, sortDialogLevels],
  );

  const setSortLevelPlacement = useCallback(
    (index: number, encoded: string) => {
      if (
        (encoded !== "first" && encoded !== "last") ||
        !Number.isInteger(index) ||
        index < 0 ||
        index >= sortDialogLevels.length ||
        (sortDialogLevels[index]?.sortOn ?? "values") === "values"
      ) {
        rejectSortDialogGrammar();
        return;
      }
      sortDialogGrammarInvalidRef.current = false;
      setSortDialogLevels((prev) =>
        prev.map((level, i) =>
          i === index ? { ...level, placement: encoded } : level,
        ),
      );
      setSortDialogStatus(null);
    },
    [rejectSortDialogGrammar, sortDialogLevels],
  );
  return {
    setSortLevelColumn,
    setSortLevelFormat,
    setSortLevelOrder,
    setSortLevelPlacement,
    setSortLevelSortOn,
  };
}
