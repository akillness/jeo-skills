/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
// The chart style presets (palette / gradient / data labels / legend
// position / rounded bars) the Chart Styles galleries offer and the one
// chart planner (`chartV2Echarts.ts`) paints. Ids mirror the server
// whitelist.

import type { ChartStylePresetId } from "./chartBlockShared";
import {
  CHART_STYLE_PRESETS,
  type ChartStylePreset,
} from "../../../../lib/office-charts/chart-style-presets.generated";

// ---------------------------------------------------------------------------
// Preset definitions: the ONE table, generated from the server's copy
// (`office_chart_style_presets.py`). The palette is what every .docx / .pptx /
// .xlsx writer puts in the file, so a chart reads the same here and in Word.
// ---------------------------------------------------------------------------

export type { ChartLegendPosition, ChartStylePreset } from "../../../../lib/office-charts/chart-style-presets.generated";
export { CHART_STYLE_PRESETS } from "../../../../lib/office-charts/chart-style-presets.generated";

export function chartPreset(id: unknown): ChartStylePreset {
  return (
    CHART_STYLE_PRESETS[id as ChartStylePresetId] ?? CHART_STYLE_PRESETS.classic
  );
}
