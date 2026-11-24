"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useMemo, useRef, useState } from "react";
import { useTranslations } from "../../../../host/next-intl";
import { OfficeDialogShell } from "../../office-ribbon/OfficeDialogShell";
import { officeDialogParts } from "../../office-ribbon/officeDialogChrome";
import type { TocHeading } from "./native-document/tableOfContents";
import {
  builtinCaptionLabelName,
  builtinCaptionLabelSequence,
  captionDocumentLabelSequences,
  captionDisplayLabel,
  captionInSequence,
  isCaptionBuiltinKind,
  type DocCaption,
} from "./native-document/captions";
import type { CrossRefTargetType } from "./native-document/crossReferenceExtension";
import {
  crossRefAllowsIncludePosition,
  crossRefReferenceOptions,
  NUMBERED_ITEM_REFERENCE_OPTIONS,
  type CrossRefReferenceTo,
} from "./native-document/crossReferenceModes";

/**
 * Word's Cross-reference dialog (References > Cross-reference).
 *
 * Word's layout, top to bottom: "Reference type" (Heading, Bookmark,
 * Footnote, Endnote, Equation, Figure, Table — Word also lists "Numbered
 * item", which has no target model here), "Insert reference to" (the list
 * depends on the type, see crossReferenceModes.ts), "Insert as hyperlink"
 * (on by default), "Include above/below" (enabled only for the page-number
 * and number choices), then "For which heading/bookmark/…" — the list of
 * the document's items of that type — and Insert / Cancel. Selecting a row
 * and pressing Insert (or double-clicking the row) inserts the reference.
 *
 * Purely presentational: it reports the choice upward and never touches the
 * editor. Every value is normalized again at the command edge.
 */

export interface CrossReferenceNoteTarget {
  id: string;
  stream: "footnote" | "endnote";
  label: string;
  body: string;
}

export interface CrossReferencePickOptions {
  referenceTo: CrossRefReferenceTo;
  includePosition: boolean;
}

interface CrossReferencePickerProps {
  headings: TocHeading[];
  /** Live write authority; browsing/filtering remains available when false. */
  canInsert?: boolean;
  /** Captioned figures, tables and equations. */
  captions?: DocCaption[];
  /** Named text ranges backed by the native `bookmark` mark. */
  bookmarks?: Array<{ name: string; label: string }>;
  /** Native footnote/endnote markers, numbered from the live document model. */
  notes?: CrossReferenceNoteTarget[];
  /** Numbered paragraphs (Word's "Numbered item" reference type). */
  numberedItems?: Array<{ id: string; number: string; text: string }>;
  /**
   * Insert a reference to a numbered paragraph. Word bookmarks the paragraph
   * and references the bookmark, so the host does both. Same return as onPick.
   */
  onPickNumberedItem?: (
    itemId: string,
    label: string,
    hyperlink: boolean,
    options: CrossReferencePickOptions,
  ) => boolean | void;
  onPick: (
    targetAnchorId: string,
    label: string,
    targetType: CrossRefTargetType,
    hyperlink: boolean,
    options: CrossReferencePickOptions,
    // `true`: a reference was inserted and the dialog stays open, as Word's
    // does (its Cancel button then reads Close).
  ) => boolean | void;
  onClose: () => void;
}

/** Select value prefix of a document caption label's reference type. */
const DOCUMENT_LABEL_TYPE_PREFIX = "document-label:";

/** "Numbered item" is a reference type of the dialog, not of the field. */
type PickerType = CrossRefTargetType | "numberedItem";

/** Word's Reference type list, in its order. */
const REFERENCE_TYPES: readonly PickerType[] = [
  "numberedItem",
  "heading",
  "bookmark",
  "footnote",
  "endnote",
  "equation",
  "figure",
  "table",
];

interface PickerRow {
  id: string;
  label: string;
  display: string;
  level?: number;
  testId: string;
}

/** The i18n key of one "Insert reference to" entry for one type. */
function referenceToKey(
  type: PickerType,
  referenceTo: CrossRefReferenceTo,
): string {
  const noun =
    type === "heading"
      ? "heading"
      : type === "bookmark" || type === "numberedItem"
        ? "paragraph"
        : "";
  switch (referenceTo) {
    case "text":
      return type === "heading"
        ? "crossReference.refTo.headingText"
        : type === "numberedItem"
          ? "crossReference.refTo.paragraphText"
          : type === "bookmark"
          ? "crossReference.refTo.bookmarkText"
          : "crossReference.refTo.entireCaption";
    case "page":
      return "crossReference.refTo.pageNumber";
    case "number":
      return `crossReference.refTo.${noun}Number`;
    case "numberNoContext":
      return `crossReference.refTo.${noun}NumberNoContext`;
    case "numberFullContext":
      return `crossReference.refTo.${noun}NumberFullContext`;
    case "aboveBelow":
      return "crossReference.refTo.aboveBelow";
    case "labelNumber":
      return "crossReference.refTo.labelNumber";
    case "captionText":
      return "crossReference.refTo.captionText";
    case "noteNumber":
      return type === "endnote"
        ? "crossReference.refTo.endnoteNumber"
        : "crossReference.refTo.footnoteNumber";
    case "noteNumberFormatted":
      return type === "endnote"
        ? "crossReference.refTo.endnoteNumberFormatted"
        : "crossReference.refTo.footnoteNumberFormatted";
  }
}

export default function CrossReferencePicker({
  headings,
  canInsert = true,
  captions = [],
  bookmarks = [],
  notes = [],
  numberedItems = [],
  onPickNumberedItem,
  onPick,
  onClose,
}: CrossReferencePickerProps) {
  const t = useTranslations("console-notebooks");
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [type, setType] = useState<PickerType>("heading");
  // Word adds every custom caption label in the document to the Reference
  // type list. A custom label is a caption sequence (`label:<name>`); its
  // references are stored as plain caption ("figure") references, which
  // resolve by the caption's anchor whatever its label.
  // The document's other labels (a custom "Photo", or an English "Figure" in a
  // Chinese session, which is a label of its own there): select values are
  // prefixed so a sequence never collides with a built-in type's value.
  const customLabelTypes = useMemo(
    () =>
      captionDocumentLabelSequences(captions).map((entry) => ({
        value: `${DOCUMENT_LABEL_TYPE_PREFIX}${entry.key}`,
        sequence: entry.key,
        name: entry.name,
      })),
    [captions],
  );
  const [customLabel, setCustomLabel] = useState<string | null>(null);
  const [referenceTo, setReferenceTo] = useState<CrossRefReferenceTo>("text");
  const [hyperlink, setHyperlink] = useState(true);
  const [includePosition, setIncludePosition] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inserted, setInserted] = useState(false);

  const rows = useMemo<PickerRow[]>(() => {
    if (type === "numberedItem") {
      return numberedItems.map((item) => ({
        id: item.id,
        label: item.text,
        display: `${item.number} ${item.text}`,
        testId: "cross-reference-picker-numbered-item",
      }));
    }
    if (type === "heading") {
      return headings.map((heading) => ({
        id: heading.id,
        label: heading.text,
        display: heading.text || t("crossReference.untitledHeading"),
        level: heading.level,
        testId: "cross-reference-picker-item",
      }));
    }
    if (type === "bookmark") {
      return bookmarks.map((bookmark) => ({
        id: bookmark.name,
        label: bookmark.label || bookmark.name,
        display:
          bookmark.label && bookmark.label !== bookmark.name
            ? `${bookmark.name} — ${bookmark.label}`
            : bookmark.name,
        testId: "cross-reference-picker-bookmark-item",
      }));
    }
    if (type === "footnote" || type === "endnote") {
      return notes
        .filter((note) => note.stream === type)
        .map((note) => ({
          id: note.id,
          label: note.label,
          display: note.body ? `${note.label} — ${note.body}` : note.label,
          testId: "cross-reference-picker-note-item",
        }));
    }
    return captions
      .filter((caption) =>
        captionInSequence(
          caption,
          customLabelTypes.find((entry) => entry.value === customLabel)?.sequence ??
            (isCaptionBuiltinKind(type) ? builtinCaptionLabelSequence(type) : type),
        ),
      )
      .map((caption) => {
        const display = captionDisplayLabel(caption);
        return {
          id: caption.id,
          label: display,
          display,
          testId: "cross-reference-picker-caption-item",
        };
      });
  }, [bookmarks, captions, customLabel, customLabelTypes, headings, notes, numberedItems, t, type]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => row.display.toLowerCase().includes(q));
  }, [query, rows]);

  const referenceOptionsFor = (entry: PickerType) =>
    entry === "numberedItem"
      ? NUMBERED_ITEM_REFERENCE_OPTIONS
      : crossRefReferenceOptions(entry);
  const referenceOptions = referenceOptionsFor(type);
  const positionAllowed = crossRefAllowsIncludePosition(referenceTo);
  const selectedRow =
    filtered.find((row) => row.id === selectedId) ?? null;

  const pick = (row: PickerRow | null) => {
    if (!canInsert || !row) return;
    const options = {
      referenceTo,
      includePosition: positionAllowed && includePosition,
    };
    const stayed =
      type === "numberedItem"
        ? onPickNumberedItem?.(row.id, row.label, hyperlink, options)
        : onPick(row.id, row.label, type, hyperlink, options);
    if (stayed === true) setInserted(true);
  };

  const forWhichKey =
    type === "numberedItem"
      ? "crossReference.forWhich_numberedItem"
      : type === "figure" || type === "table" || type === "equation"
      ? "crossReference.forWhich_caption"
      : `crossReference.forWhich_${type}`;

  return (
    <OfficeDialogShell
      open
      title={t("crossReference.pickerTitle")}
      description={t("crossReference.pickerDescription")}
      defaultActionLabel={t("crossReference.insert")}
      cancelActionLabel={t(inserted ? "crossReference.close" : "crossReference.cancel")}
      defaultActionDisabled={!canInsert || !selectedRow}
      onDefaultAction={() => pick(selectedRow)}
      onCancel={onClose}
      initialFocusRef={searchRef}
      testIdPrefix="cross-reference"
      defaultActionTestId="cross-reference-picker-insert"
      cancelActionTestId="cross-reference-picker-close"
    >
      <div className="cross-reference-picker" data-testid="cross-reference-picker">
        <div className={officeDialogParts.row}>
          <label className={officeDialogParts.field}>
            <span className={officeDialogParts.label}>
              {t("crossReference.referenceType")}
            </span>
            <select
              value={customLabel ?? type}
              data-testid="cross-reference-picker-type"
              onChange={(event) => {
                const custom = customLabelTypes.find(
                  (entry) => entry.value === event.target.value,
                );
                const next: PickerType = custom
                  ? "figure"
                  : (event.target.value as PickerType);
                if (!REFERENCE_TYPES.includes(next)) return;
                setCustomLabel(custom ? custom.value : null);
                setType(next);
                setReferenceTo(referenceOptionsFor(next)[0]);
                setIncludePosition(false);
                setSelectedId(null);
              }}
            >
              {REFERENCE_TYPES.map((entry) => (
                <option key={entry} value={entry}>
                  {isCaptionBuiltinKind(entry)
                    ? builtinCaptionLabelName(entry)
                    : t(`crossReference.type_${entry}`)}
                </option>
              ))}
              {customLabelTypes.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
          <label className={officeDialogParts.field}>
            <span className={officeDialogParts.label}>
              {t("crossReference.referenceTo")}
            </span>
            <select
              value={referenceTo}
              data-testid="cross-reference-picker-reference-to"
              onChange={(event) => {
                const next = event.target.value as CrossRefReferenceTo;
                if (!referenceOptions.includes(next)) return;
                setReferenceTo(next);
                if (!crossRefAllowsIncludePosition(next)) {
                  setIncludePosition(false);
                }
              }}
            >
              {referenceOptions.map((entry) => (
                <option key={entry} value={entry}>
                  {t(referenceToKey(type, entry))}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className={officeDialogParts.row}>
          <label className={officeDialogParts.check}>
            <input
              type="checkbox"
              checked={hyperlink}
              disabled={!canInsert}
              onChange={(event) => setHyperlink(event.target.checked)}
              data-testid="cross-reference-picker-hyperlink"
            />
            <span>{t("crossReference.insertAsHyperlink")}</span>
          </label>
          <label className={officeDialogParts.check}>
            <input
              type="checkbox"
              checked={positionAllowed && includePosition}
              disabled={!canInsert || !positionAllowed}
              onChange={(event) => setIncludePosition(event.target.checked)}
              data-testid="cross-reference-picker-include-position"
            />
            <span>{t("crossReference.includePosition")}</span>
          </label>
        </div>
        <label className={officeDialogParts.field}>
          <span className={officeDialogParts.label}>{t(forWhichKey)}</span>
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("reference.searchPlaceholder")}
            className="cross-reference-picker__search"
            data-testid="cross-reference-picker-search"
            data-autofocus
          />
        </label>
        <ul
          className={`${officeDialogParts.list} cross-reference-picker__results`}
          role="listbox"
          aria-label={t(forWhichKey)}
          data-testid="cross-reference-picker-list"
        >
          {filtered.map((row) => (
            <li key={row.id} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={row.id === selectedRow?.id}
                className={`${officeDialogParts.listItem} cross-reference-picker__item${
                  row.level ? ` cross-reference-picker__item--level-${row.level}` : ""
                }`}
                data-level={row.level}
                data-cross-ref-id={row.id}
                disabled={!canInsert}
                onClick={() => setSelectedId(row.id)}
                onDoubleClick={() => pick(row)}
                data-testid={row.testId}
              >
                {row.display}
              </button>
            </li>
          ))}
          {filtered.length === 0 ? (
            <li
              className="cross-reference-picker__empty"
              data-testid="cross-reference-picker-empty"
            >
              {type === "heading"
                ? t("crossReference.noHeadings")
                : t("crossReference.noItemsOfType")}
            </li>
          ) : null}
        </ul>
      </div>
    </OfficeDialogShell>
  );
}
