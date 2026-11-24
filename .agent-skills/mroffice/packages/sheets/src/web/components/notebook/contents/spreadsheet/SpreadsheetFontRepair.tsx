"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  readOfficeFontFile,
  resolveOfficeLocalFontVariant,
} from "@mrnote/core/web/components/office-ribbon/officeFontMetadata.ts";
import { attachOfficeFontFamily } from "@mrnote/core/web/components/office-ribbon/officeFontAssets.ts";
import type { OfficeFontFace } from "@mrnote/core/web/components/office-ribbon/officeFontFace.ts";
import type { OfficeLocalFontRecord } from "@mrnote/core/web/components/office-ribbon/officeTypographyCatalog.ts";
import {
  captureSavedPageHotCacheScope,
  isSavedPageHotCacheScopeCurrent,
} from "@mrnote/core/web/lib/saved-page-hot-cache.ts";
import { subscribeAuthState } from "@mrnote/core/web/lib/auth-state.ts";
import { officeDialogParts as parts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { FileType2 } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";

export interface SpreadsheetFontNeed {
  family: string;
  bold?: boolean;
  italic?: boolean;
  boldItalic?: boolean;
}
export function SpreadsheetFontRepair({
  pageId,
  scopeKey,
  needs,
  disabled,
  disabledReason,
  onApply,
  partialStyles = false,
  copy,
  testId = "spreadsheet-font-repair",
}: {
  pageId: string;
  scopeKey: string;
  needs: readonly SpreadsheetFontNeed[];
  disabled: boolean;
  disabledReason?: string;
  onApply: (face: OfficeFontFace, sourceScope: string) => boolean;
  /** Display-only callers may retain missing styles while adding verified ones. */
  partialStyles?: boolean;
  copy?: { action?: string; title?: string; description?: string; apply?: string; failure?: string };
  testId?: string;
}) {
  const t = useTranslations("console-notebooks");
  const [open, setOpen] = useState(false);
  const [family, setFamily] = useState("");
  const [records, setRecords] = useState<OfficeLocalFontRecord[]>([]);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const pending = useRef<AbortController | null>(null);
  const readToken = useRef(0);
  const live = useRef({ scopeKey, needs, disabled, onApply, partialStyles });
  useLayoutEffect(() => {
    live.current = { scopeKey, needs, disabled, onApply, partialStyles };
  }, [scopeKey, needs, disabled, onApply, partialStyles]);
  useEffect(() => {
    const cancel = () => {
      readToken.current++;
      pending.current?.abort();
      setRecords([]);
      setOpen(false);
    };
    const unsubscribe = subscribeAuthState(cancel);
    return () => {
      cancel();
      unsubscribe();
    };
  }, [scopeKey]);
  const failure = copy?.failure ?? (t("spreadsheet.surfaceCopy.theFontDoesNotMatchEmbeddingIsUnavailableOrThe"));
  const readFiles = async (files: FileList | null) => {
    const token = ++readToken.current;
    pending.current?.abort();
    setRecords([]);
    setError(undefined);
    if (!files?.length) return;
    if (files.length > 4) {
      setError(failure);
      return;
    }
    const sourceScope = scopeKey;
    const values = await Promise.all(Array.from(files, readOfficeFontFile));
    if (token !== readToken.current || live.current.scopeKey !== sourceScope)
      return;
    const selectedFamily = values[0]?.family;
    const match = live.current.needs.find(
      (need) =>
        need.family.toLocaleLowerCase() === selectedFamily?.toLocaleLowerCase(),
    );
    if (
      !match ||
      values.some(
        (value) =>
          !value ||
          value.family.toLocaleLowerCase() !==
            selectedFamily?.toLocaleLowerCase(),
      )
    ) {
      setError(failure);
      return;
    }
    setFamily(match.family);
    setRecords(values as OfficeLocalFontRecord[]);
  };
  const apply = async () => {
    const sourceScope = scopeKey;
    const auth = captureSavedPageHotCacheScope();
    const current = () =>
      live.current.scopeKey === sourceScope &&
      live.current.partialStyles === partialStyles &&
      !live.current.disabled &&
      isSavedPageHotCacheScopeCurrent(auth) &&
      live.current.needs.some((need) => need.family === family);
    if (!current() || !records.length || busy) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError(undefined);
    let prepared:
      Awaited<ReturnType<typeof attachOfficeFontFamily>> | undefined;
    try {
      const variants = await Promise.all(
        records.map((record) =>
          resolveOfficeLocalFontVariant(record, { inspectSource: true }),
        ),
      );
      const regular = variants.find(
        (variant) => variant && !variant.bold && !variant.italic,
      );
      const need = live.current.needs.find((need) => need.family === family)!;
      if (
        !regular?.fontFace ||
        variants.some((variant) => !variant?.fontFace) ||
        (!partialStyles && ((need.bold &&
          !variants.some((variant) => variant?.bold && !variant.italic)) ||
        (need.italic &&
          !variants.some((variant) => variant?.italic && !variant.bold)) ||
        (need.boldItalic &&
          !variants.some((variant) => variant?.italic && variant.bold))))
      )
        throw new Error("missing_family_member");
      if (controller.signal.aborted || !current()) throw new Error("source_changed");
      prepared = await attachOfficeFontFamily(
        pageId,
        regular,
        controller.signal,
        records,
      );
      const latestNeed = live.current.needs.find(
        (need) => need.family === family,
      );
      const roles = new Set(
        prepared.fontFace?.asset?.files.map((file) => file.role),
      );
      if (
        !latestNeed ||
        (!partialStyles && ((latestNeed.bold && !roles.has("bold")) ||
        (latestNeed.italic && !roles.has("italic")) ||
        (latestNeed.boldItalic && !roles.has("boldItalic"))))
      )
        throw new Error("source_changed");
      if (
        controller.signal.aborted ||
        !current() ||
        !prepared.fontFace ||
        !live.current.onApply(prepared.fontFace, sourceScope)
      )
        throw new Error("source_changed");
      prepared = undefined;
      setRecords([]);
      setOpen(false);
    } catch {
      await prepared?.discardUnusedFontAssets?.();
      setError(failure);
    } finally {
      if (pending.current === controller) pending.current = null;
      setBusy(false);
    }
  };
  const selectedNeed = needs.find(need => need.family === family);
  const missingStyles = [
    selectedNeed?.bold && (t("spreadsheet.surfaceCopy.bold")),
    selectedNeed?.italic && (t("spreadsheet.surfaceCopy.italic")),
    selectedNeed?.boldItalic && (t("spreadsheet.surfaceCopy.boldItalic")),
  ].filter(Boolean);
  const setOpenState = (value: boolean) => {
    if (value) {
      setFamily(needs[0]?.family ?? "");
      setError(undefined);
    } else {
      readToken.current++;
      pending.current?.abort();
    }
    setRecords([]);
    setOpen(value);
  };
  const title = copy?.title ?? t("spreadsheet.surfaceCopy.addWorkbookFonts");
  // The same Office dialog card as every command dialog of the workbook: the
  // shell draws the title row, its close control, Cancel and the default
  // action, and holds them while a font is being verified and attached.
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="office-ribbon-control"
        data-testid={testId}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={copy?.action ?? (t("spreadsheet.surfaceCopy.addWorkbookFonts"))}
        style={{ width: 28, minWidth: 28, padding: 4 }}
        title={
          disabled ? disabledReason : copy?.action ?? (t("spreadsheet.surfaceCopy.addWorkbookFonts"))
        }
        onClick={() => setOpenState(true)}
      >
        <FileType2 size={16} aria-hidden="true" />
      </button>
      <OfficeDialogShell
        open={open}
        title={title}
        description={
          copy?.description ??
          t("spreadsheet.surfaceCopy.chooseFontsYouHavePermissionToEmbedInThisWorkbook")
        }
        defaultActionLabel={copy?.apply ?? t("spreadsheet.surfaceCopy.applyToWorkbook")}
        busy={busy}
        busyActionLabel={t("spreadsheet.surfaceCopy.adding")}
        defaultActionDisabled={busy || !records.length}
        onDefaultAction={() => void apply()}
        cancelActionLabel={t("spreadsheet.surfaceCopy.cancel")}
        onCancel={() => setOpenState(false)}
        returnFocusRef={triggerRef}
        testIdPrefix={testId}
        className="w-[min(420px,calc(100vw-32px))]"
      >
        <label className={parts.field}>
          <span className={parts.label}>{t("spreadsheet.surfaceCopy.font")}</span>
          <select
            aria-label={t("spreadsheet.surfaceCopy.font")}
            value={family}
            disabled={busy}
            onChange={(event) => {
              readToken.current++;
              setFamily(event.target.value);
              setRecords([]);
              setError(undefined);
            }}
          >
            {needs.map((need) => (
              <option key={need.family} value={need.family}>
                {need.family}
              </option>
            ))}
          </select>
        </label>
        {partialStyles && missingStyles.length ? (
          <p className={parts.hint}>
            {t("spreadsheet.surfaceCopy.missingStyles")}
            {missingStyles.join(t("spreadsheet.dynamicCopy.listSeparator"))}
          </p>
        ) : null}
        <label className={parts.field}>
          <span className={parts.label}>{t("spreadsheet.surfaceCopy.chooseFontFiles")}</span>
          <input
            type="file"
            accept=".ttf,.otf"
            multiple
            disabled={busy}
            aria-label={t("spreadsheet.surfaceCopy.chooseFontFiles")}
            onChange={(event) => {
              void readFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </label>
        {records.length ? (
          <ul className={parts.list} aria-label={t("spreadsheet.surfaceCopy.chooseFontFiles")}>
            {records.map((record) => (
              <li key={record.postscriptName} className={parts.listItem}>
                {record.fullName}
              </li>
            ))}
          </ul>
        ) : null}
        {error ? (
          <p role="alert" className={parts.error}>
            {error}
          </p>
        ) : null}
      </OfficeDialogShell>
    </>
  );
}
