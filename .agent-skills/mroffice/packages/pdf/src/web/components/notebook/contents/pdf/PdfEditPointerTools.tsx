"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { OfficeRibbonButton } from "@mrnote/core/web/components/office-ribbon/OfficeRibbonChassis.tsx";
import { OfficeHomeCommandStack } from "@mrnote/core/web/components/office-ribbon/OfficeHomeRibbon.tsx";
import officeStyles from "@mrnote/core/web/components/office-ribbon/OfficeHomeRibbon.module.css";
import { OfficeSemanticIcon } from "@mrnote/core/web/components/office-ribbon/icons/OfficeSemanticIcon.tsx";

import type { PdfEditRibbonIconSize } from "./PdfEditRibbonIcons";
import { PdfSurfaceRibbonGroup } from "./PdfSurfaceRibbon";
import ribbonLayout from "./pdfRibbonLayout.module.css";

export interface PdfEditPointerToolsProps {
  controlScope?: "HOME" | "INSERT" | "EDIT" | "COMMENT" | "PAGE" | "TOOLS";
  disabled?: boolean;
  groupLabel: string;
  groupTestId?: string;
  handActive: boolean;
  handActiveLabel: string;
  handDisplayLabel?: string;
  handLabel: string;
  handTestId?: string;
  iconSize?: PdfEditRibbonIconSize;
  loading?: boolean;
  loadingLabel: string;
  onHandActivate: () => void;
  onSelectActivate: () => void;
  selectActive: boolean;
  selectLabel: string;
  selectTestId?: string;
  testIdPrefix?: string;
  tabs?: string;
}

function loadingControlLabel(label: string, loadingLabel: string): string {
  return `${label} — ${loadingLabel}`;
}













export default function PdfEditPointerTools({
  controlScope = "EDIT",
  disabled = false,
  groupLabel,
  groupTestId,
  handActive,
  handActiveLabel,
  handDisplayLabel,
  handLabel,
  handTestId,
  iconSize = 20,
  loading = false,
  loadingLabel,
  onHandActivate,
  onSelectActivate,
  selectActive,
  selectLabel,
  selectTestId,
  testIdPrefix = "pdf-edit",
  tabs = "edit",
}: PdfEditPointerToolsProps) {
  const controlDisabled = disabled || loading;
  const handControlLabel = loading
    ? loadingControlLabel(handLabel, loadingLabel)
    : handActive
      ? handActiveLabel
      : handLabel;
  const selectControlLabel = loading
    ? loadingControlLabel(selectLabel, loadingLabel)
    : selectLabel;
  const visibleHandLabel =
    handDisplayLabel ?? handLabel.replace(/\s*[（(].*$/, "");
  const resolvedGroupTestId = groupTestId ?? `${testIdPrefix}-pointer-tools`;
  const resolvedHandTestId = handTestId ?? `${testIdPrefix}-hand-tool`;
  const resolvedSelectTestId = selectTestId ?? `${testIdPrefix}-select-tool`;
  const homeScope = controlScope === "HOME";

  return (
    <PdfSurfaceRibbonGroup
      ariaBusy={loading}
      dataAttributes={{
        "data-pdf-ribbon-group": "pointer",
        "data-pdf-pointer-family": "shared-office",
      }}
      label={groupLabel}
      tab={tabs}
      testId={resolvedGroupTestId}
    >
      <OfficeHomeCommandStack className={ribbonLayout.keepsWidth}>
        <span
          data-pdf-home-control={homeScope ? "hand" : undefined}
          data-pdf-pointer-control="hand"
          style={{ display: "contents" }}
        >
          <OfficeRibbonButton
            active={handActive}
            aria-busy={loading || undefined}
            className={`${officeStyles.command} ${officeStyles.commandCompact}`}
            data-office-anatomy="compact"
            data-pdf-control-id={`PDFCTL.RIBBON.${controlScope}.HAND`}
            data-pdf-ribbon-order="01"
            disabled={controlDisabled}
            label={handControlLabel}
            onClick={onHandActivate}
            testId={resolvedHandTestId}
          >
            <span className={officeStyles.commandGlyph} aria-hidden>
              <OfficeSemanticIcon semanticId="edit.hand" size={iconSize} />
            </span>
            <span className={officeStyles.commandLabel}>
              {visibleHandLabel}
            </span>
          </OfficeRibbonButton>
        </span>
        <span
          data-pdf-home-control={homeScope ? "select" : undefined}
          data-pdf-pointer-control="select"
          style={{ display: "contents" }}
        >
          <OfficeRibbonButton
            active={selectActive}
            aria-busy={loading || undefined}
            className={`${officeStyles.command} ${officeStyles.commandCompact}`}
            data-office-anatomy="compact"
            data-pdf-control-id={`PDFCTL.RIBBON.${controlScope}.SELECT`}
            data-pdf-ribbon-order="02"
            disabled={controlDisabled}
            label={selectControlLabel}
            onClick={onSelectActivate}
            testId={resolvedSelectTestId}
          >
            <span className={officeStyles.commandGlyph} aria-hidden>
              <OfficeSemanticIcon semanticId="edit.select" size={iconSize} />
            </span>
            <span className={officeStyles.commandLabel}>{selectLabel}</span>
          </OfficeRibbonButton>
        </span>
      </OfficeHomeCommandStack>
    </PdfSurfaceRibbonGroup>
  );
}
