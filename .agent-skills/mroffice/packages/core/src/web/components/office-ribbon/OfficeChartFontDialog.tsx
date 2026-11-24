"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A chart's Font dialog (Excel and PowerPoint: right-click the chart ▸
 * Font...), one for every editor that draws a chart. Two pages, as Office
 * lays them out: Font -- the same page Word's Font dialog shows
 * (`DocumentFontDialogFontPage`), with DrawingML's Offset and Equalize
 * Character Height in place of Word's Hidden -- and Character Spacing
 * (Spacing Normal / Expanded / Condensed By points; Kerning for fonts N
 * Points and above). OK writes the fields the author changed over the
 * chart's own text (`lib/office-charts/chart-font-dialog`); the host commits
 * that text the way its Home ▸ Font group does.
 */

import { useRef, useState } from "react";
import { useTranslations } from "../../../host/next-intl";

import DocumentFontDialogFontPage, {
  type DocumentFontPageDraft,
  type DocumentFontPageEffects,
  type FontDialogStyle,
  type FontDialogUnderline,
} from "../console/editor/native-document/DocumentFontDialogFontPage";
import { UNDERLINE_STYLE_VALUES } from "../console/editor/native-document/underlineExtension";
import { OfficeDialogShell } from "./OfficeDialogShell";
import { officeFontSizeOptions } from "./officeFontSizeCatalog";
import {
  OFFICE_CJK_FONT_FAMILY_VALUES,
  OFFICE_FONT_FAMILY_VALUES,
  officeFontFamilyLabels,
} from "./officeTypographyCatalog";
import { ribbonFontFamilyLabel } from "./RibbonFontFamilyPicker";
import { primaryOfficeFontFace } from "./officeFontFace";
import {
  changeOfficeChartFontDraft,
  officeChartFontDraft,
  officeChartTextFromFontDraft,
  type OfficeChartFontDraft,
  type OfficeChartFontDraftField,
  type OfficeChartFontDraftProblem,
  type OfficeChartFontSpacing,
} from "../../lib/office-charts/chart-font-dialog";
import type { OfficeChartText } from "../../lib/office-charts/chart-text";

export interface OfficeChartFontDialogProps {
  readonly open: boolean;
  /** The text OK writes over: the chart's own (`format.text`), or the
   * element's own when the dialog opened on an element (the legend, the
   * title). */
  readonly text: OfficeChartText | undefined;
  /** What the fields show when it is not `text`: an element's text with
   * what it inherits from the chart (`officeChartFontDialogText`). */
  readonly shown?: OfficeChartText;
  /** The face the chart draws with when its text names none. */
  readonly defaultFace: string;
  /** The colour Automatic draws in (the preview's). */
  readonly automaticColor?: string;
  readonly paletteId?: string;
  readonly recentColors?: readonly string[];
  /** Commits the text OK writes; false keeps the dialog open. */
  readonly onApply: (text: OfficeChartText | undefined) => boolean;
  readonly onCancel: () => void;
  /** Every control's test id starts with it. */
  readonly testIdPrefix: string;
  readonly container?: HTMLElement | null;
}

type Tab = "font" | "spacing";

/** The catalogue's stacks, with the chart's own face first when it is not one of them. */
function familyOptions(
  stacks: readonly string[],
  own: string | null,
  labels: Readonly<Record<string, string>>,
): { value: string; label: string }[] {
  const options = stacks.map((stack) => ({ value: stack, label: ribbonFontFamilyLabel(stack, labels) }));
  if (own && !stacks.includes(own) && !stacks.some((stack) => primaryOfficeFontFace(stack) === own)) {
    options.unshift({ value: own, label: own });
  }
  return options;
}

/** The option a stated face shows as (its catalogue stack when it has one). */
function familyValue(stacks: readonly string[], face: string | null): string | null {
  if (!face) return null;
  return stacks.find((stack) => primaryOfficeFontFace(stack) === face) ?? face;
}

export function OfficeChartFontDialog(props: OfficeChartFontDialogProps): React.JSX.Element | null {
  if (!props.open) return null;
  return <OfficeChartFontDialogBody {...props} />;
}

function OfficeChartFontDialogBody({
  text,
  shown,
  defaultFace,
  automaticColor = "#595959",
  paletteId,
  recentColors,
  onApply,
  onCancel,
  testIdPrefix,
  container,
}: OfficeChartFontDialogProps): React.JSX.Element {
  const t = useTranslations("console-notebooks");
  const word = (key: string) => t(key as Parameters<typeof t>[0]);
  const [draft, setDraft] = useState<OfficeChartFontDraft>(() => officeChartFontDraft(shown ?? text));
  // The latest draft, so two changes from one control (Font style is bold
  // and italic) build on each other within the same event.
  const draftRef = useRef(draft);
  const [touched, setTouched] = useState<ReadonlySet<OfficeChartFontDraftField>>(() => new Set());
  const [tab, setTab] = useState<Tab>("font");
  const [problem, setProblem] = useState<OfficeChartFontDraftProblem | null>(null);
  const initialFocusRef = useRef<HTMLInputElement | null>(null);
  const latinStacks = OFFICE_FONT_FAMILY_VALUES.filter(
    (stack) => !(OFFICE_CJK_FONT_FAMILY_VALUES as readonly string[]).includes(stack),
  );
  const labels = officeFontFamilyLabels(word);

  const change = <K extends OfficeChartFontDraftField>(field: K, value: OfficeChartFontDraft[K]) => {
    setProblem(null);
    const result = changeOfficeChartFontDraft(draftRef.current, field, value);
    draftRef.current = result.draft;
    setDraft(result.draft);
    setTouched((previous) => new Set([...previous, ...result.touched]));
  };

  const pageDraft: DocumentFontPageDraft = {
    family: familyValue(latinStacks, draft.family),
    cjkFamily: familyValue(OFFICE_CJK_FONT_FAMILY_VALUES, draft.asianFamily),
    style: (draft.bold && draft.italic
      ? "boldItalic"
      : draft.bold
        ? "bold"
        : draft.italic
          ? "italic"
          : "regular") as FontDialogStyle,
    sizePt: draft.sizePt,
    color: draft.color,
    underline: draft.underline as FontDialogUnderline,
    underlineColor: draft.underlineColor,
    superscript: draft.superscript,
    subscript: draft.subscript,
  };
  const effects: DocumentFontPageEffects = {
    strike: draft.strike,
    doubleStrike: draft.doubleStrike,
    smallCaps: draft.smallCaps,
    allCaps: draft.allCaps,
    hidden: false,
  };
  const problemMessage = problem
    ? word(
        {
          size: "office.chartFontDialog.invalidSize",
          offset: "office.chartFontDialog.invalidOffset",
          spacing: "office.chartFontDialog.invalidSpacing",
          kerning: "office.chartFontDialog.invalidKerning",
        }[problem],
      )
    : null;

  const apply = () => {
    const result = officeChartTextFromFontDraft(text, draft, touched, defaultFace);
    if ("problem" in result) {
      setProblem(result.problem);
      setTab(result.problem === "spacing" || result.problem === "kerning" ? "spacing" : "font");
      return;
    }
    if (touched.size === 0 || onApply(result.text)) onCancel();
  };

  return (
    <OfficeDialogShell
      open
      testIdPrefix={testIdPrefix}
      title={word("toolbar.fontDialogTitle")}
      description=""
      defaultActionLabel={word("toolbar.dialogOk")}
      defaultActionTestId={`${testIdPrefix}-apply`}
      cancelActionLabel={word("toolbar.pageSetupCancel")}
      cancelActionTestId={`${testIdPrefix}-cancel`}
      overlayTestId={`${testIdPrefix}-layer`}
      onDefaultAction={apply}
      onCancel={onCancel}
      initialFocusRef={initialFocusRef}
      container={container}
      className="note-editor-font-dialog sm:max-w-[680px]"
      bodyClassName="note-editor-dialog-scroll"
      footerStart={
        problemMessage ? (
          <span role="alert" className="office-dialog__error" data-testid={`${testIdPrefix}-problem`}>
            {problemMessage}
          </span>
        ) : undefined
      }
      tabStrip={
        <div className="office-dialog__tabs" role="tablist" aria-label={word("toolbar.fontDialogTitle")}>
          {(
            [
              ["font", word("toolbar.fontTabFont")],
              ["spacing", word("toolbar.fontSectionCharacterSpacing")],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              id={`${testIdPrefix}-tab-${id}`}
              type="button"
              role="tab"
              aria-selected={tab === id}
              aria-controls={`${testIdPrefix}-page-${id}`}
              className="office-dialog__tab"
              data-testid={`${testIdPrefix}-tab-${id}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
      }
    >
      <div
        id={`${testIdPrefix}-page-font`}
        className="note-editor-font-dialog__page"
        role="tabpanel"
        aria-labelledby={`${testIdPrefix}-tab-font`}
        hidden={tab !== "font"}
      >
        <DocumentFontDialogFontPage
          draft={pageDraft}
          onDraftChange={(field, value) => {
            switch (field) {
              case "family":
                change("family", (value as string | null) || null);
                break;
              case "cjkFamily":
                change("asianFamily", (value as string | null) || null);
                break;
              case "style": {
                const style = value as FontDialogStyle;
                change("bold", style === "bold" || style === "boldItalic");
                change("italic", style === "italic" || style === "boldItalic");
                break;
              }
              case "sizePt":
                change("sizePt", String(value ?? ""));
                break;
              case "color":
                change("color", (value as string | null) || null);
                break;
              case "underline":
                change("underline", (value || "none") as OfficeChartFontDraft["underline"]);
                break;
              case "underlineColor":
                change("underlineColor", (value as string | null) || null);
                break;
              case "superscript":
              case "subscript":
                change(field, value === true);
                break;
            }
          }}
          effects={effects}
          onEffectChange={(effect, checked) => {
            if (effect === "strike" || effect === "doubleStrike" || effect === "smallCaps" || effect === "allCaps") {
              change(effect, checked);
            }
          }}
          drawingEffects={{
            offset: draft.offset,
            offsetLabel: word("office.chartFontDialog.offset"),
            onOffsetChange: (value) => change("offset", value),
            equalizeHeight: draft.equalizeHeight,
            equalizeHeightLabel: word("office.chartFontDialog.equalizeHeight"),
            onEqualizeHeightChange: (checked) => change("equalizeHeight", checked),
          }}
          latinFamilies={familyOptions(latinStacks, draft.family, labels)}
          asianFamilies={familyOptions(OFFICE_CJK_FONT_FAMILY_VALUES, draft.asianFamily, labels)}
          documentDefaultFamily={defaultFace}
          documentDefaultFamilyCss={defaultFace}
          sizeOptions={officeFontSizeOptions("word")}
          normalizeSizePt={(raw) => {
            const value = Number(raw.trim().replace(/pt$/i, ""));
            return Number.isFinite(value) && value >= 1 && value <= 400 ? String(Math.round(value * 2) / 2) : null;
          }}
          paletteId={paletteId}
          recentColors={recentColors}
          previewText=""
          automaticColor={automaticColor}
          initialFocusRef={tab === "font" ? initialFocusRef : undefined}
          labels={{
            sectionFont: word("toolbar.fontDialogSectionFont"),
            latinFamily: word("toolbar.fontDialogLatinFamily"),
            asianFamily: word("toolbar.fontDialogAsianFamily"),
            style: word("toolbar.fontDialogStyle"),
            size: word("toolbar.fontSize"),
            sectionColor: word("toolbar.fontDialogSectionColor"),
            color: word("toolbar.textColor"),
            underlineStyle: word("toolbar.underlineStyleLabel"),
            underlineColor: word("toolbar.underlineColorLabel"),
            sectionEffects: word("toolbar.fontSectionEffects"),
            strike: word("toolbar.strikethrough"),
            doubleStrike: word("toolbar.doubleStrikethrough"),
            superscript: word("toolbar.superscript"),
            subscript: word("toolbar.subscript"),
            smallCaps: word("toolbar.smallCaps"),
            allCaps: word("toolbar.allCaps"),
            hidden: "",
            preview: word("toolbar.fontDialogPreview"),
            previewSample: word("toolbar.fontDialogPreviewSample"),
            setAsDefault: "",
            setAsDefaultHint: "",
            mixed: word("toolbar.fontPickerMixed"),
            documentDefault: word("office.chartFontDialog.chartDefault"),
            followLatin: word("toolbar.fontDialogFollowLatin"),
            automatic: word("toolbar.textColorAutomatic"),
            styleValue: Object.fromEntries(
              (["regular", "italic", "bold", "boldItalic"] as const).map((style) => [
                style,
                word(`toolbar.fontDialogStyleValue.${style}`),
              ]),
            ) as Record<FontDialogStyle, string>,
            underlineValue: Object.fromEntries(
              (["none", ...UNDERLINE_STYLE_VALUES] as const).map((style) => [
                style,
                word(`toolbar.underlineStyleValue.${style}`),
              ]),
            ) as Record<FontDialogUnderline, string>,
            themeColors: word("toolbar.themeColors"),
            standardColors: word("toolbar.standardColors"),
            recentColors: word("spreadsheet.recentColors"),
            moreColors: word("toolbar.textColorCustom"),
          }}
        />
      </div>
      <div
        id={`${testIdPrefix}-page-spacing`}
        className="note-editor-font-dialog__page"
        role="tabpanel"
        aria-labelledby={`${testIdPrefix}-tab-spacing`}
        hidden={tab !== "spacing"}
      >
        <section className="office-dialog__group">
          <h3>{word("toolbar.fontSectionCharacterSpacing")}</h3>
          <div className="note-editor-font-dialog__grid">
            <label className="office-dialog__field">
              {word("office.chartFontDialog.spacing")}
              <select
                data-testid={`${testIdPrefix}-spacing`}
                value={draft.spacing}
                onChange={(event) => change("spacing", event.target.value as OfficeChartFontSpacing)}
              >
                <option value="normal">{word("office.chartFontDialog.spacingNormal")}</option>
                <option value="expanded">{word("office.chartFontDialog.spacingExpanded")}</option>
                <option value="condensed">{word("office.chartFontDialog.spacingCondensed")}</option>
              </select>
            </label>
            <label className="office-dialog__field">
              {word("office.chartFontDialog.by")}
              <input
                type="number"
                min={0}
                max={1584}
                step="0.1"
                data-testid={`${testIdPrefix}-spacing-by`}
                disabled={draft.spacing === "normal"}
                value={draft.spacingBy}
                placeholder="0"
                onChange={(event) => change("spacingBy", event.target.value)}
              />
            </label>
            <div className="office-dialog__field">
              <label className="office-dialog__check">
                <input
                  type="checkbox"
                  data-testid={`${testIdPrefix}-kerning`}
                  checked={draft.kerning}
                  onChange={(event) => change("kerning", event.target.checked)}
                />
                {word("toolbar.kerningThreshold")}
              </label>
              <input
                type="number"
                min={1}
                max={1584}
                step="0.5"
                aria-label={word("office.chartFontDialog.pointsAndAbove")}
                data-testid={`${testIdPrefix}-kerning-pt`}
                disabled={!draft.kerning}
                value={draft.kerningPt}
                onChange={(event) => change("kerningPt", event.target.value)}
              />
              <span>{word("office.chartFontDialog.pointsAndAbove")}</span>
            </div>
          </div>
        </section>
      </div>
    </OfficeDialogShell>
  );
}
