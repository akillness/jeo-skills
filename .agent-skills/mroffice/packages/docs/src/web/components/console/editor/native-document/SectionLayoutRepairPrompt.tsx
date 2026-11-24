"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import ConfirmDialog from "@mrnote/core/web/components/ui/ConfirmDialog.tsx";
import { ToastAction } from "@mrnote/core/web/components/ui/toast.tsx";
import { toast } from "@mrnote/core/web/hooks/use-toast.ts";

import { marginGalleryPresetFor, pageSizeSelectionFromSectionTwips } from "@mrnote/core/web/components/console/editor/native-document/pageSetup.ts";
import {
  planSectionLayoutRepair,
  sectionLayoutStructureIssue,
  subscribeSectionLayoutStructureFailure,
  type SectionLayoutRepairPlan,
} from "@mrnote/core/web/components/console/editor/native-document/sectionLayoutRepair.ts";
import type { SectionLayout } from "@mrnote/core/web/components/console/editor/native-document/sectionLayouts.ts";

/** Long enough for hydration and a peer's attribute update to land. */
const OPEN_CHECK_DELAY_MS = 2_000;
const TWIPS_PER_CM = 1440 / 2.54;

type Translate = ReturnType<typeof useTranslations>;

function centimetres(twips: number): string {
  return (Math.round((twips / TWIPS_PER_CM) * 100) / 100).toString();
}

function layoutSummary(t: Translate, layout: SectionLayout): string {
  const { widthTwips, heightTwips, orientation } = layout.pageSize;
  const size = pageSizeSelectionFromSectionTwips(widthTwips, heightTwips, orientation);
  const paper =
    size && size.pageSize !== "custom"
      ? t(`toolbar.pageSize_${size.pageSize}`)
      : t("document.sectionRepair.customSize", {
          width: centimetres(widthTwips),
          height: centimetres(heightTwips),
        });
  const margins = layout.pageMargins;
  const preset = marginGalleryPresetFor(
    {
      top: margins.topTwips,
      bottom: margins.bottomTwips,
      left: margins.leftTwips,
      right: margins.rightTwips,
    },
    false,
  );
  return t("document.sectionRepair.summary", {
    paper,
    orientation: t(`toolbar.pageOrientation_${orientation}`),
    margins: preset
      ? t("document.sectionRepair.marginsPreset", {
          name: t(`toolbar.pageMarginsPreset_${preset}`),
        })
      : t("document.sectionRepair.customMargins", {
          top: centimetres(margins.topTwips),
          bottom: centimetres(margins.bottomTwips),
          left: centimetres(margins.leftTwips),
          right: centimetres(margins.rightTwips),
        }),
    columns: t("document.sectionRepair.columns", { count: layout.columns.count }),
  });
}

function RepairBody({ plan, t }: { plan: SectionLayoutRepairPlan; t: Translate }) {
  return (
    <div data-testid="section-layout-repair-body" className="space-y-2 text-sm">
      <p>
        {t(
          plan.layoutCount < plan.sectionCount
            ? "document.sectionRepair.problemMissing"
            : "document.sectionRepair.problemExtra",
          { sections: plan.sectionCount, layouts: plan.layoutCount },
        )}
      </p>
      <ul className="list-disc space-y-1 ps-5">
        {plan.rows.map((row) => (
          <li key={row.sectionIndex} data-testid="section-layout-repair-row">
            {row.origin.kind === "kept"
              ? t("document.sectionRepair.kept", {
                  section: row.sectionIndex + 1,
                  summary: layoutSummary(t, row.layout),
                })
              : t("document.sectionRepair.copied", {
                  section: row.sectionIndex + 1,
                  from: row.origin.fromSectionIndex + 1,
                  summary: layoutSummary(t, row.layout),
                })}
          </li>
        ))}
      </ul>
      {plan.dropped.length > 0 ? (
        <p>
          {t("document.sectionRepair.dropped", {
            count: plan.dropped.length,
            summaries: plan.dropped
              .map((entry) => layoutSummary(t, entry.layout))
              .join("; "),
          })}
        </p>
      ) : null}
      <p>{t("document.sectionRepair.preserved")}</p>
    </div>
  );
}

/**
 * Makes a mismatched section-layout chain visible and repairable.
 *
 * - A page-setup command refused because sections and layouts no longer line
 *   up opens the repair prompt instead of silently doing nothing.
 * - Opening such a document shows a notice with a Review action.
 * - The repair is applied only when the author confirms it, as one undoable
 *   step; nothing is copied, deleted or cleared behind their back.
 */
export default function SectionLayoutRepairPrompt({
  editor,
}: {
  editor: Editor | null;
}) {
  const t = useTranslations("console-notebooks");
  const [plan, setPlan] = useState<SectionLayoutRepairPlan | null>(null);
  const noticedRef = useRef<string | null>(null);
  const noticeRef = useRef<{ dismiss: () => void } | null>(null);
  const clearNotice = useCallback(() => {
    noticedRef.current = null;
    noticeRef.current?.dismiss();
    noticeRef.current = null;
  }, []);

  const openReview = useCallback(() => {
    if (!editor || editor.isDestroyed || !editor.isEditable) return;
    const next = planSectionLayoutRepair(editor.state.doc);
    if (next) {
      setPlan(next);
      return;
    }
    if (sectionLayoutStructureIssue(editor.state.doc)) {
      toast({
        title: t("document.sectionRepair.problemMalformed"),
        variant: "destructive",
      });
    }
  }, [editor, t]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    return subscribeSectionLayoutStructureFailure(editor, () => {
      if (editor.isDestroyed || !editor.isEditable) return;
      const next = planSectionLayoutRepair(editor.state.doc);
      // A section break inserted or deleted on a mismatched chain: the chain
      // is repaired at once (one undoable step, nothing of the text touched)
      // instead of asking first, and the author's next try goes through.
      if (next && editor.commands.repairSectionLayoutStructure(next.layouts)) {
        clearNotice();
        toast({ title: t("document.sectionRepair.done") });
        return;
      }
      if (next) setPlan((current) => current ?? next);
      else openReview();
    });
  }, [clearNotice, editor, openReview, t]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const check = () => {
      timer = null;
      if (editor.isDestroyed || !editor.isEditable) return;
      const issue = sectionLayoutStructureIssue(editor.state.doc);
      // A chain the page-setup commands repair themselves on their next
      // write (DocumentPageSetup `withRepairedSectionChain`) needs no notice:
      // nothing is locked. Only a chain no repair can be planned for is said.
      if (!issue || planSectionLayoutRepair(editor.state.doc)) {
        // Repaired here, by a peer, or by Undo/Redo: the notice is stale.
        clearNotice();
        return;
      }
      const signature = `${issue.sectionCount}/${issue.layoutCount ?? "invalid"}`;
      if (noticedRef.current === signature) return;
      noticeRef.current?.dismiss();
      noticedRef.current = signature;
      noticeRef.current = toast({
        title: t("document.sectionRepair.notice"),
        variant: "destructive",
        action: (
          <ToastAction
            altText={t("document.sectionRepair.review")}
            data-testid="section-layout-repair-review"
            onClick={openReview}
          >
            {t("document.sectionRepair.review")}
          </ToastAction>
        ),
      });
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(check, OPEN_CHECK_DELAY_MS);
    };
    schedule();
    editor.on("update", schedule);
    return () => {
      if (timer) clearTimeout(timer);
      editor.off("update", schedule);
    };
  }, [clearNotice, editor, openReview, t]);

  if (!plan) return null;
  return (
    <ConfirmDialog
      open
      title={t("document.sectionRepair.title")}
      body={<RepairBody plan={plan} t={t} />}
      confirmLabel={t("document.sectionRepair.confirm")}
      cancelLabel={t("document.sectionRepair.cancel")}
      onCancel={() => setPlan(null)}
      onConfirm={() => {
        const confirmed = plan;
        setPlan(null);
        if (!editor || editor.isDestroyed) return;
        if (editor.commands.repairSectionLayoutStructure(confirmed.layouts)) {
          clearNotice();
          toast({ title: t("document.sectionRepair.done") });
          return;
        }
        toast({ title: t("document.sectionRepair.stale"), variant: "destructive" });
      }}
    />
  );
}
