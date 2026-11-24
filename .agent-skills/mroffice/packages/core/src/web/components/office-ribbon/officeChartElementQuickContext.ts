"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { createContext } from "react";

/**
 * Whether the Add Chart Element rows are being drawn inside the Chart
 * Elements (+) flyout beside a chart rather than the Chart Design ribbon's
 * menu. Office draws the two differently (Microsoft Support, "Add or remove
 * titles in a chart": "click the Chart Elements button, and select the Chart
 * Title check box"): the flyout lists only the elements the chart takes, each
 * as a check box that adds or removes the element in one click, with the
 * element's own options on the arrow beside it; the ribbon menu lists every
 * element, greying the ones the chart cannot take.
 *
 * `OfficeChartQuickButtons` provides it around a host's rows, so the one
 * `OfficeChartElementMenuItems` each editor passes serves both.
 */
export const OfficeChartElementQuickContext = createContext(false);
