"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useId, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  FileSignature,
  ShieldQuestion,
  ShieldX,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";

import {
  DocumentIssueDialogContent,
  DocumentIssuePortal,
} from "@mrnote/core/web/components/notebook/DocumentIssueNotice.tsx";
import noticeStyles from "@mrnote/core/web/components/notebook/DocumentIssueNotice.module.css";
import type { PdfSignatureProofPresentation } from "../../../../lib/pdf/signature-proof";

import PdfSignatureProofStatus from "./PdfSignatureProofStatus";

interface PdfSignatureIndicatorProps {
  loading: boolean;
  presentation: PdfSignatureProofPresentation;
  downloadOriginalEnabled: boolean;
  downloadOriginalReason?: string;
  downloadOriginalReasonKey?: string;
  downloadOriginalDisposition?: string;
  downloadOriginalCapabilityId: string;
  onDownloadOriginal: () => void;
  /** Bumped by Home's 验证所有签名: the panel opens, focus in it. */
  openRequest?: number;
}

/**
 * The reader's always-visible signature state for a signed PDF, in the
 * window titlebar next to the other window notices.
 *
 * Office keeps a Signatures button in the status bar of every signed file
 * and raises "This document contains invalid signatures. [View Signatures]"
 * on open. This chip is that button; an invalid signature opens its panel
 * once per source (the parent keys this component by source identity).
 * The panel is the same proof card the Tools host shows.
 */
export default function PdfSignatureIndicator({
  loading,
  presentation,
  openRequest = 0,
  ...statusProps
}: PdfSignatureIndicatorProps) {
  const integrity = loading ? "unknown" : presentation.integrity;
  const label = loading
    ? presentation.loadingIndicatorLabel
    : presentation.indicatorLabel;
  const headline = loading
    ? presentation.loadingHeadline
    : presentation.headline;
  const tone =
    loading || integrity === "unknown"
      ? "warning"
      : integrity === "mismatch"
        ? "error"
        : "neutral";
  const [open, setOpen] = useState(false);
  const [presented, setPresented] = useState(false);
  // Only a click moves focus into the panel; the automatic open does not.
  const [focusOnOpen, setFocusOnOpen] = useState(false);
  const [autoOpened, setAutoOpened] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogId = useId();

  const [answeredOpenRequest, setAnsweredOpenRequest] = useState(openRequest);
  if (openRequest !== answeredOpenRequest) {
    setAnsweredOpenRequest(openRequest);
    setFocusOnOpen(true);
    setOpen(true);
  }

  // A proven mismatch opens the panel once, as Office raises its message bar.
  if (!loading && integrity === "mismatch" && !autoOpened) {
    setAutoOpened(true);
    setOpen(true);
  }

  const Icon = loading
    ? Loader2
    : integrity === "mismatch"
      ? ShieldX
      : integrity === "unknown"
        ? ShieldQuestion
        : FileSignature;

  return (
    <DocumentIssuePortal
      data-testid="pdf-signature-indicator"
      data-signature-integrity={integrity}
      data-collaboration-readonly-allowed="true"
    >
      <button
        ref={triggerRef}
        type="button"
        className={noticeStyles.trigger}
        data-tone={tone}
        data-testid="pdf-signature-indicator-toggle"
        data-collaboration-readonly-allowed="true"
        title={headline}
        aria-label={`${label}: ${headline}`}
        aria-haspopup="dialog"
        aria-expanded={presented}
        aria-controls={presented ? dialogId : undefined}
        onClick={(event) => {
          setFocusOnOpen(true);
          event.stopPropagation();
          setOpen(!presented);
        }}
      >
        <Icon
          size={16}
          aria-hidden="true"
          className={loading ? "animate-spin" : undefined}
        />
        <span>{label}</span>
      </button>
      <DocumentIssueDialogContent
        open={open}
        onClose={() => {
          setOpen(false);
          setFocusOnOpen(false);
        }}
        triggerRef={triggerRef}
        focusOnOpen={focusOnOpen}
        onPresentedChange={setPresented}
        id={dialogId}
        aria-labelledby={`${dialogId}-title`}
        className={`${noticeStyles.panel} pdf-viewer__signature-indicator-panel`}
        data-testid="pdf-signature-indicator-panel"
      >
        <h2 id={`${dialogId}-title`}>{presentation.panelTitle}</h2>
        <PdfSignatureProofStatus
          loading={loading}
          presentation={presentation}
          testIdPrefix="pdf-signature-indicator-proof"
          detailsDefaultOpen
          {...statusProps}
        />
      </DocumentIssueDialogContent>
    </DocumentIssuePortal>
  );
}
