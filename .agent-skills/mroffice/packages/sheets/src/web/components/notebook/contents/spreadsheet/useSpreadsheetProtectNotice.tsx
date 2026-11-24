"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { nativeOfficeOwnsFocus } from "@mrnote/core/web/lib/native-office-focus.ts";
import { useEffect, useCallback, type RefObject } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { matchSpreadsheetKeybinding } from "../../../../lib/spreadsheet/command-registry";
import { type SpreadsheetCommandRegistry } from "../../../../lib/spreadsheet/command-registry";
import { type Dispatch, type SetStateAction } from "react";

/** What useSpreadsheetProtectNotice reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetProtectNoticeInputs {
  commandRegistryRef: RefObject<SpreadsheetCommandRegistry>;
  protectNoticeTimerRef: RefObject<number | null>;
  rootRef: RefObject<HTMLDivElement | null>;
  saveNow: () => void;
  setProtectNotice: Dispatch<SetStateAction<string | null>>;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function useSpreadsheetProtectNotice({
  commandRegistryRef,
  protectNoticeTimerRef,
  rootRef,
  saveNow,
  setProtectNotice,
  t,
}: SpreadsheetProtectNoticeInputs) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() !== "s") return;
      const root = rootRef.current;
      const active = document.activeElement;
      if (!nativeOfficeOwnsFocus(root, active)) return;
      event.preventDefault();
      event.stopPropagation();
      saveNow();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [saveNow]);

  // Undo and Redo keep working after a ribbon click. Excel hands focus back
  // to the grid after a command; here a ribbon button, checkbox or sheet tab
  // keeps it, and the grid's own keydown never sees the key. Text fields
  // (Name Box, formula bar, font size) keep their native text undo.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      if (!(event.metaKey || event.ctrlKey)) return;
      const active = document.activeElement;
      if (!nativeOfficeOwnsFocus(rootRef.current, active)) return;
      if (
        active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLInputElement &&
          !["button", "checkbox", "radio", "range", "color", "file", "submit", "reset"].includes(active.type)) ||
        (active instanceof HTMLElement &&
          (active.isContentEditable || active.closest("[role='textbox'], [role='combobox']")))
      ) {
        return;
      }
      const binding = matchSpreadsheetKeybinding(event, "chrome", undefined, {
        cellEditing: false,
      });
      if (binding?.command !== "undo" && binding?.command !== "redo") return;
      // A modal dialog shuts the sheet out (B455): from its list or its
      // buttons the keys are not the worksheet's history. They are not the
      // browser's either, whose own undo would take a typed character back
      // out of the cell edited last.
      if (active?.closest("[aria-modal='true'], [role='alertdialog']")) {
        event.preventDefault();
        return;
      }
      if (!commandRegistryRef.current.dispatch(binding.command, event)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // F7 is Spelling wherever the focus is in the window (a ribbon button, the
  // formula bar, a sheet tab), as in Excel; the grid's own keydown has
  // already taken it from a cell. Inside a dialog the key is the dialog's.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.key !== "F7") return;
      const active = document.activeElement;
      if (!nativeOfficeOwnsFocus(rootRef.current, active)) return;
      if (active?.closest("[role='dialog'], [role='alertdialog']")) return;
      const binding = matchSpreadsheetKeybinding(event, "chrome", undefined, {
        cellEditing: false,
      });
      if (binding?.command !== "checkSpelling") return;
      if (!commandRegistryRef.current.dispatch(binding.command, event)) return;
      event.preventDefault();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Sheet protection (Excel/WPS parity): show one transient, non-blocking
  // reason for refused edits. Defined before the central sheet writer so object
  // mutations can use the same feedback as protected cell commands.
  const showProtectNotice = useCallback(
    (message?: string) => {
      if (protectNoticeTimerRef.current !== null) {
        window.clearTimeout(protectNoticeTimerRef.current);
      }
      setProtectNotice(message ?? t("spreadsheet.protectionBlocked"));
      protectNoticeTimerRef.current = window.setTimeout(() => {
        setProtectNotice(null);
        protectNoticeTimerRef.current = null;
      }, 2400);
    },
    [t],
  );
  return {
    showProtectNotice,
  };
}
