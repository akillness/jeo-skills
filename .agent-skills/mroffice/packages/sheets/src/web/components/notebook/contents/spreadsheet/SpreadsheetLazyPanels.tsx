"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Panels a workbook shows only when asked for, loaded then (their code is no
 * part of opening a sheet): the Immersive Reader, the Copilot panels, the
 * chart Font dialog and the chart Format ribbon. They brought the rich-text
 * editor (tiptap), Markdown and KaTeX into every spreadsheet's open: 168
 * modules, 2.7 MB of source, evaluated before the grid took input.
 *
 * Each loads on first use and is warmed once the workbook has been idle a
 * while (so the first press rarely waits). A panel whose code cannot be
 * fetched shows a retry in its place (SpreadsheetLazyDialogs), never a blank.
 */

import { useEffect, type ComponentProps } from "react";
import type { CopilotPartsPanel as CopilotPartsPanelType } from "@mrnote/core/web/__cut__/m795d7b4de9.tsx";
import type { EditorCopilotSurfaceProps } from "@mrnote/core/web/__cut__/m4c7b57549b.tsx";
import type { DocumentChartFormatRibbonProps } from "@mrnote/core/web/components/console/editor/native-document/DocumentChartFormatRibbon.tsx";
import type { DocumentImmersiveReaderProps } from "@mrnote/docs/web/components/console/editor/native-document/DocumentImmersiveReader.tsx";
import type SpreadsheetSelectionCopilotType from "@mrnote/core/web/__cut__/m4f1373b01f.tsx";
import type { OfficeChartFontDialogProps } from "@mrnote/core/web/components/office-ribbon/OfficeChartFontDialog.tsx";
import { createSpreadsheetLazyPanel } from "./SpreadsheetLazyDialogs";

const reader = createSpreadsheetLazyPanel<DocumentImmersiveReaderProps>(
  () => import("@mrnote/docs/web/components/console/editor/native-document/DocumentImmersiveReader.tsx").then((module) => ({ default: module.DocumentImmersiveReader })),
  (props) => props.onOpenChange(false),
);
const editorCopilot = createSpreadsheetLazyPanel<EditorCopilotSurfaceProps>(
  () => import("@mrnote/core/web/__cut__/m4c7b57549b.tsx"),
  (props) => props.onClose?.(),
);
type SelectionCopilotProps = ComponentProps<typeof SpreadsheetSelectionCopilotType>;
const selectionCopilot = createSpreadsheetLazyPanel<SelectionCopilotProps>(
  () => import("@mrnote/core/web/__cut__/m4f1373b01f.tsx"),
  (props) => props.onClose(),
);
type PartsPanelProps = ComponentProps<typeof CopilotPartsPanelType>;
const partsPanel = createSpreadsheetLazyPanel<PartsPanelProps>(
  () => import("@mrnote/core/web/__cut__/m795d7b4de9.tsx").then((module) => ({ default: module.CopilotPartsPanel })),
  (props) => props.onClose?.(),
);
const chartFont = createSpreadsheetLazyPanel<OfficeChartFontDialogProps>(
  () => import("@mrnote/core/web/components/office-ribbon/OfficeChartFontDialog.tsx").then((module) => ({ default: module.OfficeChartFontDialog })),
  (props) => props.onCancel(),
);

export const SpreadsheetImmersiveReader = reader.Component;
export const SpreadsheetEditorCopilotSurface = editorCopilot.Component;
export const SpreadsheetSelectionCopilotPanel = selectionCopilot.Component;
export const SpreadsheetCopilotPartsPanel = partsPanel.Component;
export const SpreadsheetChartFontDialog = chartFont.Component;

const PANELS = [chartFont, selectionCopilot, partsPanel, editorCopilot, reader];

/** Calls `task` once the page has settled: past `afterMs`, three idle
 * periods in a row (requestIdleCallback) each with most of a frame to spare,
 * a second apart -- not while a workbook is still laying out, measuring
 * fonts or painting rows. Without idle callbacks, `afterMs` alone. */
function whenSettled(task: () => void, afterMs = 5_000): () => void {
  if (typeof window === "undefined") return () => undefined;
  let quiet = 0;
  let idle: number | null = null;
  let timer: number | null = null;
  const check = () => {
    timer = null;
    if (typeof window.requestIdleCallback !== "function") {
      task();
      return;
    }
    idle = window.requestIdleCallback((deadline) => {
      idle = null;
      quiet = deadline.timeRemaining() >= 40 && !deadline.didTimeout ? quiet + 1 : 0;
      if (quiet >= 3) task();
      else timer = window.setTimeout(check, 1_000);
    }, { timeout: 10_000 });
  };
  timer = window.setTimeout(check, afterMs);
  return () => {
    if (timer !== null) window.clearTimeout(timer);
    if (idle !== null) window.cancelIdleCallback?.(idle);
  };
}

/** Warm every panel once the workbook has settled: fetching them while it
 * still lays out would put their modules (and their stylesheets) in the
 * middle of its open. */
export function useWarmSpreadsheetLazyPanels(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    return whenSettled(() => {
      for (const panel of PANELS) panel.preload();
    });
  }, [enabled]);
}
