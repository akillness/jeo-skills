"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The right-hand settings of a selected text box (ONLYOFFICE's right panel,
 * its Paragraph and Text Box settings; Word's Format pane): the paragraph's
 * spacing and indents, its alignment and tabs, the box's vertical alignment,
 * text direction and columns, the characters' spacing and scale. Every
 * control is one of the Text Editing tab's own (PdfTextEditingContextRibbon):
 * the same model in, the same action out, the same capability deciding it --
 * the panel adds no command of its own.
 */
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import { OfficeRibbonNumberField } from "@mrnote/core/web/components/office-ribbon/OfficeRibbonNumberField.tsx";
import { OfficeTaskPane } from "@mrnote/core/web/components/office-ribbon/OfficeTaskPane.tsx";
import { OfficeSemanticIcon } from "@mrnote/core/web/components/office-ribbon/icons/OfficeSemanticIcon.tsx";

import type {
  PdfTextDirection,
  PdfTextEditingCapabilities,
  PdfTextEditingContextRibbonAction,
  PdfTextEditingContextRibbonLabels,
  PdfTextEditingContextRibbonModel,
  PdfTextEditingControl,
  PdfTextEditingNumberControl,
  PdfTextVerticalAlign,
} from "./PdfTextEditingContextRibbon";
import { PDF_TASK_PANE_BODY_CLASS, PDF_TASK_PANE_CLOSE_CLASS, pdfTaskPaneClassName } from "./pdfTaskPaneDock";

type NumberEntry = Readonly<{
  control: PdfTextEditingNumberControl;
  label: string;
  value: number | null | undefined;
  min: number;
  max: number;
  step: number;
  unit?: string;
}>;

/** Each number's icon: the Text Editing tab's own for it. */
const ICONS: Readonly<Record<PdfTextEditingNumberControl, string>> = {
  lineSpacing: "paragraph.spacing.line", spaceBefore: "paragraph.spacing.line", spaceAfter: "paragraph.spacing.line",
  leftIndent: "paragraph.indent.decrease", rightIndent: "paragraph.indent.increase",
  firstLineIndent: "paragraph.indent.firstLine", characterSpacing: "text.spacing.character",
  wordSpacing: "text.spacing.character", horizontalScale: "text.spacing.character",
};

const ALIGNMENTS = ["left", "center", "right", "justify", "distributed"] as const;
const ALIGNMENT_CONTROLS: Readonly<Record<(typeof ALIGNMENTS)[number], PdfTextEditingControl>> = {
  left: "alignLeft", center: "alignCenter", right: "alignRight", justify: "alignJustify", distributed: "alignDistributed",
};
const VERTICAL_ALIGNS: readonly PdfTextVerticalAlign[] = ["top", "middle", "bottom"];
const DIRECTIONS: readonly PdfTextDirection[] = ["horizontal", "vertical", "rotate90", "rotate270"];

export function PdfTextSettingsPane({
  capabilities,
  labels,
  model,
  onAction,
  onClose,
}: {
  readonly capabilities: PdfTextEditingCapabilities;
  readonly labels: PdfTextEditingContextRibbonLabels;
  readonly model: PdfTextEditingContextRibbonModel;
  readonly onAction: (action: PdfTextEditingContextRibbonAction) => void;
  readonly onClose: () => void;
}) {
  const t = useTranslations("console-notebooks");
  const dispatch = (control: PdfTextEditingControl, action: PdfTextEditingContextRibbonAction) => {
    if (capabilities[control].enabled) onAction(action);
  };
  const reasonOf = (control: PdfTextEditingControl) =>
    capabilities[control].enabled ? undefined : capabilities[control].reason ?? labels.unavailable;
  const numberField = (entry: NumberEntry) => (
    <OfficeRibbonNumberField
      key={entry.control}
      icon={<OfficeSemanticIcon semanticId={ICONS[entry.control] as never} />}
      visibleLabel={entry.label}
      label={entry.label}
      disabled={!capabilities[entry.control].enabled}
      disabledReason={reasonOf(entry.control)}
      min={entry.min}
      max={entry.max}
      step={entry.step}
      unit={entry.unit ?? "pt"}
      mixed={entry.value == null}
      mixedLabel={labels.mixed}
      value={entry.value == null ? "" : String(entry.value)}
      onCommit={(raw) => {
        const parsed = Number(raw);
        if (Number.isFinite(parsed)) dispatch(entry.control, { type: "number", control: entry.control, value: parsed });
      }}
      testId={`pdf-text-settings-${entry.control}`}
    />
  );
  const choice = <Value extends string>(
    testId: string,
    label: string,
    values: readonly Value[],
    current: Value | null | undefined,
    controlOf: (value: Value) => PdfTextEditingControl,
    nameOf: (value: Value) => string,
    actionOf: (value: Value) => PdfTextEditingContextRibbonAction,
  ) => (
    <div className="pdf-viewer__settings-row" role="radiogroup" aria-label={label} data-testid={testId}>
      <span className="pdf-viewer__settings-label">{label}</span>
      <span className="pdf-viewer__settings-choices">
        {values.map((value) => {
          const control = controlOf(value);
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={current === value}
              className="pdf-viewer__settings-choice"
              disabled={!capabilities[control].enabled}
              title={reasonOf(control) ?? nameOf(value)}
              onClick={() => dispatch(control, actionOf(value))}
              data-testid={`${testId}-${value}`}
            >
              {nameOf(value)}
            </button>
          );
        })}
      </span>
    </div>
  );
  return (
    <OfficeTaskPane
      title={t("pdf.settingsPane.title")}
      closeLabel={t("common.close")}
      onClose={onClose}
      closeClassName={PDF_TASK_PANE_CLOSE_CLASS}
      testIdPrefix="pdf-text-settings"
      dockRight={false}
      className={pdfTaskPaneClassName("pdf-viewer__settings-pane")}
    >
      <div className={PDF_TASK_PANE_BODY_CLASS}>
        <section className="pdf-viewer__settings-section" data-testid="pdf-text-settings-paragraph">
          <h3 className="pdf-viewer__settings-heading">{labels.paragraph}</h3>
          {choice("pdf-text-settings-alignment", labels.paragraph, ALIGNMENTS, model.alignment,
            (value) => ALIGNMENT_CONTROLS[value],
            (value) => ({ left: labels.alignLeft, center: labels.alignCenter, right: labels.alignRight,
              justify: labels.alignJustify, distributed: labels.alignDistributed })[value],
            (value) => ({ type: "alignment", value }))}
          {numberField({ control: "lineSpacing", label: labels.lineSpacing, value: model.lineSpacing, min: 0, max: 1584, step: 0.5 })}
          {numberField({ control: "spaceBefore", label: labels.spaceBefore, value: model.spaceBefore, min: 0, max: 1584, step: 6 })}
          {numberField({ control: "spaceAfter", label: labels.spaceAfter, value: model.spaceAfter, min: 0, max: 1584, step: 6 })}
          {numberField({ control: "leftIndent", label: labels.leftIndent, value: model.leftIndent, min: 0, max: 1584, step: 1 })}
          {numberField({ control: "rightIndent", label: labels.rightIndent, value: model.rightIndent, min: 0, max: 1584, step: 1 })}
          {numberField({ control: "firstLineIndent", label: labels.firstLineIndent, value: model.firstLineIndent, min: -1584, max: 1584, step: 1 })}
          <button
            type="button"
            className="pdf-viewer__settings-link"
            disabled={!capabilities.tabStops.enabled}
            title={reasonOf("tabStops")}
            onClick={() => dispatch("tabStops", { type: "tabsDialog" })}
            data-testid="pdf-text-settings-tab-stops"
          >
            {labels.tabStops}
          </button>
        </section>
        <section className="pdf-viewer__settings-section" data-testid="pdf-text-settings-box">
          <h3 className="pdf-viewer__settings-heading">{labels.alignText}</h3>
          {choice("pdf-text-settings-vertical-align", labels.alignText, VERTICAL_ALIGNS, model.verticalAlign,
            () => "verticalAlign", (value) => labels.verticalAlignModes[value],
            (value) => ({ type: "verticalAlign", value }))}
          {choice("pdf-text-settings-direction", labels.textDirection, DIRECTIONS, model.textDirection,
            () => "textDirection", (value) => labels.textDirectionModes[value],
            (value) => ({ type: "textDirection", value }))}
          <OfficeRibbonNumberField
            icon={<OfficeSemanticIcon semanticId={"paragraph.spacing.line" as never} />}
            visibleLabel={labels.columns}
            label={labels.columns}
            disabled={!capabilities.columns.enabled}
            disabledReason={reasonOf("columns")}
            min={1}
            max={16}
            step={1}
            mixed={model.columns == null}
            mixedLabel={labels.mixed}
            value={model.columns == null ? "1" : String(model.columns.count)}
            onCommit={(raw) => {
              const count = Math.round(Number(raw));
              if (count >= 1 && count <= 16) dispatch("columns", { type: "columns", count });
            }}
            testId="pdf-text-settings-columns"
          />
        </section>
        <section className="pdf-viewer__settings-section" data-testid="pdf-text-settings-character">
          <h3 className="pdf-viewer__settings-heading">{labels.font}</h3>
          {numberField({ control: "characterSpacing", label: labels.characterSpacing, value: model.characterSpacing, min: -100, max: 100, step: 0.1 })}
          {numberField({ control: "wordSpacing", label: labels.wordSpacing, value: model.wordSpacing, min: -100, max: 100, step: 0.1 })}
          {numberField({ control: "horizontalScale", label: labels.horizontalScale, value: model.horizontalScale, min: 10, max: 500, step: 1, unit: "%" })}
        </section>
      </div>
    </OfficeTaskPane>
  );
}
