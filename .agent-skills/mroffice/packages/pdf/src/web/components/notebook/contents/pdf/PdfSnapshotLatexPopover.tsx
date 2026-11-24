"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { renderKatexInto } from "@mrnote/core/web/lib/katex-render.ts";
import "katex/dist/katex.min.css";
import { X } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { useKeepPopoverInsidePage } from "./useKeepPopoverInsidePage";

import {
  officeDialogClassName,
  officeDialogParts as parts,
} from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { apiPost } from "@mrnote/core/web/lib/api.ts";
import { PDF_FORMULA_KATEX_RENDER_OPTIONS } from "@mrnote/core/web/lib/pdf/formula-render.ts";
import { formulaTranscribeFailure } from "../../../../lib/pdf/formula-transcribe-failure";

/**
 * Result popover for the snapshot tool's "copy as LaTeX" action (Mathpix-style
 * snip): given the marquee crop as base64 PNG, POSTs it to the AI formula
 * transcription endpoint and shows a KaTeX preview + the LaTeX source in a
 * copyable input. Loading and failure (retryable) states are shown in place.
 * The popover is rendered inside the page's snapshot-region anchor, so it only
 * positions itself relative to that box (below or above the selection).
 */

// Unlike the formula text-box preview (throwOnError: true feeds a syntax
// gate), a transcription result must ALWAYS surface: render errors fall back
// to the raw source, never block the copy affordance.
const SNAPSHOT_LATEX_KATEX_OPTIONS = {
  ...PDF_FORMULA_KATEX_RENDER_OPTIONS,
  throwOnError: false,
} as const;
const SNAPSHOT_POPOVER_CHROME = officeDialogClassName({ tone: "pdf" });

export interface PdfSnapshotLatexPopoverProps {
  /** Base64 PNG payload (no data-URL prefix) of the marquee crop. */
  imageB64: string;
  /** Open below the selection (true) or above it (near the page bottom). */
  anchorBelow: boolean;
  /** Dismiss the popover (Esc / close button). */
  onClose: () => void;
}

type TranscribeState =
  | { status: "loading" }
  | { status: "error"; messageKey: string }
  | { status: "done"; latex: string };

export default function PdfSnapshotLatexPopover({
  imageB64,
  anchorBelow,
  onClose,
}: PdfSnapshotLatexPopoverProps) {
  const t = useTranslations("console-notebooks");
  const [state, setState] = useState<TranscribeState>({ status: "loading" });
  const popoverRef = useRef<HTMLDivElement | null>(null);
  // Kept on the page: shifted left from a right edge, flipped above from
  
  const placement = useKeepPopoverInsidePage(popoverRef, anchorBelow, state.status);
  const [copied, setCopied] = useState(false);
  const previewRef = useRef<HTMLDivElement | null>(null);
  // Guards a late response from touching state after unmount / a newer run.
  const runRef = useRef(0);

  // Kicks off a transcription run; state updates happen only in the async
  // continuation (a stale run — unmounted or superseded — never lands). The
  // caller is responsible for showing the loading state (the initial state is
  // already "loading"; retry resets it in its click handler).
  const startTranscribe = useCallback(() => {
    const run = ++runRef.current;
    void (async () => {
      try {
        const res = await apiPost<{ latex?: string }>(
          "/api/v1/ai/notebook/pdf-formula-transcribe",
          { image_b64: imageB64, image_mime_type: "image/png" },
        );
        if (runRef.current !== run) return;
        const latex = (res.latex ?? "").trim();
        setState(
          latex
            ? { status: "done", latex }
            : { status: "error", messageKey: "pdf.snapshot.latexEmpty" },
        );
      } catch (error) {
        if (runRef.current !== run) return;
        const failure = formulaTranscribeFailure(error);
        setState({
          status: "error",
          messageKey:
            failure === "unreadable"
              ? "pdf.snapshot.latexEmpty"
              : failure === "unavailable"
                ? "pdf.formulaTranscribeUnavailable"
                : "pdf.snapshot.latexFailed",
        });
      }
    })();
  }, [imageB64]);

  useEffect(() => {
    startTranscribe();
    return () => {
      // Invalidate any in-flight run on unmount / crop change.
      runRef.current += 1;
    };
  }, [startTranscribe]);

  const handleRetry = useCallback(() => {
    setState({ status: "loading" });
    startTranscribe();
  }, [startTranscribe]);

  // Esc dismisses the popover before it can reach the viewer's own Escape
  // handlers (capture phase), so one press closes just this popover.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  // KaTeX preview. throwOnError: false renders parse errors inline; the catch
  // covers anything KaTeX still throws, falling back to the raw source so the
  // copy path always survives an unrenderable transcription.
  const latex = state.status === "done" ? state.latex : null;
  useEffect(() => {
    const node = previewRef.current;
    if (!node || latex === null) return;
    try {
      renderKatexInto(node, latex, SNAPSHOT_LATEX_KATEX_OPTIONS);
      node.removeAttribute("data-invalid");
    } catch {
      node.textContent = latex;
      node.setAttribute("data-invalid", "true");
    }
  }, [latex]);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(id);
  }, [copied]);

  const handleCopy = useCallback(async () => {
    if (latex === null) return;
    try {
      await navigator.clipboard.writeText(latex);
      setCopied(true);
    } catch {
      // Clipboard rejected (permissions / insecure context): the source stays
      // selectable in the input, so the user can still copy manually.
      setCopied(false);
    }
  }, [latex]);

  return (
    null
  );
}
