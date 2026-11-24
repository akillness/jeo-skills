/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * One ribbon strip whose band anatomy (Home or Insert) follows the tab.
 *
 * Editors used to render `OfficeHomeRibbonStrip` for some tabs and
 * `OfficeInsertRibbonStrip` for others. Those are two component types at
 * the same place, so crossing from a Home-anatomy tab to an Insert-anatomy
 * one unmounted the whole strip (its scroller, observers and every panel
 * inside it) and mounted it again: on an iPad each such tab change paid
 * for inserting the full panel DOM. Here the wrapper and the strip stay
 * mounted; only the wrapper's skin (class, data attributes, band height)
 * changes with the surface. The DOM and test ids are those of the two
 * strips it replaces.
 */

import { type CSSProperties, useRef } from "react";

import {
  OfficeRibbonStrip,
  type OfficeRibbonStripProps,
} from "./OfficeRibbonChassis";
import type { OfficeHomeRibbonDensity } from "./OfficeHomeRibbon";
import { useEmptyRibbonGroupMarks } from "./OfficeInsertRibbon";

import homeStyles from "./OfficeHomeRibbon.module.css";
import insertStyles from "./OfficeInsertRibbon.module.css";

export type OfficeRibbonSurface = "home" | "insert";

function classes(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function OfficeRibbonSurfaceStrip({
  surface,
  density = "office",
  bandHeight = 100,
  className,
  ...props
}: OfficeRibbonStripProps & {
  surface: OfficeRibbonSurface;
  /** Home anatomy only (OfficeHomeRibbonStrip `density`). */
  density?: OfficeHomeRibbonDensity;
  /** Insert anatomy only (OfficeInsertRibbonStrip `bandHeight`). */
  bandHeight?: number;
  className?: string;
}) {
  const home = surface === "home";
  // The Insert anatomy hides its groups that hold no control; the marks
  // cost nothing on a Home band, which has no rule for them.
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  useEmptyRibbonGroupMarks(surfaceRef);
  return (
    <div
      ref={surfaceRef}
      className={classes(home ? homeStyles.surface : insertStyles.surface, className)}
      data-office-home-density={home ? density : undefined}
      data-office-insert-surface={home ? undefined : "true"}
      data-testid={
        props.testIdPrefix
          ? `${props.testIdPrefix}-${home ? "home" : "insert"}-surface`
          : undefined
      }
      style={
        home
          ? undefined
          : ({ "--office-insert-band-height": `${bandHeight}px` } as CSSProperties)
      }
    >
      <OfficeRibbonStrip {...props} />
    </div>
  );
}
