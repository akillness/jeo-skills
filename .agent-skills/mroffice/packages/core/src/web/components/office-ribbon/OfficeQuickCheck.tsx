"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The check box the chart quick flyouts draw in their rows (Chart Elements,
 * Chart Filters): one picture, box and tick, sized in its own style because
 * the menu rows size every svg to their icon size, which clipped the tick and
 * lost the box. Its colours come from OfficeChartQuickButtons.module.css
 * (`--office-quick-check-*`), so it follows the menu's light and dark faces.
 */
export function OfficeQuickCheck({
  checked,
  mixed = false,
}: {
  checked: boolean;
  /** Some, not all, of a group are on (a group's Select All). */
  mixed?: boolean;
}) {
  const on = checked || mixed;
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      data-quick-check={mixed ? "mixed" : checked ? "checked" : "unchecked"}
      style={{ width: 16, height: 16, flex: "0 0 auto" }}
    >
      <rect
        x={0.75}
        y={0.75}
        width={14.5}
        height={14.5}
        rx={4}
        style={{
          fill: on
            ? "var(--office-quick-check-on, var(--office-accent, #2d7f74))"
            : "var(--office-quick-check-face, #ffffff)",
          stroke: on
            ? "var(--office-quick-check-on, var(--office-accent, #2d7f74))"
            : "var(--office-quick-check-edge, #8a9694)",
          strokeWidth: 1.5,
        }}
      />
      {mixed ? (
        <path d="M4.6 8h6.8" fill="none" stroke="#ffffff" strokeWidth={1.8} strokeLinecap="round" />
      ) : checked ? (
        <path
          d="M4.2 8.3 6.9 10.9 11.9 5.4"
          fill="none"
          stroke="#ffffff"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
    </svg>
  );
}
