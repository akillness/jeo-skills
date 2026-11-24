"use client";
/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { ReactNode } from "react";
import {
  OfficeHomeRibbonGroup,
  OfficeHomeCommandRow,
} from "./OfficeHomeRibbon";
import {
  OfficeShapeStyleGallery,
  type OfficeShapeStyleGalleryProps,
} from "./OfficeShapeStyleGallery";
import styles from "./OfficeShapeFormatStyleGroup.module.css";
/** Extracted from PowerPoint Shape Format; each editor owns its commands. */
export function OfficeShapeFormatStyleGroup({
  commands,
  testId,
  ...gallery
}: OfficeShapeStyleGalleryProps & { commands: ReactNode; testId?: string }) {
  return (
    <OfficeHomeRibbonGroup
      ribbon={gallery.application==="docs"?"shape":undefined}
      label={gallery.label}
      size="gallery"
      className={styles.group}
      testId={testId}
    >
      <OfficeHomeCommandRow className={styles.row}>
        <OfficeShapeStyleGallery {...gallery} />
        <div className={styles.commands}>{commands}</div>
      </OfficeHomeCommandRow>
    </OfficeHomeRibbonGroup>
  );
}
