"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { type ReactNode } from "react";
import { OfficeDialogChromeProvider } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { OfficeTaskPaneChromeProvider } from "@mrnote/core/web/components/office-ribbon/OfficeTaskPane.tsx";
import {
  OfficeTaskPaneLayoutContext,
  type OfficeTaskPaneLayoutControls,
} from "@mrnote/core/web/components/office-ribbon/officeTaskPaneLayout.tsx";
import { shadowFilterCss } from "@mrnote/core/web/lib/spreadsheet/shape-effects.ts";
import { OfficeColorNamesProvider, type OfficeColorNames } from "@mrnote/core/web/components/office-ribbon/OfficeColorPalettePanel.tsx";
import { spreadsheetThemeShapeVisual, type SpreadsheetWorkbookThemeSelection } from "@mrnote/core/web/lib/spreadsheet/workbook-theme.ts";

function SpreadsheetThemeEffectPreview({
  theme,
}: {
  theme: SpreadsheetWorkbookThemeSelection;
}) {
  const visual = spreadsheetThemeShapeVisual(theme);
  const shadow = visual.shadow;
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: 74,
        height: 22,
        borderRadius: 4,
        border: `${visual.strokeWidth}px solid ${visual.stroke}`,
        background: visual.fill,
        filter: shadowFilterCss(shadow),
      }}
    />
  );
}

// Build content and repeated rows in child render frames, outside the large
// Window hook frame. These outer callbacks always read the current render.
// Individual rows use the explicit visual epoch and committed event bridge.
export function SpreadsheetWindowContent({
  render,
  colorNames,
  taskPaneLayout = null,
}: {
  render: () => ReactNode;
  colorNames: OfficeColorNames;
  /** The task panes' Move / Size / width controls (Office's pane layout). */
  taskPaneLayout?: OfficeTaskPaneLayoutControls | null;
}) {
  return (
    <OfficeColorNamesProvider value={colorNames}>
      {/* Every OfficeDialogShell in the workbook takes the shared Office
          dialog chrome, the same look as its native-window cards. */}
      <OfficeDialogChromeProvider tone="spreadsheet">
        {/* Its task panes (Format Shape, Format Chart) take the same chrome
            as its dialogs and its own panes. */}
        <OfficeTaskPaneChromeProvider tone="spreadsheet">
          <OfficeTaskPaneLayoutContext.Provider value={taskPaneLayout}>
            {render()}
          </OfficeTaskPaneLayoutContext.Provider>
        </OfficeTaskPaneChromeProvider>
      </OfficeDialogChromeProvider>
    </OfficeColorNamesProvider>
  );
}

export function SpreadsheetGridRows({ render }: { render: () => ReactNode }) {
  return <>{render()}</>;
}
