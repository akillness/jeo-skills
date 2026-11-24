"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useMemo, useRef, useState, type RefObject } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { moveListboxSelection } from "@mrnote/core/web/lib/listbox-arrow-keys.ts";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as parts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { documentValueInputClassName } from "@mrnote/core/web/components/console/editor/documentValueInput.ts";
import {
  DEFAULT_AUTOCORRECT_SETTINGS,
  getAutoCorrectSettings,
  normalizeAutoCorrectSettings,
  setAutoCorrectSettings,
  type AutoCorrectEntry,
  type AutoCorrectSettings,
} from "./autoCorrectSettings";

/**
 * Word's AutoCorrect dialog (Tools > AutoCorrect Options on the Mac; File >
 * Options > Proofing > AutoCorrect Options on Windows; Microsoft Support,
 * "Choose AutoCorrect options for capitalization, spelling, and symbols",
 * "AutoFormat as you type"). The AutoCorrect tab: the capitalization boxes,
 * Replace text as you type with its Replace / With boxes, Add (Replace for an
 * entry that exists) and Delete, the list itself, and the exceptions. The
 * AutoFormat As You Type tab: the "Replace as you type" and "Apply as you
 * type" boxes the editor does. Options apply when OK is chosen.
 */

type Tab = "autoCorrect" | "autoFormat";

const CAPITALIZATION = [
  "correctTwoInitialCapitals",
  "capitalizeSentences",
  "capitalizeTableCells",
  "capitalizeDayNames",
  "correctCapsLock",
] as const;
const REPLACE_AS_YOU_TYPE = ["smartQuotes", "fractions", "boldItalic", "ordinals", "hyphensWithDash"] as const;
const APPLY_AS_YOU_TYPE = ["automaticBulletedLists", "automaticNumberedLists"] as const;

type BooleanOption =
  | (typeof CAPITALIZATION)[number]
  | (typeof REPLACE_AS_YOU_TYPE)[number]
  | (typeof APPLY_AS_YOU_TYPE)[number]
  | "replaceText";

export interface DocumentAutoCorrectDialogProps {
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
  readonly initialTab?: Tab;
  /** Symbol dialog's AutoCorrect...: the symbol goes in the With box. */
  readonly initialWith?: string;
  readonly onClose: () => void;
}

const words = (text: string): string[] =>
  text
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);

export function DocumentAutoCorrectDialog({
  returnFocusRef,
  initialTab = "autoCorrect",
  initialWith,
  onClose,
}: DocumentAutoCorrectDialogProps): React.JSX.Element {
  const t = useTranslations("console-notebooks");
  const [tab, setTab] = useState<Tab>(initialTab);
  const [draft, setDraft] = useState<AutoCorrectSettings>(() => getAutoCorrectSettings());
  const [replace, setReplace] = useState("");
  const [withText, setWithText] = useState(initialWith ?? "");
  const [firstLetter, setFirstLetter] = useState(() => draft.firstLetterExceptions.join("\n"));
  const [initialCaps, setInitialCaps] = useState(() => draft.initialCapsExceptions.join("\n"));
  const replaceRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const key = replace.trim().toLowerCase();
  const existing = draft.entries.find((entry) => entry.from.toLowerCase() === key) ?? null;
  const sorted = useMemo(
    () => [...draft.entries].sort((a, b) => a.from.localeCompare(b.from, "en", { sensitivity: "base" })),
    [draft.entries],
  );
  // Word scrolls the list to the first entry the Replace box starts.
  const firstMatch = key ? sorted.find((entry) => entry.from.toLowerCase().startsWith(key)) : null;

  const toggle = (option: BooleanOption) => setDraft((current) => ({ ...current, [option]: !current[option] }));

  const addOrReplace = () => {
    const from = replace.trim();
    if (!from || /\s$/.test(replace) || !withText) return;
    setDraft((current) => ({
      ...current,
      entries: [
        ...current.entries.filter((entry) => entry.from.toLowerCase() !== from.toLowerCase()),
        { from, to: withText },
      ],
    }));
  };
  const remove = () => {
    if (!existing) return;
    setDraft((current) => ({ ...current, entries: current.entries.filter((entry) => entry !== existing) }));
    setReplace("");
    setWithText("");
    replaceRef.current?.focus();
  };
  const pick = (entry: AutoCorrectEntry) => {
    setReplace(entry.from);
    setWithText(entry.to);
  };

  const check = (option: BooleanOption) => (
    <label key={option} className={parts.check}>
      <input
        type="checkbox"
        checked={draft[option]}
        data-testid={`document-autocorrect-${option}`}
        onChange={() => toggle(option)}
      />
      {t(`autoCorrectDialog.${option}` as "autoCorrectDialog.capitalizeSentences")}
    </label>
  );

  return (
    <OfficeDialogShell
      open
      title={t("autoCorrectDialog.title")}
      description=""
      defaultActionLabel={t("toolbar.dialogOk")}
      cancelActionLabel={t("toolbar.pageSetupCancel")}
      onDefaultAction={() => {
        setAutoCorrectSettings(
          normalizeAutoCorrectSettings({
            ...draft,
            firstLetterExceptions: words(firstLetter),
            initialCapsExceptions: words(initialCaps),
          }),
        );
        onClose();
      }}
      onCancel={onClose}
      initialFocusRef={replaceRef}
      returnFocusRef={returnFocusRef}
      testIdPrefix="document-autocorrect"
      defaultActionTestId="document-autocorrect-apply"
      className="sm:max-w-[560px]"
      tabStrip={
        <div className={parts.tabs} role="tablist" aria-label={t("autoCorrectDialog.title")}>
          {(["autoCorrect", "autoFormat"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              id={`document-autocorrect-tab-${value}`}
              aria-selected={tab === value}
              aria-controls={`document-autocorrect-page-${value}`}
              className={parts.tab}
              data-testid={`document-autocorrect-tab-${value}`}
              onClick={() => setTab(value)}
            >
              {t(`autoCorrectDialog.tab_${value}` as "autoCorrectDialog.tab_autoCorrect")}
            </button>
          ))}
        </div>
      }
    >
      <div
        id="document-autocorrect-page-autoCorrect"
        role="tabpanel"
        aria-labelledby="document-autocorrect-tab-autoCorrect"
        hidden={tab !== "autoCorrect"}
        className={parts.body}
      >
        <section className={parts.group}>{CAPITALIZATION.map(check)}</section>
        <section className={parts.group}>
          {check("replaceText")}
          <div className={parts.row}>
            <label className={parts.field}>
              <span className={parts.label}>{t("autoCorrectDialog.replace")}</span>
              <input
                ref={replaceRef}
                type="text"
                maxLength={255}
                value={replace}
                spellCheck={false}
                className={documentValueInputClassName("min-w-0")}
                data-testid="document-autocorrect-replace"
                onChange={(event) => {
                  setReplace(event.target.value);
                  const match = draft.entries.find(
                    (entry) => entry.from.toLowerCase() === event.target.value.trim().toLowerCase(),
                  );
                  if (match) setWithText(match.to);
                }}
              />
            </label>
            <label className={parts.field}>
              <span className={parts.label}>{t("autoCorrectDialog.with")}</span>
              <input
                type="text"
                maxLength={255}
                value={withText}
                spellCheck={false}
                className={documentValueInputClassName("min-w-0")}
                data-testid="document-autocorrect-with"
                onChange={(event) => setWithText(event.target.value)}
              />
            </label>
          </div>
          <div
            ref={listRef}
            className={parts.list}
            role="listbox"
            onKeyDown={moveListboxSelection}
            aria-label={t("autoCorrectDialog.list")}
            style={{ maxHeight: 180, overflowY: "auto" }}
            data-testid="document-autocorrect-list"
          >
            {sorted.map((entry) => {
              const selected = entry.from.toLowerCase() === key;
              return (
                <button
                  key={entry.from}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  data-selected={selected ? "true" : undefined}
                  className={parts.listItem}
                  style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, textAlign: "start" }}
                  ref={
                    entry === firstMatch
                      ? (node) => node?.scrollIntoView?.({ block: "nearest" })
                      : undefined
                  }
                  onClick={() => pick(entry)}
                >
                  <span>{entry.from}</span>
                  <span>{entry.to}</span>
                </button>
              );
            })}
          </div>
          <div className={parts.row}>
            <button
              type="button"
              className={parts.button}
              disabled={!replace.trim() || !withText || (existing?.to === withText && existing.from === replace.trim())}
              data-testid="document-autocorrect-add"
              onClick={addOrReplace}
            >
              {existing ? t("autoCorrectDialog.replaceEntry") : t("autoCorrectDialog.add")}
            </button>
            <button
              type="button"
              className={parts.button}
              disabled={!existing}
              data-testid="document-autocorrect-delete"
              onClick={remove}
            >
              {t("autoCorrectDialog.delete")}
            </button>
            <button
              type="button"
              className={parts.button}
              data-testid="document-autocorrect-reset"
              onClick={() => {
                setDraft(DEFAULT_AUTOCORRECT_SETTINGS);
                setFirstLetter(DEFAULT_AUTOCORRECT_SETTINGS.firstLetterExceptions.join("\n"));
                setInitialCaps(DEFAULT_AUTOCORRECT_SETTINGS.initialCapsExceptions.join("\n"));
              }}
            >
              {t("autoCorrectDialog.reset")}
            </button>
          </div>
        </section>
        <section className={parts.group}>
          <h3 className={parts.sectionTitle}>{t("autoCorrectDialog.exceptions")}</h3>
          <div className={parts.row}>
            <label className={parts.field}>
              <span className={parts.label}>{t("autoCorrectDialog.firstLetterExceptions")}</span>
              <textarea
                rows={4}
                value={firstLetter}
                spellCheck={false}
                className={documentValueInputClassName("min-w-0")}
                data-testid="document-autocorrect-first-letter"
                onChange={(event) => setFirstLetter(event.target.value)}
              />
            </label>
            <label className={parts.field}>
              <span className={parts.label}>{t("autoCorrectDialog.initialCapsExceptions")}</span>
              <textarea
                rows={4}
                value={initialCaps}
                spellCheck={false}
                className={documentValueInputClassName("min-w-0")}
                data-testid="document-autocorrect-initial-caps"
                onChange={(event) => setInitialCaps(event.target.value)}
              />
            </label>
          </div>
          <p className={parts.hint}>{t("autoCorrectDialog.exceptionsHint")}</p>
        </section>
      </div>
      <div
        id="document-autocorrect-page-autoFormat"
        role="tabpanel"
        aria-labelledby="document-autocorrect-tab-autoFormat"
        hidden={tab !== "autoFormat"}
        className={parts.body}
      >
        <section className={parts.group}>
          <h3 className={parts.sectionTitle}>{t("autoCorrectDialog.replaceAsYouType")}</h3>
          {REPLACE_AS_YOU_TYPE.map(check)}
        </section>
        <section className={parts.group}>
          <h3 className={parts.sectionTitle}>{t("autoCorrectDialog.applyAsYouType")}</h3>
          {APPLY_AS_YOU_TYPE.map(check)}
        </section>
      </div>
    </OfficeDialogShell>
  );
}

export default DocumentAutoCorrectDialog;
