"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { CSSProperties } from "react";
import { Upload } from "./icons/houseIcons";

import styles from "./OfficeFileDropOverlay.module.css";

/** The class names of a file-drop target (see useOfficeFileDrop). */
export const officeFileDropClassNames = {
  activeTarget: styles.activeTarget,
} as const;

/**
 * The label over an editor while a file it accepts is dragged over it (the
 * Docs "Drop to import into this page"). Decorative: the drop target itself
 * carries the meaning, so the label is hidden from assistive technology. It
 * is positioned absolutely in the nearest positioned ancestor.
 */
export function OfficeFileDropOverlay({
  label,
  className,
  testId,
  style,
}: {
  readonly label: string;
  /** The editor's own class beside the shared look. */
  readonly className?: string;
  readonly testId?: string;
  /** Placement in the host (its stacking order beside the host's layers). */
  readonly style?: CSSProperties;
}): React.JSX.Element {
  return (
    <div
      className={className ? `${styles.overlay} ${className}` : styles.overlay}
      aria-hidden="true"
      data-testid={testId}
      style={style}
    >
      <Upload size={18} />
      <span>{label}</span>
    </div>
  );
}
