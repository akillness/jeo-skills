"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useId, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { moveListboxSelection } from "@mrnote/core/web/lib/listbox-arrow-keys.ts";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as parts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import {
  MAX_METADATA_FIELD_LENGTH,
  type DocumentMetadata,
} from "@mrnote/core/web/components/console/editor/native-document/documentMetadata.ts";
import {
  CUSTOM_PROPERTY_TYPES,
  MAX_CUSTOM_PROPERTY_NAME,
  MAX_CUSTOM_PROPERTY_VALUE,
  WORD_CUSTOM_PROPERTY_NAMES,
  customPropertyDisplayValue,
  customPropertyValueFromInput,
  type CustomProperty,
  type CustomPropertyType,
} from "@mrnote/core/web/components/console/editor/native-document/documentCustomProperties.ts";

/**
 * Word's "<name> Properties" dialog, Summary page (File > Info > Properties
 * > Advanced Properties; Microsoft Support, "View or change the properties
 * for an Office file": Title, Subject, Author, Manager, Company, Category,
 * Keywords and Comments are edited on the Summary tab).
 *
 * Behaviour reproduced: a modal dialog whose fields start from the
 * document's stored properties; OK writes them all at once (one Undo step),
 * Cancel / Escape / the X leave them as they were. Each is a single line.
 *
 * Only the properties MRAI carries through both DOCX writers and the reader
 * are offered: Title, Subject, Author (`dc:creator`), Company (app.xml),
 * Category and Keywords. Word's Manager and Comments have no carrier in the
 * page model and would be dropped on export, so they are not shown, and the
 * General / Statistics / Contents pages are not reproduced. The
 * cover-page-only properties already on the document (Abstract, Publish
 * Date, company contact details) are kept as they are.
 *
 * The Custom page is Word's: a Name (typed or one of Word's suggestions), a
 * Type (Text, Date, Number, Yes or no) and a Value; Add (Modify when the
 * name is already there) and Delete; the Properties list below. A value
 * that is not of its type is refused with Word's message. A property linked
 * to a bookmark is listed and kept, and can be deleted, not modified.
 */

export type DocumentPropertiesField =
  | "title"
  | "subject"
  | "author"
  | "company"
  | "category"
  | "keywords";

/** Word's Summary page order, less the two fields MRAI cannot store. */
const FIELDS: readonly (readonly [DocumentPropertiesField, string])[] = [
  ["title", "toolbar.documentPropertiesTitle"],
  ["subject", "toolbar.documentPropertiesSubject"],
  ["author", "toolbar.documentPropertiesAuthor"],
  ["company", "toolbar.documentPropertiesCompany"],
  ["category", "toolbar.documentPropertiesCategory"],
  ["keywords", "toolbar.documentPropertiesKeywords"],
];

export interface DocumentPropertiesDialogProps {
  readonly open: boolean;
  /** The document's name, for the title ("Report Properties"). */
  readonly documentName: string;
  readonly initial: DocumentMetadata;
  /** The document's custom properties (`attrs.customProperties`). */
  readonly initialCustomProperties?: readonly CustomProperty[] | null;
  readonly canEdit: boolean;
  /** `customProperties` is passed only when the Custom page changed them. */
  readonly onApply: (metadata: DocumentMetadata, customProperties?: CustomProperty[]) => void;
  readonly onCancel: () => void;
  readonly returnFocusTarget?: () => HTMLElement | null;
}

export function DocumentPropertiesDialog({
  open,
  documentName,
  initial,
  initialCustomProperties,
  canEdit,
  onApply,
  onCancel,
  returnFocusTarget,
}: DocumentPropertiesDialogProps): React.JSX.Element {
  const t = useTranslations("console-notebooks");
  const locale = useLocale();
  const [draft, setDraft] = useState<DocumentMetadata>(() => ({ ...initial }));
  const [tab, setTab] = useState<"summary" | "custom">("summary");
  const [custom, setCustom] = useState<CustomProperty[]>(() => [...(initialCustomProperties ?? [])]);
  const [customTouched, setCustomTouched] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<CustomPropertyType>("text");
  const [value, setValue] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement | null>(null);
  // The Value caption is a plain span beside the input (the grid cell layout
  // cannot wrap it in a <label>), so the input and the Yes/No group name
  // themselves from it by id. Unlinked, the value field had no accessible
  // name (WUA 247).
  const valueLabelId = useId();
  const existing = useMemo(
    () => custom.find((entry) => entry.name.toLowerCase() === name.trim().toLowerCase()) ?? null,
    [custom, name],
  );
  const typeLabel = (kind: CustomPropertyType) =>
    t(`toolbar.documentPropertiesType${kind === "yesno" ? "Yesno" : kind[0].toUpperCase() + kind.slice(1)}` as "toolbar.documentPropertiesTypeText");

  const pick = (entry: CustomProperty) => {
    setName(entry.name);
    setMismatch(false);
    if (entry.type === "preserved") return;
    setType(entry.type);
    setValue(entry.value);
  };
  const addOrModify = () => {
    const trimmed = name.trim();
    if (!trimmed || existing?.type === "preserved") return;
    const stored = customPropertyValueFromInput(type, type === "yesno" && !value ? "true" : value);
    if (stored === null) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    const entry: CustomProperty = { name: existing?.name ?? trimmed, type, value: stored };
    setCustom((current) =>
      existing ? current.map((item) => (item === existing ? entry : item)) : [...current, entry],
    );
    setCustomTouched(true);
  };
  const remove = () => {
    if (!existing) return;
    setCustom((current) => current.filter((item) => item !== existing));
    setCustomTouched(true);
    setName("");
    setValue("");
  };

  return (
    <OfficeDialogShell
      open={open}
      title={t("toolbar.documentPropertiesDialogTitle", { name: documentName })}
      description={
        <span className="sr-only">
          {t("toolbar.documentPropertiesDescription")}
        </span>
      }
      defaultActionLabel={t("toolbar.dialogOk")}
      cancelActionLabel={t("toolbar.dialogCancel")}
      defaultActionDisabled={!canEdit}
      onDefaultAction={() => onApply(draft, customTouched ? custom : undefined)}
      onCancel={onCancel}
      initialFocusRef={firstFieldRef}
      returnFocusTarget={returnFocusTarget}
      testIdPrefix="document-properties"
      defaultActionTestId="document-toolbar-document-properties-apply"
      cancelActionTestId="document-toolbar-document-properties-cancel"
      className="w-[min(460px,calc(100vw-32px))]"
      tabStrip={
        <div className={parts.tabs} role="tablist" aria-label={t("toolbar.documentPropertiesLabel")}>
          {(["summary", "custom"] as const).map((page) => (
            <button
              key={page}
              type="button"
              role="tab"
              id={`document-properties-tab-${page}`}
              aria-selected={tab === page}
              aria-controls={`document-properties-page-${page}`}
              className={parts.tab}
              data-testid={`document-toolbar-document-properties-tab-${page}`}
              onClick={() => setTab(page)}
            >
              {page === "summary" ? t("toolbar.documentPropertiesSummary") : t("toolbar.documentPropertiesCustom")}
            </button>
          ))}
        </div>
      }
    >
      <div
        id="document-properties-page-summary"
        role="tabpanel"
        aria-labelledby="document-properties-tab-summary"
        hidden={tab !== "summary"}
      >
      <fieldset className={parts.group}>
        <legend>{t("toolbar.documentPropertiesSummary")}</legend>
        <div className="grid grid-cols-[max-content_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
          {FIELDS.map(([field, labelKey], index) => (
            <label key={field} className="contents">
              <span className={parts.label}>{t(labelKey)}</span>
              <input
                ref={index === 0 ? firstFieldRef : undefined}
                type="text"
                value={draft[field] ?? ""}
                disabled={!canEdit}
                maxLength={MAX_METADATA_FIELD_LENGTH}
                data-testid={`document-toolbar-document-properties-${field}`}
                onChange={(event) => {
                  const value = event.target.value;
                  setDraft((current) => ({ ...current, [field]: value }));
                }}
              />
            </label>
          ))}
        </div>
      </fieldset>
      </div>
      <div
        id="document-properties-page-custom"
        role="tabpanel"
        aria-labelledby="document-properties-tab-custom"
        hidden={tab !== "custom"}
      >
        <section className={parts.group}>
          <div className="grid grid-cols-[max-content_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
            <label className="contents">
              <span className={parts.label}>{t("toolbar.documentPropertiesName")}</span>
              <input
                type="text"
                list="document-properties-custom-names"
                value={name}
                disabled={!canEdit}
                maxLength={MAX_CUSTOM_PROPERTY_NAME}
                data-testid="document-toolbar-document-properties-custom-name"
                onChange={(event) => {
                  setName(event.target.value);
                  setMismatch(false);
                }}
              />
            </label>
            <datalist id="document-properties-custom-names">
              {WORD_CUSTOM_PROPERTY_NAMES.map((suggestion) => (
                <option key={suggestion} value={suggestion} />
              ))}
            </datalist>
            <label className="contents">
              <span className={parts.label}>{t("toolbar.documentPropertiesType")}</span>
              <select
                value={type}
                disabled={!canEdit}
                data-testid="document-toolbar-document-properties-custom-type"
                onChange={(event) => {
                  const next = event.target.value as CustomPropertyType;
                  setType(next);
                  setValue(next === "yesno" ? "true" : "");
                  setMismatch(false);
                }}
              >
                {CUSTOM_PROPERTY_TYPES.map((kind) => (
                  <option key={kind} value={kind}>
                    {typeLabel(kind)}
                  </option>
                ))}
              </select>
            </label>
            <span className={parts.label} id={valueLabelId}>{t("toolbar.documentPropertiesValue")}</span>
            {type === "yesno" ? (
              <div className={parts.row} role="radiogroup" aria-labelledby={valueLabelId}>
                {(["true", "false"] as const).map((option) => (
                  <label key={option} className={parts.field}>
                    <input
                      type="radio"
                      name="document-properties-custom-yesno"
                      checked={(value || "true") === option}
                      disabled={!canEdit}
                      data-testid={`document-toolbar-document-properties-custom-${option === "true" ? "yes" : "no"}`}
                      onChange={() => setValue(option)}
                    />
                    <span>{option === "true" ? t("toolbar.documentPropertiesYes") : t("toolbar.documentPropertiesNo")}</span>
                  </label>
                ))}
              </div>
            ) : (
              <input
                type={type === "date" ? "date" : "text"}
                inputMode={type === "number" ? "decimal" : undefined}
                value={value}
                disabled={!canEdit}
                maxLength={MAX_CUSTOM_PROPERTY_VALUE}
                aria-labelledby={valueLabelId}
                aria-invalid={mismatch || undefined}
                data-testid="document-toolbar-document-properties-custom-value"
                onChange={(event) => {
                  setValue(event.target.value);
                  setMismatch(false);
                }}
              />
            )}
          </div>
          {mismatch ? (
            <p role="alert" className={parts.hint} data-testid="document-toolbar-document-properties-custom-mismatch">
              {t("toolbar.documentPropertiesTypeMismatch")}
            </p>
          ) : null}
          <div className={parts.row}>
            <button
              type="button"
              className={parts.button}
              disabled={!canEdit || !name.trim() || existing?.type === "preserved"}
              data-testid="document-toolbar-document-properties-custom-add"
              onClick={addOrModify}
            >
              {existing ? t("toolbar.documentPropertiesModify") : t("toolbar.documentPropertiesAdd")}
            </button>
            <button
              type="button"
              className={parts.button}
              disabled={!canEdit || !existing}
              data-testid="document-toolbar-document-properties-custom-delete"
              onClick={remove}
            >
              {t("toolbar.documentPropertiesDelete")}
            </button>
          </div>
          <div
            className={parts.list}
            role="listbox"
            onKeyDown={moveListboxSelection}
            aria-label={t("toolbar.documentPropertiesList")}
            style={{ maxHeight: 180, overflowY: "auto" }}
            data-testid="document-toolbar-document-properties-custom-list"
          >
            {custom.map((entry) => {
              const selected = entry === existing;
              return (
                <button
                  key={entry.name}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  data-selected={selected ? "true" : undefined}
                  className={parts.listItem}
                  style={{ display: "grid", gridTemplateColumns: "1fr 1fr max-content", gap: 12, textAlign: "start" }}
                  onClick={() => pick(entry)}
                >
                  <span>{entry.name}</span>
                  <span>
                    {entry.type === "preserved"
                      ? t("toolbar.documentPropertiesPreserved")
                      : entry.type === "yesno"
                        ? entry.value === "true"
                          ? t("toolbar.documentPropertiesYes")
                          : t("toolbar.documentPropertiesNo")
                        : customPropertyDisplayValue(entry, locale)}
                  </span>
                  <span>{entry.type === "preserved" ? "" : typeLabel(entry.type)}</span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </OfficeDialogShell>
  );
}
