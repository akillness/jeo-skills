"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  FileStack,
  RotateCcw,
  RotateCw,
  ShieldCheck,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { formatPdfPageScopePages, PdfPageScopeChoice } from "./PdfPageScopeChoice";
import {
  rotationTargetPages,
  type PdfPageRotationDirection,
  type PdfPageRotationScope,
} from "../../../../lib/pdf/page-rotation";

export interface PdfRotatePagesSelection {
  direction: PdfPageRotationDirection;
  scope: PdfPageRotationScope;
  rangeSpec: string;
  pages: number[];
}

export interface PdfRotatePagesDialogProps {
  open: boolean;
  currentPage: number;
  totalPages: number;
  onConfirm: (selection: PdfRotatePagesSelection) => void;
  onCancel: () => void;
}

const DIRECTIONS: ReadonlyArray<{
  value: PdfPageRotationDirection;
  degrees: number;
}> = [
  { value: "counterclockwise", degrees: -90 },
  { value: "half-turn", degrees: 180 },
  { value: "clockwise", degrees: 90 },
];

export function resolvePdfRotatePagesSelection(options: {
  direction: PdfPageRotationDirection;
  scope: PdfPageRotationScope;
  currentPage: number;
  totalPages: number;
  rangeSpec?: string;
}): PdfRotatePagesSelection {
  const totalPages =
    Number.isInteger(options.totalPages) && options.totalPages > 0
      ? options.totalPages
      : Math.max(1, options.currentPage);
  const rangeSpec = String(options.rangeSpec ?? "");
  return {
    direction: options.direction,
    scope: options.scope,
    rangeSpec,
    pages: rotationTargetPages(
      options.scope,
      options.currentPage,
      totalPages,
      rangeSpec,
    ),
  };
}

export default function PdfRotatePagesDialog({
  open,
  currentPage,
  totalPages,
  onConfirm,
  onCancel,
}: PdfRotatePagesDialogProps) {
  const commonT = useTranslations("common");
  const t = useTranslations("console-notebooks");
  const clockwiseRef = useRef<HTMLButtonElement>(null);
  const confirmInFlightRef = useRef(false);
  const [direction, setDirection] =
    useState<PdfPageRotationDirection>("clockwise");
  const [scope, setScope] = useState<PdfPageRotationScope>("page");
  const [rangeSpec, setRangeSpec] = useState(String(currentPage));
  useEffect(() => {
    if (open) confirmInFlightRef.current = false;
  }, [open]);

  const selection = useMemo(
    () =>
      resolvePdfRotatePagesSelection({
        direction,
        scope,
        currentPage,
        totalPages,
        rangeSpec,
      }),
    [currentPage, direction, rangeSpec, scope, totalPages],
  );
  const rangeInvalid = scope === "range" && selection.pages.length === 0;
  const selectedLabel = formatPdfPageScopePages(selection.pages, t);
  const confirm = () => {
    if (selection.pages.length === 0 || confirmInFlightRef.current) return;
    confirmInFlightRef.current = true;
    onConfirm(selection);
  };

  const directionLabel = (value: PdfPageRotationDirection) => {
    if (value === "counterclockwise") {
      return t("pdf.rotatePages.directionLeft");
    }
    if (value === "half-turn") {
      return t("pdf.rotatePages.directionHalfTurn");
    }
    return t("pdf.rotatePages.directionRight");
  };
  const directionHint = (value: PdfPageRotationDirection) => {
    if (value === "counterclockwise") {
      return t("pdf.rotatePages.hintCounterclockwise");
    }
    if (value === "half-turn") {
      return t("pdf.rotatePages.hintHalfTurn");
    }
    return t("pdf.rotatePages.hintClockwise");
  };

  return (
    <OfficeDialogShell
      open={open}
      title={t("pdf.rotatePages.title")}
      description={t("pdf.rotatePages.description")}
      defaultActionLabel={
        <span className="inline-flex items-center gap-1.5">
          <RotateCw size={15} aria-hidden />
          {t("pdf.rotatePages.title")}
        </span>
      }
      cancelActionLabel={commonT("button.cancel")}
      onDefaultAction={confirm}
      onCancel={onCancel}
      defaultActionDisabled={selection.pages.length === 0}
      initialFocusRef={clockwiseRef}
      className="sm:max-w-[520px]"
      testIdPrefix="pdf-rotate-pages"
    >
      <style>{`
        .pdf-rotate-pages-dialog__body {
          display: grid;
          gap: 17px;
        }
        .pdf-rotate-pages-dialog__section {
          display: grid;
          gap: 8px;
        }
        .pdf-rotate-pages-dialog__label {
          color: var(--office-dialog-ink, #334155);
          font-size: 11.5px;
          font-weight: 700;
        }
        .pdf-rotate-pages-dialog__directions {
          display: grid;
          gap: 8px;
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
        .pdf-rotate-pages-dialog__direction {
          align-items: center;
          background: var(--office-dialog-surface, #ffffff);
          border: 1px solid var(--office-dialog-control-border, #cbd5e1);
          border-radius: 10px;
          color: var(--office-dialog-muted, #475569);
          cursor: pointer;
          display: grid;
          gap: 5px;
          justify-items: center;
          min-height: 116px;
          padding: 10px 7px;
          transition: background-color 180ms ease, border-color 180ms ease,
            box-shadow 180ms ease;
        }
        .pdf-rotate-pages-dialog__direction:hover {
          background: var(--office-dialog-surface-muted, #f8fafc);
          border-color: var(--office-dialog-control-border-hover, #94a3b8);
        }
        .pdf-rotate-pages-dialog__direction[aria-pressed="true"] {
          background: var(--office-dialog-accent-soft, #f0fdfa);
          border-color: var(--office-dialog-accent, #14b8a6);
          box-shadow: 0 0 0 2px rgba(20, 184, 166, 0.11);
          color: var(--office-dialog-ink, #0f766e);
        }
        .pdf-rotate-pages-dialog__preview {
          align-items: center;
          background: var(--office-dialog-surface, #ffffff);
          border: 1.5px solid currentColor;
          border-radius: 3px;
          display: inline-flex;
          height: 42px;
          justify-content: center;
          position: relative;
          transform: rotate(var(--pdf-preview-rotation));
          transition: transform 180ms ease;
          width: 31px;
        }
        .pdf-rotate-pages-dialog__preview::before {
          background: currentColor;
          border-radius: 999px;
          content: "";
          height: 2px;
          opacity: 0.6;
          position: absolute;
          top: 7px;
          width: 17px;
        }
        .pdf-rotate-pages-dialog__preview span {
          font-size: 12px;
          font-weight: 750;
        }
        .pdf-rotate-pages-dialog__direction strong {
          color: var(--office-dialog-ink, #0f172a);
          font-size: 11.5px;
          line-height: 1.3;
        }
        .pdf-rotate-pages-dialog__direction small {
          color: var(--office-dialog-muted, #64748b);
          font-size: 10px;
          line-height: 1.25;
        }
        .pdf-rotate-pages-dialog__direction:focus-visible {
          outline: 3px solid rgba(13, 148, 136, 0.24);
          outline-offset: 2px;
        }
        .pdf-rotate-pages-dialog__summary {
          align-items: center;
          background: var(--office-dialog-surface-muted, #f8fafc);
          border: 1px solid var(--office-dialog-divider, #e2e8f0);
          border-radius: 10px;
          display: grid;
          gap: 3px 10px;
          grid-template-columns: 34px minmax(0, 1fr);
          padding: 11px 12px;
        }
        .pdf-rotate-pages-dialog__summary > svg {
          color: var(--office-dialog-ink, #0f766e);
          grid-row: 1 / span 3;
        }
        .pdf-rotate-pages-dialog__summary strong {
          color: var(--office-dialog-ink, #0f172a);
          font-size: 12px;
          line-height: 1.35;
        }
        .pdf-rotate-pages-dialog__summary span {
          color: var(--office-dialog-muted, #64748b);
          font-size: 11px;
        }
        .pdf-rotate-pages-dialog__native {
          align-items: center;
          color: var(--office-dialog-ink, #0f766e);
          display: flex;
          font-size: 10.5px;
          font-weight: 650;
          gap: 5px;
        }
        @media (max-width: 560px) {
          .pdf-rotate-pages-dialog__directions {
            grid-template-columns: 1fr;
          }
          .pdf-rotate-pages-dialog__direction {
            grid-template-columns: 44px minmax(0, 1fr);
            justify-items: start;
            min-height: 64px;
            text-align: left;
          }
          .pdf-rotate-pages-dialog__preview {
            grid-row: 1 / span 2;
          }
        }
      `}</style>
      <div className="pdf-rotate-pages-dialog__body">
        <div className="pdf-rotate-pages-dialog__section">
          <span className="pdf-rotate-pages-dialog__label">
            {t("pdf.rotatePages.direction")}
          </span>
          <div
            className="pdf-rotate-pages-dialog__directions"
            role="group"
            aria-label={t("pdf.rotatePages.direction")}
          >
            {DIRECTIONS.map(({ value, degrees }) => {
              const Icon = value === "counterclockwise" ? RotateCcw : RotateCw;
              return (
                <button
                  key={value}
                  ref={value === "clockwise" ? clockwiseRef : undefined}
                  type="button"
                  className="office-dialog__choice pdf-rotate-pages-dialog__direction"
                  aria-pressed={direction === value}
                  onClick={() => setDirection(value)}
                  data-testid={`pdf-rotate-direction-${value}`}
                >
                  <span
                    className="pdf-rotate-pages-dialog__preview"
                    style={
                      {
                        "--pdf-preview-rotation": `${degrees}deg`,
                      } as CSSProperties
                    }
                    aria-hidden
                  >
                    <span>A</span>
                  </span>
                  <strong>{directionLabel(value)}</strong>
                  <small>
                    <Icon size={11} aria-hidden /> {directionHint(value)}
                  </small>
                </button>
              );
            })}
          </div>
        </div>

        <PdfPageScopeChoice
          scope={scope}
          onScopeChange={setScope}
          rangeSpec={rangeSpec}
          onRangeSpecChange={setRangeSpec}
          rangeInvalid={rangeInvalid}
          currentPage={currentPage}
          totalPages={totalPages}
          testIdPrefix="pdf-rotate"
        />

        <div
          className="pdf-rotate-pages-dialog__summary"
          data-testid="pdf-rotate-pages-summary"
        >
          <FileStack size={19} aria-hidden />
          <strong>
            {directionLabel(direction)} ·{" "}
            {t("pdf.rotatePages.pageCount", { count: selection.pages.length })}
          </strong>
          <span>{selectedLabel}</span>
          <div className="pdf-rotate-pages-dialog__native">
            <ShieldCheck size={13} aria-hidden />
            {t("pdf.rotatePages.nativeHint")}
          </div>
        </div>
      </div>
    </OfficeDialogShell>
  );
}
