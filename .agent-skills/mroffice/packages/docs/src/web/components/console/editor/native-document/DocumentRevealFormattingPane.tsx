"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { EMU_PER_TWIP } from "@mrnote/core/web/lib/office-units.ts";
import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { useLocale, useTranslations } from "@mrnote/core/host/next-intl.tsx";

import {
  OfficeTaskPane,
  officeTaskPaneParts,
} from "@mrnote/core/web/components/office-ribbon/OfficeTaskPane.tsx";
import {
  formatPresentationMeasurement,
  presentationMeasurementUnit,
} from "@mrnote/core/web/lib/presentation-measurement.ts";
import dockStyles from "@mrnote/core/web/components/console/editor/native-document/DocumentShapeFormatPane.module.css";
import type { SectionBreakType } from "@mrnote/core/web/components/console/editor/extensions/SectionBreak.ts";
import type { SectionLayout } from "@mrnote/core/web/components/console/editor/native-document/sectionLayouts.ts";
import {
  compareRevealSnapshots,
  readRevealFormatting,
  type RevealGroup,
  type RevealLine,
  type RevealSnapshot,
} from "@mrnote/core/web/components/console/editor/native-document/revealFormatting.ts";

/**
 * Word's Reveal Formatting pane (Shift+F1): the selected text's sample, its
 * Font, Paragraph and Section formatting -- each group's heading opens the
 * dialog that changes it -- and Compare to another selection, which keeps
 * the first selection and lists what differs in the next.
 */
export interface DocumentRevealFormattingPaneProps {
  readonly editor: Editor;
  readonly paragraphStyleName: () => string | null;
  readonly section: () => { layout: SectionLayout | null; start: SectionBreakType | null };
  readonly onOpenFont: () => void;
  readonly onOpenParagraph: () => void;
  readonly onOpenPageSetup: () => void;
  readonly onClose: () => void;
}

const GROUPS: readonly RevealGroup[] = ["font", "paragraph", "section"];

export function DocumentRevealFormattingPane({
  editor,
  paragraphStyleName,
  section,
  onOpenFont,
  onOpenParagraph,
  onOpenPageSetup,
  onClose,
}: DocumentRevealFormattingPaneProps): React.JSX.Element {
  const t = useTranslations("console-notebooks");
  const unit = presentationMeasurementUnit(useLocale());
  // The host's readers as of its latest render.
  const sources = useRef({ paragraphStyleName, section });
  sources.current = { paragraphStyleName, section };
  const read = (): RevealSnapshot =>
    readRevealFormatting(editor.state, editor.view, {
      paragraphStyleName: sources.current.paragraphStyleName(),
      section: sources.current.section(),
      formatLength: (twips) =>
        `${formatPresentationMeasurement(twips * EMU_PER_TWIP, unit, 2)} ${unit === "in" ? '"' : "cm"}`,
    });
  const [snapshot, setSnapshot] = useState<RevealSnapshot>(read);
  const [compareTo, setCompareTo] = useState<RevealSnapshot | null>(null);

  useEffect(() => {
    let frame = 0;
    const refresh = () => {
      cancelAnimationFrame(frame);
      // After the view has drawn the transaction, so the styles read are the new ones.
      frame = requestAnimationFrame(() => {
        if (!editor.isDestroyed) setSnapshot(read());
      });
    };
    editor.on("transaction", refresh);
    return () => {
      cancelAnimationFrame(frame);
      editor.off("transaction", refresh);
    };
    // read() closes over the props, which the host passes stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  const shown = (line: RevealLine | null): string =>
    !line
      ? t("revealFormatting.none")
      : line.valueKey
        ? t(`revealFormatting.value_${line.value}` as "revealFormatting.value_single")
        : line.value;
  const label = (key: string) => t(`revealFormatting.prop_${key}` as "revealFormatting.prop_font");
  const openers: Record<RevealGroup, () => void> = {
    font: onOpenFont,
    paragraph: onOpenParagraph,
    section: onOpenPageSetup,
  };
  const differences = compareTo ? compareRevealSnapshots(compareTo, snapshot) : null;

  return (
    <OfficeTaskPane
      title={t("revealFormatting.title")}
      closeLabel={t("revealFormatting.close")}
      onClose={onClose}
      testIdPrefix="document-reveal-formatting"
      testId="document-reveal-formatting-pane"
      closeTestId="document-reveal-formatting-close"
      dockRight={false}
      className={dockStyles.pane}
    >
      <div className={officeTaskPaneParts.section}>
        <span className={officeTaskPaneParts.sectionLabel}>{t("revealFormatting.selectedText")}</span>
        <div
          className={officeTaskPaneParts.hint}
          data-testid="document-reveal-formatting-sample"
          style={{ border: "1px solid var(--office-pane-border, #d1d5db)", padding: "6px 8px", borderRadius: 4, minHeight: 28 }}
        >
          {snapshot.sample || "—"}
        </div>
        {compareTo ? (
          <div
            className={officeTaskPaneParts.hint}
            data-testid="document-reveal-formatting-compare-sample"
            style={{ border: "1px dashed var(--office-pane-border, #d1d5db)", padding: "6px 8px", borderRadius: 4 }}
          >
            {compareTo.sample || "—"}
          </div>
        ) : null}
        <label className={officeTaskPaneParts.check}>
          <input
            type="checkbox"
            checked={compareTo !== null}
            data-testid="document-reveal-formatting-compare"
            onChange={(event) => setCompareTo(event.currentTarget.checked ? snapshot : null)}
          />
          {t("revealFormatting.compare")}
        </label>
      </div>
      {differences ? (
        <div className={officeTaskPaneParts.section} data-testid="document-reveal-formatting-differences">
          <span className={officeTaskPaneParts.sectionLabel}>{t("revealFormatting.differences")}</span>
          {differences.length === 0 ? (
            <p className={officeTaskPaneParts.hint}>{t("revealFormatting.noDifferences")}</p>
          ) : (
            <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 8px", margin: 0 }}>
              {differences.map((difference) => (
                <div key={`${difference.group}:${difference.key}`} style={{ display: "contents" }}>
                  <dt>{label(difference.key)}</dt>
                  <dd style={{ margin: 0 }}>
                    {shown(difference.from)} → {shown(difference.to)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      ) : (
        GROUPS.map((group) => {
          const lines = snapshot.lines.filter((line) => line.group === group);
          if (lines.length === 0) return null;
          return (
            <div key={group} className={officeTaskPaneParts.section} data-testid={`document-reveal-formatting-${group}`}>
              <button
                type="button"
                className={officeTaskPaneParts.button}
                style={{ justifyContent: "flex-start", fontWeight: 600 }}
                data-testid={`document-reveal-formatting-open-${group}`}
                onClick={openers[group]}
              >
                {t(`revealFormatting.group_${group}` as "revealFormatting.group_font")}
              </button>
              <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 8px", margin: "4px 0 0 12px" }}>
                {lines.map((line) => (
                  <div key={line.key} style={{ display: "contents" }}>
                    <dt style={{ color: "var(--office-pane-muted, #6b7280)" }}>{label(line.key)}</dt>
                    <dd style={{ margin: 0 }} data-testid={`document-reveal-formatting-value-${line.key}`}>
                      {shown(line)}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          );
        })
      )}
    </OfficeTaskPane>
  );
}

export default DocumentRevealFormattingPane;
