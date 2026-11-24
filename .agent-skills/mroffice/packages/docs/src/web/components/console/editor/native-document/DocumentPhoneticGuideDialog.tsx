"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word's Phonetic Guide dialog (Home > Font > Phonetic Guide, "拼音指南").
 *
 * Base text / Ruby text rows, one per group of the selection, with Group and
 * Mono to regroup them, Clear Reading, Default Reading and Remove All;
 * Alignment, Offset, Font and Size for the guide; a Preview of the result.
 * The row model and the `w:rubyPr` mapping are in rubyProperties.ts; the
 * caller owns the editor transaction (phoneticGuideCommands.ts).
 *
 * Word opens the dialog with default readings filled in and Default Reading
 * puts them back (phoneticGuideReadings.ts: pinyin with tone marks for
 * Chinese, read in context). Readings the text already carries are kept on
 * opening. Until the pinyin data has loaded, or where it cannot, Default
 * Reading restores the readings the text carried when the dialog opened.
 *
 * One documented difference from Word desktop: the Base text boxes are
 * read-only: a row regroups the document's own text, it never retypes it.
 */

import { graphemeClusters } from "@mrnote/core/web/lib/document-word-count.ts";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import {
  OFFICE_FONT_FAMILY_LABELS,
  OFFICE_FONT_FAMILY_VALUES,
  OFFICE_FONT_SIZE_POINTS,
  officePrimaryFontFamily,
} from "@mrnote/core/web/components/office-ribbon/officeTypographyCatalog.ts";

import { DocumentDialogIcon } from "@mrnote/core/web/components/console/editor/native-document/DocumentDialogIcon.tsx";
import {
  DOCUMENT_RUBY_ALIGN_VALUES,
  documentRubyCssAlign,
  groupPhoneticGuideSegments,
  monoPhoneticGuideSegments,
  normalizeRubyFontSize,
  normalizeRubyOffset,
  type DocumentRubyAlign,
  type DocumentRubyProperties,
  type PhoneticGuideSegment,
} from "./rubyProperties";
import {
  loadPinyinReadingProvider,
  phoneticGuideSegmentsWithDefaultReadings,
  type PhoneticReadingProvider,
} from "./phoneticGuideReadings";

/** Word's Offset box runs 0-100 pt. */
export const MAX_PHONETIC_GUIDE_DIALOG_OFFSET = 100;

export interface DocumentPhoneticGuideDialogProps {
  readonly open: boolean;
  readonly segments: readonly PhoneticGuideSegment[];
  readonly properties: DocumentRubyProperties;
  /** Size of the text the guide sits over, pt (Word: the guide defaults to half). */
  readonly baseFontSize: number;
  readonly hasGuides: boolean;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
  readonly onApply: (
    segments: readonly PhoneticGuideSegment[],
    properties: DocumentRubyProperties,
  ) => boolean;
  readonly onRemoveAll: () => boolean;
  readonly onClose: () => void;
}

// Group, Mono, Clear Reading and Default Reading, each with its picture.
const PHONETIC_GUIDE_BUTTON_ICON = {
  group: "object.group",
  mono: "object.ungroup",
  "clear-reading": "format.clear",
  "default-reading": "action.reset",
} as const;

function halfPoint(value: number): number {
  return Math.round(value * 2) / 2;
}

function formatPoints(value: number): string {
  return String(halfPoint(value));
}

export function DocumentPhoneticGuideDialog({
  open,
  segments: initialSegments,
  properties,
  baseFontSize,
  hasGuides,
  returnFocusRef,
  onApply,
  onRemoveAll,
  onClose,
}: DocumentPhoneticGuideDialogProps): React.JSX.Element {
  const t = useTranslations("console-notebooks");
  const [segments, setSegments] = useState<readonly PhoneticGuideSegment[]>(
    initialSegments,
  );
  const [align, setAlign] = useState<DocumentRubyAlign>(
    properties.align ?? "center",
  );
  const [offset, setOffset] = useState(formatPoints(properties.offset ?? 0));
  const [fontFamily, setFontFamily] = useState(properties.fontFamily ?? "");
  const [fontSize, setFontSize] = useState(
    formatPoints(properties.fontSize ?? Math.max(1, baseFontSize / 2)),
  );
  const [error, setError] = useState<string | null>(null);
  const firstRubyRef = useRef<HTMLInputElement | null>(null);
  const [readingProvider, setReadingProvider] =
    useState<PhoneticReadingProvider | null>(null);
  // A reading the user has typed is never overwritten by the late fill.
  const editedRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    let live = true;
    loadPinyinReadingProvider().then(
      (provider) => {
        if (!live) return;
        setReadingProvider(() => provider);
        if (!editedRef.current) {
          setSegments((current) =>
            phoneticGuideSegmentsWithDefaultReadings(current, provider, "empty"),
          );
        }
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [open]);

  const rows = useMemo(
    () =>
      segments
        .map((segment, index) => ({ segment, index }))
        .filter(
          (
            entry,
          ): entry is {
            segment: Extract<PhoneticGuideSegment, { kind: "row" }>;
            index: number;
          } => entry.segment.kind === "row",
        ),
    [segments],
  );

  const parsedSize = normalizeRubyFontSize(Number(fontSize));
  const parsedOffset = normalizeRubyOffset(Number(offset));
  // Word's Offset box writes 0-100 pt. A guide that came with a smaller
  // raise than its own text (a negative offset here) is a legal file value
  // the model keeps; left as it is, it stays valid, so the reading can be
  
  const initialOffset = halfPoint(properties.offset ?? 0);
  const offsetInRange =
    parsedOffset !== null &&
    ((parsedOffset >= 0 && parsedOffset <= MAX_PHONETIC_GUIDE_DIALOG_OFFSET) ||
      parsedOffset === initialOffset);
  const valid = parsedSize !== null && offsetInRange;

  const fontChoices = useMemo(() => {
    const names = OFFICE_FONT_FAMILY_VALUES.map((stack) => ({
      name: officePrimaryFontFamily(stack),
      label: OFFICE_FONT_FAMILY_LABELS[stack] ?? officePrimaryFontFamily(stack),
    })).filter((entry) => entry.name !== "system-ui");
    if (fontFamily && !names.some((entry) => entry.name === fontFamily)) {
      names.unshift({ name: fontFamily, label: fontFamily });
    }
    return names;
  }, [fontFamily]);

  const setReading = useCallback((index: number, ruby: string) => {
    editedRef.current = true;
    setSegments((current) =>
      current.map((segment, position) =>
        position === index && segment.kind === "row"
          ? { ...segment, ruby }
          : segment,
      ),
    );
    setError(null);
  }, []);

  const submit = useCallback(() => {
    if (!valid || parsedSize === null || parsedOffset === null) {
      setError(t("toolbar.phoneticGuide.invalid"));
      return;
    }
    const applied = onApply(segments, {
      align,
      fontSize: parsedSize,
      offset: parsedOffset,
      baseFontSize: normalizeRubyFontSize(halfPoint(baseFontSize)),
      fontFamily: fontFamily || null,
    });
    if (!applied) {
      setError(t("toolbar.phoneticGuide.stale"));
      return;
    }
    onClose();
  }, [
    align,
    baseFontSize,
    fontFamily,
    onApply,
    onClose,
    parsedOffset,
    parsedSize,
    segments,
    t,
    valid,
  ]);

  const previewStyle = {
    rubyAlign: documentRubyCssAlign(align),
    fontSize: `${baseFontSize}pt`,
    fontFamily: "inherit",
  } as React.CSSProperties;
  const previewTextStyle: React.CSSProperties = {
    fontSize: `${parsedSize ?? baseFontSize / 2}pt`,
    fontFamily: fontFamily ? `"${fontFamily.replace(/["\\]/g, "")}"` : undefined,
    paddingBottom: parsedOffset ? `${parsedOffset}pt` : undefined,
    textAlign:
      align === "left" ? "start" : align === "right" || align === "rightVertical" ? "end" : undefined,
  };

  const button = (
    testId: keyof typeof PHONETIC_GUIDE_BUTTON_ICON,
    label: string,
    onClick: () => void,
    disabled = false,
  ) => (
    <button
      type="button"
      className={officeDialogParts.compactButton}
      data-testid={`document-phonetic-guide-${testId}`}
      disabled={disabled}
      onClick={onClick}
    >
      <DocumentDialogIcon icon={PHONETIC_GUIDE_BUTTON_ICON[testId]} />
      {label}
    </button>
  );

  return (
    <OfficeDialogShell
      open={open}
      title={t("toolbar.phoneticGuide.title")}
      description={t("toolbar.phoneticGuide.description")}
      defaultActionLabel={t("toolbar.phoneticGuide.ok")}
      cancelActionLabel={t("toolbar.phoneticGuide.cancel")}
      defaultActionDisabled={!valid}
      onDefaultAction={submit}
      onCancel={onClose}
      initialFocusRef={firstRubyRef}
      returnFocusRef={returnFocusRef}
      testIdPrefix="document-phonetic-guide"
      // The rows, the Group/Mono column and the settings need about 560 px;
      // the shell's default 520 px card (padding included) is narrower than
      // its content, which then ran past the card's right edge.
      className="sm:max-w-[620px]"
      footerStart={
        <button
          type="button"
          className={officeDialogParts.button}
          data-testid="document-phonetic-guide-remove-all"
          disabled={!hasGuides}
          onClick={() => {
            if (onRemoveAll()) onClose();
            else setError(t("toolbar.phoneticGuide.stale"));
          }}
        >
          <DocumentDialogIcon icon="edit.delete" />
          {t("toolbar.phoneticGuide.removeAll")}
        </button>
      }
    >
      <div
        data-testid="document-phonetic-guide-content"
        style={{ display: "grid", gap: 12, minWidth: 0 }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12 }}>
          <div
            role="table"
            aria-label={t("toolbar.phoneticGuide.title")}
            style={{ display: "grid", gap: 6, maxHeight: 240, overflowY: "auto" }}
          >
            <div role="row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <span role="columnheader" className={officeDialogParts.label}>
                {t("toolbar.phoneticGuide.baseText")}
              </span>
              <span role="columnheader" className={officeDialogParts.label}>
                {t("toolbar.phoneticGuide.rubyText")}
              </span>
            </div>
            {rows.map(({ segment, index }, rowIndex) => (
              <div
                key={`${index}:${segment.base}`}
                role="row"
                data-testid="document-phonetic-guide-row"
                style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}
              >
                <input
                  type="text"
                  readOnly
                  value={segment.base}
                  aria-label={`${t("toolbar.phoneticGuide.baseText")} ${rowIndex + 1}`}
                  data-testid={`document-phonetic-guide-base-${rowIndex}`}
                />
                <input
                  ref={rowIndex === 0 ? firstRubyRef : undefined}
                  type="text"
                  value={segment.ruby}
                  maxLength={300}
                  spellCheck={false}
                  autoComplete="off"
                  aria-label={`${t("toolbar.phoneticGuide.rubyText")} ${rowIndex + 1}`}
                  data-testid={`document-phonetic-guide-ruby-${rowIndex}`}
                  onChange={(event) => setReading(index, event.target.value)}
                />
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gap: 6, alignContent: "start", paddingTop: 22 }}>
            {button("group", t("toolbar.phoneticGuide.group"), () =>
              setSegments((current) => groupPhoneticGuideSegments(current)),
              rows.length < 2,
            )}
            {button("mono", t("toolbar.phoneticGuide.mono"), () =>
              setSegments((current) => monoPhoneticGuideSegments(current)),
              rows.every((row) => graphemeClusters(row.segment.base).length < 2),
            )}
            {button("clear-reading", t("toolbar.phoneticGuide.clearReading"), () => {
              editedRef.current = true;
              setSegments((current) =>
                current.map((segment) =>
                  segment.kind === "row" ? { ...segment, ruby: "" } : segment,
                ),
              );
            })}
            {button("default-reading", t("toolbar.phoneticGuide.defaultReading"), () => {
              setSegments((current) =>
                readingProvider
                  ? phoneticGuideSegmentsWithDefaultReadings(
                      current,
                      readingProvider,
                      "all",
                    )
                  : initialSegments,
              );
              setError(null);
            })}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
          <label className={officeDialogParts.field}>
            <span className={officeDialogParts.label}>
              {t("toolbar.phoneticGuide.alignment")}
            </span>
            <select
              value={align}
              data-testid="document-phonetic-guide-align"
              onChange={(event) => setAlign(event.target.value as DocumentRubyAlign)}
            >
              {DOCUMENT_RUBY_ALIGN_VALUES.map((value) => (
                <option key={value} value={value}>
                  {t(`toolbar.phoneticGuide.align.${value}` as "toolbar.phoneticGuide.align.center")}
                </option>
              ))}
            </select>
          </label>
          <label className={officeDialogParts.field}>
            <span className={officeDialogParts.label}>
              {t("toolbar.phoneticGuide.offset")} ({t("toolbar.phoneticGuide.points")})
            </span>
            <input
              type="number"
              min={0}
              max={MAX_PHONETIC_GUIDE_DIALOG_OFFSET}
              step={0.5}
              value={offset}
              data-testid="document-phonetic-guide-offset"
              onChange={(event) => {
                setOffset(event.target.value);
                setError(null);
              }}
            />
          </label>
          <label className={officeDialogParts.field}>
            <span className={officeDialogParts.label}>
              {t("toolbar.phoneticGuide.font")}
            </span>
            <select
              value={fontFamily}
              data-testid="document-phonetic-guide-font"
              onChange={(event) => setFontFamily(event.target.value)}
            >
              <option value="">{t("toolbar.phoneticGuide.fontSameAsText")}</option>
              {fontChoices.map((entry) => (
                <option key={entry.name} value={entry.name}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          <label className={officeDialogParts.field}>
            <span className={officeDialogParts.label}>
              {t("toolbar.phoneticGuide.size")} ({t("toolbar.phoneticGuide.points")})
            </span>
            <input
              type="number"
              list="document-phonetic-guide-sizes"
              min={1}
              max={1638}
              step={0.5}
              value={fontSize}
              data-testid="document-phonetic-guide-size"
              onChange={(event) => {
                setFontSize(event.target.value);
                setError(null);
              }}
            />
            <datalist id="document-phonetic-guide-sizes">
              {OFFICE_FONT_SIZE_POINTS.map((size) => (
                <option key={size} value={size} />
              ))}
            </datalist>
          </label>
        </div>

        <div className={officeDialogParts.field}>
          <span className={officeDialogParts.label}>
            {t("toolbar.phoneticGuide.preview")}
          </span>
          <div
            className={officeDialogParts.well}
            data-testid="document-phonetic-guide-preview"
            style={{ minHeight: 56, padding: "10px 12px", overflowX: "auto", whiteSpace: "nowrap" }}
          >
            {segments.map((segment, index) =>
              segment.kind === "gap" ? (
                <span key={index}>{segment.text}</span>
              ) : segment.ruby.trim() ? (
                <ruby key={index} style={previewStyle}>
                  {segment.base}
                  <rt style={previewTextStyle}>{segment.ruby}</rt>
                </ruby>
              ) : (
                <span key={index} style={{ fontSize: `${baseFontSize}pt` }}>
                  {segment.base}
                </span>
              ),
            )}
          </div>
        </div>

        {error ? (
          <p
            role="alert"
            className={officeDialogParts.error}
            data-testid="document-phonetic-guide-error"
          >
            {error}
          </p>
        ) : null}
      </div>
    </OfficeDialogShell>
  );
}
