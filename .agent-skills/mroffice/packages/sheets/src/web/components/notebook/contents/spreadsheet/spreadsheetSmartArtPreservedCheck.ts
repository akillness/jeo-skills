"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { spreadsheetPreservedSmartArtPicturesUnreachable } from "../../../../lib/spreadsheet/native-smartart";
import { smartArtRefusalMessage } from "@mrnote/core/web/lib/office-smartart/convert-refusal-message.ts";
import { type OfficeSmartArtDesignTabPreserved } from "@mrnote/core/web/components/office-ribbon/OfficeSmartArtDesignTab.tsx";
import { nativeSmartArtTextBlockerLabel, nativeSmartArtTextBlocker } from "@mrnote/core/web/lib/office-smartart/native-text-blocker.ts";
import { type SpreadsheetObject } from "./spreadsheetSheetModel";
import { type SpreadsheetNativeSmartArt } from "../../../../lib/spreadsheet/native-smartart-model";

/** What spreadsheetSmartArtPreservedCheck reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetSmartArtPreservedCheckInputs {
  convertSelectedNativeSmartArt: (layoutId: string) => Promise<void>;
  pageId: string;
  selectedNativeSmartArtDiagram: SpreadsheetNativeSmartArt | null;
  selectedNativeSmartArtObject: SpreadsheetObject | null;
  smartArtDesignWritable: boolean;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function spreadsheetSmartArtPreservedCheck({
  convertSelectedNativeSmartArt,
  pageId,
  selectedNativeSmartArtDiagram,
  selectedNativeSmartArtObject,
  smartArtDesignWritable,
  t,
}: SpreadsheetSmartArtPreservedCheckInputs) {
  const spreadsheetSmartArtPreserved: OfficeSmartArtDesignTabPreserved | null =
    selectedNativeSmartArtObject
      ? {
          // A preserved diagram MRAI does not own offers exactly
          // one authoring act: becoming MRAI's own. Its text is
          // still edited in place, on the diagram itself.
          convertible: true,
          nativeEditing: false,
          // A diagram Office saved with empty placeholders has
          // no text in the file: Edit Text says that instead of
          // leaving the author double-clicking a dead box.
          textBlockedReason: nativeSmartArtTextBlockerLabel(
            nativeSmartArtTextBlocker({
              textEditable:
                selectedNativeSmartArtDiagram?.textEditable ===
                true,
              texts:
                selectedNativeSmartArtDiagram?.members.map(
                  (member) => member.text,
                ) ?? [],
            }),
            {
              placeholderTextOnly: t(
                "document.capability.smartArtPlaceholderTextOnly",
              ),
              notAttributable: t(
                "document.capability.editableSmartArtUnavailable",
              ),
            },
          ),
          writable: smartArtDesignWritable,
          // A pictured diagram read where its saved workbook is
          // not reachable can never convert: the Picture layouts
          // are greyed with the reason instead of being offered
          // as a command that must fail.
          pictureConversionBlockedReason: (() => {
            const blocked =
              spreadsheetPreservedSmartArtPicturesUnreachable(
                selectedNativeSmartArtObject as unknown as Record<
                  string,
                  unknown
                >,
                pageId,
              );
            return blocked
              ? t(
                  smartArtRefusalMessage(blocked)
                    .key as "toolbar.smartartContext.convertRefused.unavailable",
                  smartArtRefusalMessage(blocked).values,
                )
              : null;
          })(),
          textPaneOpen: false,
          canAdd: false,
          canPromote: false,
          canDemote: false,
          onConvert: (kind) => {
            void convertSelectedNativeSmartArt(kind);
          },
          onToggleTextPane: () => undefined,
          onAddShape: () => undefined,
          onPromote: () => undefined,
          onDemote: () => undefined,
        }
      : null;
  return {
    spreadsheetSmartArtPreserved,
  };
}
