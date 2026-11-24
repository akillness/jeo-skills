"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The slides or worksheets an Agent run has planned and not written yet.
 *
 * A deck or a workbook the run writes grows on the page one unit at a time:
 * each slide or sheet enters as it is saved. Until then the plan has a shape
 * of its own: as soon as the run names its outline, every unit still to come
 * stands in the rail (a slide) or the tab bar (a sheet) as a ghost with its
 * planned title, the next one breathing, and each ghost gives way to the real
 * unit when it lands. The document's equivalent is the manuscript's ghost
 * sections (LiveDraftManuscript); both read the same pending units
 * (`pendingDraftUnits`).
 *
 * Presentation only: ghosts are not slides or sheets, are never selectable or
 * saved, and leave with the draft.
 */

import { useAgentDraftPageState } from "../../../__cut__/mb159dd42d4";
import {
  pendingDraftUnits,
  useAgentDraftProgress,
  type AgentDraftKind,
} from "../../../__cut__/ma4cba81be7";

import css from "./LiveDraftUnitGhosts.module.css";

const KIND_OF: Record<"slide" | "sheet", AgentDraftKind> = {
  slide: "presentation",
  sheet: "spreadsheet",
};

export function LiveDraftUnitGhosts({
  pageId,
  variant,
  shown,
  aspectRatio,
}: {
  pageId: string | null | undefined;
  variant: "slide" | "sheet";
  /**
   * How many units the editor shows already. A new page opens on one blank
   * slide or sheet, which stands where the first unit is being written, so
   * no ghost repeats its number.
   */
  shown: number;
  /** A slide ghost's paper, as the deck's slides are (`"16 / 9"`). */
  aspectRatio?: string;
}) {
  const live = useAgentDraftPageState(pageId) !== null;
  const progress = useAgentDraftProgress(pageId);
  if (!live || !progress || progress.phase !== "writing" || progress.kind !== KIND_OF[variant]) {
    return null;
  }
  const units = pendingDraftUnits(progress).filter((unit) => unit.number > shown);
  if (units.length === 0) return null;
  if (variant === "sheet") {
    return (
      <>
        {units.map((unit) => (
          <span
            key={`ghost-${unit.number}`}
            className={css.sheet}
            data-live-draft-ghost="sheet"
            data-next={unit.next ? "" : undefined}
            aria-hidden="true"
          >
            <span className={css.sheetName}>{unit.heading || " "}</span>
          </span>
        ))}
      </>
    );
  }
  return (
    <>
      {units.map((unit) => (
        <div
          key={`ghost-${unit.number}`}
          className={css.slide}
          data-live-draft-ghost="slide"
          data-next={unit.next ? "" : undefined}
          data-slide-number={unit.number}
          aria-hidden="true"
        >
          <span className={css.paper} style={aspectRatio ? { aspectRatio } : undefined}>
            {unit.heading ? <span className={css.title}>{unit.heading}</span> : null}
            <span className={css.line} />
            <span className={css.line} data-short="" />
          </span>
        </div>
      ))}
    </>
  );
}

export default LiveDraftUnitGhosts;
