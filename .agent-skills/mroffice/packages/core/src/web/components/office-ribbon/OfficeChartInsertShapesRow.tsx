"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { ReactNode } from "react";
import { OfficeHomeCommandRow, OfficeHomeMenuTrigger } from "./OfficeHomeRibbon";
import { OfficeSemanticIcon } from "./icons/OfficeSemanticIcon";
import styles from "./OfficeChartInsertShapesRow.module.css";

/** Chart hosts own insertion commands; this shared row owns their geometry. */
export function OfficeChartInsertShapesRow({ gallery, changeLabel, changeReason, changeTestId }: {
  gallery: ReactNode;
  changeLabel: string;
  changeReason: string;
  changeTestId: string;
}) {
  return <OfficeHomeCommandRow className={styles.row}>
    {gallery}
    <OfficeHomeMenuTrigger disabled variant="large" label={changeLabel}
      title={changeReason} disabledReason={changeReason} testId={changeTestId} className={styles.changeShape}
      style={{ width: "max-content", minWidth: 78, padding: "2px 4px", gap: 3 }}
      icon={<span className={styles.glyph}>
        <OfficeSemanticIcon semanticId="shape.change" size={32}/>
        <OfficeSemanticIcon semanticId="menu.chevron.down" size={12}/>
      </span>}/>
  </OfficeHomeCommandRow>;
}
