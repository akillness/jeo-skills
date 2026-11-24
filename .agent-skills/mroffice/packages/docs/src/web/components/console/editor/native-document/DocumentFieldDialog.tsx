"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useMemo, useRef, useState, type RefObject } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { moveListboxSelection } from "@mrnote/core/web/lib/listbox-arrow-keys.ts";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as parts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { documentValueInputClassName } from "@mrnote/core/web/components/console/editor/documentValueInput.ts";
import { DocumentFieldIcon } from "./DocumentFieldIcon";
import { documentDateTimeLocaleForPicture } from "@mrnote/core/web/components/console/editor/native-document/documentDateTime.ts";
import {
  DEFAULT_DOCUMENT_FIELD_FORMAT,
  createDocumentFieldAttrs,
  documentFieldFormats,
  type DocumentFieldOptions,
  type DocumentFieldType,
} from "@mrnote/core/web/components/console/editor/native-document/documentFieldValues.ts";
import {
  WORD_CODE_FIELDS,
  documentFieldAttrsFromCode,
  documentFieldCodeError,
  type DocumentFieldCodeContext,
  type WordCodeField,
} from "./documentFieldCodes";
import styles from "./DocumentFieldDialog.module.css";

/**
 * Word's Field dialog (Insert > Field on the Mac, Insert > Quick Parts >
 * Field on Windows): a Categories list, the Field names it holds, the
 * chosen field's description, its properties and options, and the field
 * code they make (Microsoft Support, "Insert, edit, and view fields in
 * Word"; "List of field codes in Word"). Fields whose operand is something
 * in the document -- a bookmark, a source, a recipient column -- take it
 * in the picker Word's own command for them opens (Cross-reference,
 * Citation, Insert Merge Field); a table of contents, an index and a table
 * of authorities go in with their defaults and are changed from the
 * References tab, as Word's Field dialog sends them to those dialogs.
 */

/** Every field type Word's dialog can insert (a kept foreign field cannot). */
export type DocumentFieldInsertType = Exclude<DocumentFieldType, "NATIVE">;

/** Word's category for each field (its Field dialog's Categories list). */
export const DOCUMENT_FIELD_CATEGORIES = [
  ["dateTime", ["DATE", "TIME"]],
  ["documentInfo", ["AUTHOR", "FILENAME", "NUMPAGES", "TITLE"]],
  ["equationsFormulas", []],
  ["indexTables", ["INDEX", "TOA", "TOC"]],
  ["linksReferences", ["CITATION", "NOTEREF", "PAGEREF", "REF", "STYLEREF"]],
  ["mailMerge", ["IF", "MERGEFIELD"]],
  ["numbering", ["PAGE", "SEQ"]],
  ["userInfo", []],
] as const satisfies readonly (readonly [string, readonly DocumentFieldInsertType[]])[];

export type DocumentFieldCategory = (typeof DOCUMENT_FIELD_CATEGORIES)[number][0] | "all";

/** The field names as Word's list spells them. */
const WORD_FIELD_NAMES: Record<DocumentFieldInsertType, string> = {
  AUTHOR: "Author",
  CITATION: "Citation",
  DATE: "Date",
  FILENAME: "FileName",
  IF: "If",
  INDEX: "Index",
  MERGEFIELD: "MergeField",
  NOTEREF: "NoteRef",
  NUMPAGES: "NumPages",
  PAGE: "Page",
  PAGEREF: "PageRef",
  REF: "Ref",
  SEQ: "Seq",
  STYLEREF: "StyleRef",
  TITLE: "Title",
  TOA: "TOA",
  TOC: "TOC",
  TIME: "Time",
};

/** Every field the dialog offers, in Word's (All) order: by name. */
export const DOCUMENT_FIELD_DIALOG_TYPES: readonly DocumentFieldInsertType[] = (
  Object.keys(WORD_FIELD_NAMES) as DocumentFieldInsertType[]
).sort((a, b) => WORD_FIELD_NAMES[a].localeCompare(WORD_FIELD_NAMES[b], "en"));

/** Fields whose operand is chosen in the picker of Word's own command. */
export const DOCUMENT_FIELD_PICKER_TYPES = new Set<DocumentFieldType>([
  "REF",
  "PAGEREF",
  "NOTEREF",
  "CITATION",
  "MERGEFIELD",
]);

/** Fields that go in with their defaults and are edited from References. */
const DEFAULTS_TYPES = new Set<DocumentFieldType>(["TOC", "INDEX", "TOA"]);

/** A number format's sample, in the format itself (Word's Format list). */
const NUMBER_FORMAT_SAMPLES: Record<string, string> = {
  Arabic: "1, 2, 3, …",
  Roman: "I, II, III, …",
  roman: "i, ii, iii, …",
  Alphabetic: "A, B, C, …",
  alphabetic: "a, b, c, …",
};

const HEADING_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export interface DocumentFieldDialogInsert {
  readonly fieldType: DocumentFieldInsertType;
  readonly format: string;
  readonly options: DocumentFieldOptions;
  /** The Field codes box, when the field is its typed code. */
  readonly code?: string;
}

/** A row of the Field names list: a field the editor models, or one of
 * Word's own fields that goes in by its code. */
type FieldNameRow =
  | { readonly kind: "modeled"; readonly type: DocumentFieldInsertType; readonly name: string }
  | { readonly kind: "code"; readonly field: WordCodeField; readonly name: string };

const CODE_FIELD_KEYS: Record<string, string> = { "=": "formula" };
const codeFieldKey = (field: WordCodeField): string =>
  CODE_FIELD_KEYS[field.name] ?? field.name.toLowerCase();

/** A code's keyword as Word reads it: `=` or the first word, upper-cased. */
function fieldCodeKeyword(code: string): string {
  return (/^\s*(=|[A-Za-z]+)/.exec(code)?.[1] ?? "").toUpperCase();
}

/**
 * The Field names row a code belongs to: the field the editor models by
 * that keyword, or Word's own field with it; null when the list has none.
 * Editing a field opens the dialog on its code, and the list shows that
 * field chosen -- an IF field's Edit Field showed Date chosen (WUA 241).
 */
export function documentFieldRowForCode(
  code: string,
):
  | { readonly kind: "modeled"; readonly type: DocumentFieldInsertType }
  | { readonly kind: "code"; readonly field: WordCodeField }
  | null {
  const keyword = fieldCodeKeyword(code);
  if (!keyword) return null;
  if (Object.prototype.hasOwnProperty.call(WORD_FIELD_NAMES, keyword)) {
    return { kind: "modeled", type: keyword as DocumentFieldInsertType };
  }
  const field = WORD_CODE_FIELDS.find((candidate) => fieldCodeKeyword(candidate.code) === keyword);
  return field ? { kind: "code", field } : null;
}

export interface DocumentFieldDialogProps {
  readonly open: boolean;
  readonly canEdit?: boolean;
  /** What AUTHOR / FILENAME / TITLE show now, and the document a NUMWORDS
   * or SECTIONPAGES result is counted from, for the result preview. */
  readonly context?: DocumentFieldCodeContext;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
  /** The code the Field codes box opens with (⌘F9, Edit Field). */
  readonly initialCode?: string;
  /** Edit Field: OK replaces the selected field. */
  readonly editing?: boolean;
  /** Insert the field; false when it could not go in where the caret is. */
  readonly onInsert: (field: DocumentFieldDialogInsert) => boolean;
  readonly onClose: () => void;
}

interface SeqDraft {
  identifier: string;
  repeat: boolean;
  hidden: boolean;
  restartLevel: string;
  resetTo: string;
}

/** The options a field's controls state, closed to what its code admits. */
export function documentFieldDialogOptions(
  type: DocumentFieldType,
  format: string,
  drafts: { seq: SeqDraft; ifExpression: string; styleLevel: number },
): DocumentFieldOptions {
  if (type === "DATE" || type === "TIME") {
    const locale = documentDateTimeLocaleForPicture(format);
    return locale ? { locale } : {};
  }
  if (type === "SEQ") {
    const options: DocumentFieldOptions = { identifier: drafts.seq.identifier.trim() };
    const restart = Number(drafts.seq.restartLevel);
    if (Number.isInteger(restart) && restart >= 1 && restart <= 9) options.restartLevel = restart;
    const reset = drafts.seq.resetTo.trim();
    if (/^\d{1,5}$/.test(reset) && Number(reset) <= 32767) options.resetTo = Number(reset);
    if (drafts.seq.repeat) options.repeat = true;
    if (drafts.seq.hidden) options.hidden = true;
    return options;
  }
  if (type === "IF") return { expression: drafts.ifExpression.trim() };
  if (type === "STYLEREF") return { level: drafts.styleLevel };
  return {};
}

/**
 * What a STYLEREF to heading `level` shows at `pos`: the text of the
 * nearest such heading before it, else the first one after it (Word
 * searches back from the field, then forward); null when there is none.
 */
export function styleRefHeadingText(doc: ProseMirrorNode, pos: number, level: number): string | null {
  let before: string | null = null;
  let after: string | null = null;
  doc.descendants((node, nodePos) => {
    if (after !== null) return false;
    if (node.type.name !== "heading") return !node.isTextblock;
    if (node.attrs.level === level) {
      const text = node.textContent.trim();
      if (text) {
        if (nodePos < pos) before = text;
        else after = text;
      }
    }
    return false;
  });
  return before ?? after;
}

export function DocumentFieldDialog({
  open,
  canEdit = true,
  context,
  returnFocusRef,
  initialCode,
  editing = false,
  onInsert,
  onClose,
}: DocumentFieldDialogProps): React.JSX.Element {
  const t = useTranslations("console-notebooks");
  const listRef = useRef<HTMLDivElement | null>(null);
  const [category, setCategory] = useState<DocumentFieldCategory>("all");
  const initialRow = initialCode !== undefined ? documentFieldRowForCode(initialCode) : null;
  const [fieldType, setFieldType] = useState<DocumentFieldInsertType>(
    initialRow?.kind === "modeled" ? initialRow.type : "DATE",
  );
  const [formats, setFormats] = useState<Partial<Record<DocumentFieldType, string>>>({});
  const [seq, setSeq] = useState<SeqDraft>({
    identifier: "Figure",
    repeat: false,
    hidden: false,
    restartLevel: "",
    resetTo: "",
  });
  const [ifExpression, setIfExpression] = useState('1 = 1 "Yes" "No"');
  const [styleLevel, setStyleLevel] = useState(1);
  const [error, setError] = useState<string | null>(null);
  // The Field codes box as typed; null while it shows the chosen field's.
  const [codeDraft, setCodeDraft] = useState<string | null>(initialCode ?? null);
  const codeInputRef = useRef<HTMLInputElement | null>(null);
  const now = useMemo(() => context?.now ?? new Date(), [context?.now]);

  const names = useMemo((): FieldNameRow[] => {
    const modeled: FieldNameRow[] = (
      category === "all"
        ? DOCUMENT_FIELD_DIALOG_TYPES
        : ((DOCUMENT_FIELD_CATEGORIES.find(([key]) => key === category)?.[1] ?? []) as readonly DocumentFieldInsertType[])
    ).map((type) => ({ kind: "modeled", type, name: WORD_FIELD_NAMES[type] }));
    const coded: FieldNameRow[] = WORD_CODE_FIELDS.filter(
      (field) => category === "all" || field.category === category,
    ).map((field) => ({ kind: "code", field, name: field.name }));
    return [...modeled, ...coded].sort((a, b) => a.name.localeCompare(b.name, "en"));
  }, [category]);

  const format = formats[fieldType] ?? DEFAULT_DOCUMENT_FIELD_FORMAT[fieldType];
  const options = documentFieldDialogOptions(fieldType, format, { seq, ifExpression, styleLevel });
  const picker = DOCUMENT_FIELD_PICKER_TYPES.has(fieldType);
  const withDefaults = DEFAULTS_TYPES.has(fieldType);
  const attrs = picker
    ? null
    : createDocumentFieldAttrs(fieldType, {
        format,
        options: fieldType === "TOC" ? { levels: "1-3", hyperlinks: true } : options,
        context: { ...context, now },
      });
  const code = attrs ? attrs.instruction.trim() : `${fieldType} …`;
  const missingOperand = !picker && !attrs;
  const typed = codeDraft !== null;
  // While the Field codes box holds a code, the list shows the field that
  // code is, whichever way it got there (a row, Edit Field, typing).
  const typedRow = typed ? documentFieldRowForCode(codeDraft) : null;
  const codeField = typedRow?.kind === "code" ? typedRow.field : null;
  const typedField = typed ? documentFieldAttrsFromCode(codeDraft, { ...context, now }) : null;
  const typedResult =
    typedField && "attrs" in typedField && typeof typedField.attrs.cachedValue === "string"
      ? typedField.attrs.cachedValue
      : "";

  const chooseCategory = (next: DocumentFieldCategory) => {
    setCategory(next);
    setError(null);
    const found = DOCUMENT_FIELD_CATEGORIES.find(([key]) => key === next);
    const members = found ? (found[1] as readonly DocumentFieldInsertType[]) : DOCUMENT_FIELD_DIALOG_TYPES;
    if (!members.includes(fieldType)) {
      const first = [...members].sort((a, b) => WORD_FIELD_NAMES[a].localeCompare(WORD_FIELD_NAMES[b], "en"))[0];
      if (first) setFieldType(first);
    }
  };

  const chooseRow = (row: FieldNameRow) => {
    setError(null);
    if (row.kind === "code") {
      setCodeDraft(row.field.code);
      return;
    }
    setCodeDraft(null);
    setFieldType(row.type);
  };

  const submit = () => {
    if (!canEdit) return;
    if (codeDraft !== null) {
      const codeError = documentFieldCodeError(codeDraft);
      if (codeError) {
        setError(t(`toolbar.fieldDialog.codeError_${codeError}` as "toolbar.fieldDialog.codeError_empty"));
        codeInputRef.current?.focus();
        return;
      }
      if (!onInsert({ fieldType, format, options, code: codeDraft })) {
        setError(t("toolbar.fieldDialog.rejected"));
        return;
      }
      onClose();
      return;
    }
    if (missingOperand) {
      setError(t("toolbar.fieldDialog.operandRequired"));
      return;
    }
    if (!onInsert({ fieldType, format, options })) {
      setError(t("toolbar.fieldDialog.rejected"));
      return;
    }
    onClose();
  };

  // Word's three classic date pictures are also in the language catalog:
  // each picture once (a repeated key left stale rows behind on a switch).
  const formatList = [...new Set(documentFieldFormats(fieldType).filter(Boolean))];
  const isDateTime = fieldType === "DATE" || fieldType === "TIME";
  const formatSample = (value: string): string => {
    if (isDateTime) {
      return (
        createDocumentFieldAttrs(fieldType, {
          format: value,
          options: documentFieldDialogOptions(fieldType, value, { seq, ifExpression, styleLevel }),
          context: { now },
        })?.cachedValue ?? value
      );
    }
    return NUMBER_FORMAT_SAMPLES[value] ?? value;
  };

  return (
    <OfficeDialogShell
      open={open}
      title={editing ? t("toolbar.fieldDialog.editTitle") : t("toolbar.fieldDialog.title")}
      description=""
      defaultActionLabel={t("toolbar.fieldDialog.ok")}
      cancelActionLabel={t("toolbar.fieldDialog.cancel")}
      defaultActionDisabled={!canEdit}
      onDefaultAction={submit}
      onCancel={onClose}
      initialFocusRef={initialCode !== undefined ? codeInputRef : listRef}
      returnFocusRef={returnFocusRef}
      testIdPrefix="document-field"
      defaultActionTestId="document-field-apply"
      className="sm:max-w-[760px]"
    >
      <div className={styles.layout}>
        <div className={parts.field}>
          <span className={parts.label} id="document-field-categories-label">
            {t("toolbar.fieldDialog.categories")}
          </span>
          <div
            className={`${parts.list} ${styles.list}`}
            role="listbox"
            onKeyDown={moveListboxSelection}
            aria-labelledby="document-field-categories-label"
            data-testid="document-field-categories"
          >
            {(["all", ...DOCUMENT_FIELD_CATEGORIES.map(([key]) => key)] as DocumentFieldCategory[]).map((key) => (
              <button
                key={key}
                type="button"
                role="option"
                aria-selected={key === category}
                data-selected={key === category ? "true" : undefined}
                className={`${parts.listItem} ${styles.row}`}
                data-testid={`document-field-category-${key}`}
                onClick={() => chooseCategory(key)}
              >
                {t(`toolbar.fieldDialog.category.${key}` as "toolbar.fieldDialog.category.all")}
              </button>
            ))}
          </div>
        </div>

        <div className={parts.field}>
          <span className={parts.label} id="document-field-names-label">
            {t("toolbar.fieldDialog.fieldNames")}
          </span>
          <div
            ref={listRef}
            tabIndex={-1}
            className={`${parts.list} ${styles.list}`}
            role="listbox"
            onKeyDown={moveListboxSelection}
            aria-labelledby="document-field-names-label"
            data-testid="document-field-names"
          >
            {names.map((row) => {
              const selected = typed
                ? row.kind === "code"
                  ? typedRow?.kind === "code" && typedRow.field.name === row.field.name
                  : typedRow?.kind === "modeled" && typedRow.type === row.type
                : row.kind === "modeled" && row.type === fieldType;
              return row.kind === "code" ? (
                <button
                  key={`code-${row.name}`}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  data-selected={selected ? "true" : undefined}
                  className={`${parts.listItem} ${styles.row}`}
                  data-testid={`document-field-name-code-${codeFieldKey(row.field)}`}
                  onClick={() => chooseRow(row)}
                >
                  <DocumentFieldIcon type="NATIVE" size={18} />
                  <span className={styles.name}>{row.name}</span>
                </button>
              ) : (
                <button
                  key={row.type}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  data-selected={selected ? "true" : undefined}
                  className={`${parts.listItem} ${styles.row}`}
                  data-testid={`document-field-name-${row.type.toLowerCase()}`}
                  onClick={() => chooseRow(row)}
                  onDoubleClick={() => {
                    chooseRow(row);
                    const type = row.type;
                    if (DOCUMENT_FIELD_PICKER_TYPES.has(type) || DEFAULTS_TYPES.has(type)) {
                      if (onInsert({ fieldType: type, format: DEFAULT_DOCUMENT_FIELD_FORMAT[type], options: {} })) onClose();
                    }
                  }}
                >
                  <DocumentFieldIcon type={row.type} size={18} />
                  <span className={styles.name}>{row.name}</span>
                  <span className={styles.caption}>
                    {t(`toolbar.field_${row.type}` as "toolbar.field_DATE")}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {typed ? (
          <div className={styles.panel} data-testid="document-field-options">
            <div className={styles.heading}>
              <DocumentFieldIcon type={typedRow?.kind === "modeled" ? typedRow.type : "NATIVE"} size={28} />
              <div>
                <div className={styles.headingName}>
                  {typedRow?.kind === "modeled"
                    ? t(`toolbar.field_${typedRow.type}` as "toolbar.field_DATE")
                    : (codeField?.name ?? t("toolbar.fieldDialog.fieldCodes"))}
                </div>
                <p className={parts.hint} data-testid="document-field-description">
                  {typedRow?.kind === "modeled"
                    ? t(`toolbar.fieldDialog.desc_${typedRow.type}` as "toolbar.fieldDialog.desc_DATE")
                    : codeField
                      ? t(`toolbar.fieldDialog.codeDesc_${codeFieldKey(codeField)}` as "toolbar.fieldDialog.codeDesc_formula")
                      : t("toolbar.fieldDialog.codeHint")}
                </p>
              </div>
            </div>
            <p className={parts.hint}>{t("toolbar.fieldDialog.codeUpdateHint")}</p>
          </div>
        ) : (
        <div className={styles.panel} data-testid="document-field-options">
          <div className={styles.heading}>
            <DocumentFieldIcon type={fieldType} size={28} />
            <div>
              <div className={styles.headingName}>{t(`toolbar.field_${fieldType}` as "toolbar.field_DATE")}</div>
              <p className={parts.hint} data-testid="document-field-description">
                {t(`toolbar.fieldDialog.desc_${fieldType}` as "toolbar.fieldDialog.desc_DATE")}
              </p>
            </div>
          </div>

          {formatList.length > 0 ? (
            <div className={parts.field}>
              <span className={parts.label} id="document-field-format-label">
                {isDateTime ? t("toolbar.fieldDialog.dateTimeFormats") : t("toolbar.fieldDialog.format")}
              </span>
              <div
                className={`${parts.list} ${styles.formats}`}
                role="listbox"
                onKeyDown={moveListboxSelection}
                aria-labelledby="document-field-format-label"
                data-testid="document-field-formats"
              >
                {formatList.map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="option"
                    aria-selected={value === format}
                    data-selected={value === format ? "true" : undefined}
                    className={`${parts.listItem} ${styles.row}`}
                    data-testid={`document-field-format-${value}`}
                    onClick={() => setFormats((current) => ({ ...current, [fieldType]: value }))}
                  >
                    <span>{formatSample(value)}</span>
                    {isDateTime ? <span className={styles.caption}>{value}</span> : null}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {fieldType === "SEQ" ? (
            <>
              <label className={parts.field}>
                <span className={parts.label}>{t("toolbar.fieldDialog.seqIdentifier")}</span>
                <input
                  type="text"
                  maxLength={64}
                  value={seq.identifier}
                  className={documentValueInputClassName("min-w-0")}
                  data-testid="document-field-seq-identifier"
                  onChange={(event) => {
                    setSeq((current) => ({ ...current, identifier: event.target.value }));
                    setError(null);
                  }}
                />
              </label>
              <label className={parts.check}>
                <input
                  type="checkbox"
                  checked={seq.repeat}
                  data-testid="document-field-seq-repeat"
                  onChange={(event) => setSeq((current) => ({ ...current, repeat: event.target.checked }))}
                />
                {t("toolbar.fieldDialog.seqRepeat")}
              </label>
              <label className={parts.check}>
                <input
                  type="checkbox"
                  checked={seq.hidden}
                  data-testid="document-field-seq-hidden"
                  onChange={(event) => setSeq((current) => ({ ...current, hidden: event.target.checked }))}
                />
                {t("toolbar.fieldDialog.seqHidden")}
              </label>
              <label className={parts.row}>
                <span className={parts.label}>{t("toolbar.fieldDialog.seqRestart")}</span>
                <select
                  value={seq.restartLevel}
                  className={documentValueInputClassName("min-w-0")}
                  data-testid="document-field-seq-restart"
                  onChange={(event) => setSeq((current) => ({ ...current, restartLevel: event.target.value }))}
                >
                  <option value="">{t("toolbar.fieldDialog.none")}</option>
                  {HEADING_LEVELS.map((level) => (
                    <option key={level} value={String(level)}>
                      {t("toolbar.fieldDialog.headingLevel", { level })}
                    </option>
                  ))}
                </select>
              </label>
              <label className={parts.row}>
                <span className={parts.label}>{t("toolbar.fieldDialog.seqResetTo")}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={5}
                  value={seq.resetTo}
                  className={documentValueInputClassName("w-20")}
                  data-testid="document-field-seq-reset"
                  onChange={(event) => setSeq((current) => ({ ...current, resetTo: event.target.value }))}
                />
              </label>
            </>
          ) : null}

          {fieldType === "IF" ? (
            <label className={parts.field}>
              <span className={parts.label}>{t("toolbar.fieldDialog.ifExpression")}</span>
              <input
                type="text"
                maxLength={256}
                value={ifExpression}
                className={`${documentValueInputClassName("min-w-0")} ${parts.mono}`}
                data-testid="document-field-if-expression"
                onChange={(event) => {
                  setIfExpression(event.target.value);
                  setError(null);
                }}
              />
              <span className={parts.hint}>{t("toolbar.fieldDialog.ifHint")}</span>
            </label>
          ) : null}

          {fieldType === "STYLEREF" ? (
            <label className={parts.field}>
              <span className={parts.label}>{t("toolbar.fieldDialog.styleName")}</span>
              <select
                value={String(styleLevel)}
                className={documentValueInputClassName("min-w-0")}
                data-testid="document-field-style-level"
                onChange={(event) => setStyleLevel(Number(event.target.value))}
              >
                {HEADING_LEVELS.map((level) => (
                  <option key={level} value={String(level)}>
                    {t("toolbar.fieldDialog.headingLevel", { level })}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {picker ? (
            <p className={parts.hint} data-testid="document-field-picker-hint">
              {t("toolbar.fieldDialog.pickerHint")}
            </p>
          ) : null}
          {withDefaults ? (
            <p className={parts.hint} data-testid="document-field-defaults-hint">
              {t("toolbar.fieldDialog.defaultsHint")}
            </p>
          ) : null}
        </div>
        )}
      </div>

      <div className={styles.codeRow}>
        <div className={parts.field}>
          <span className={parts.label}>{t("toolbar.fieldDialog.fieldCodes")}</span>
          <input
            ref={codeInputRef}
            type="text"
            spellCheck={false}
            maxLength={4000}
            value={codeDraft ?? code}
            aria-label={t("toolbar.fieldDialog.fieldCodes")}
            className={`${documentValueInputClassName("min-w-0")} ${parts.mono} ${styles.code}`}
            data-testid="document-field-code"
            onChange={(event) => {
              setCodeDraft(event.target.value);
              setError(null);
            }}
          />
        </div>
        {typed ? (
          typedResult ? (
            <div className={parts.field}>
              <span className={parts.label}>{t("toolbar.fieldDialog.result")}</span>
              <span className={`${parts.well} ${styles.code}`} data-testid="document-field-result">
                {typedResult}
              </span>
            </div>
          ) : null
        ) : attrs && !withDefaults && attrs.cachedValue && !attrs.cachedValue.startsWith("[") ? (
          <div className={parts.field}>
            <span className={parts.label}>{t("toolbar.fieldDialog.result")}</span>
            <span className={`${parts.well} ${styles.code}`} data-testid="document-field-result">
              {attrs.cachedValue}
            </span>
          </div>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className={parts.error} data-testid="document-field-error">
          {error}
        </p>
      ) : null}
    </OfficeDialogShell>
  );
}
