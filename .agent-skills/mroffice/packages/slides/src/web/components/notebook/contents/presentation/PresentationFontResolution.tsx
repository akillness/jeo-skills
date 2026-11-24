"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import {
  readOfficeFontFile,
  resolveOfficeLocalFontVariant,
} from "@mrnote/core/web/components/office-ribbon/officeFontMetadata.ts";
import type {
  OfficeFontVariant,
  OfficeLocalFontRecord,
} from "@mrnote/core/web/components/office-ribbon/officeTypographyCatalog.ts";
import { officeVerifiedFontVariant } from "@mrnote/core/web/components/office-ribbon/officeTypographyCatalog.ts";
import type { PresentationFontRequirement } from "@mrnote/core/web/lib/presentation-font-faces.ts";
import { subscribeAuthState } from "@mrnote/core/web/lib/auth-state.ts";

export type PresentationFontResolutionInput = {
  requirement: PresentationFontRequirement;
  variant: OfficeFontVariant;
  records: readonly OfficeLocalFontRecord[];
  sourceScope: string;
};

/** Font/layout recovery, separate from text formatting. Only server-declared
 * families and real inspected bytes may reach the page-owned upload flow. */
export function PresentationFontResolution({
  requirements,
  scopeKey,
  disabled,
  busy,
  unavailable,
  onResolve,
  layoutUpdateRequired = false,
  onUpdateLayout,
}: {
  requirements: readonly PresentationFontRequirement[];
  scopeKey: string;
  disabled: boolean;
  busy: boolean;
  unavailable: boolean;
  onResolve: (input: PresentationFontResolutionInput) => Promise<boolean>;
  layoutUpdateRequired?: boolean;
  onUpdateLayout?: (sourceScope: string) => Promise<boolean>;
}) {
  const t = useTranslations("console-notebooks");
  const [error, setError] = useState<string>();
  const [reading, setReading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const token = useRef(0),
    fileInput = useRef<HTMLInputElement>(null);
  const chosen = useRef<PresentationFontRequirement | undefined>(undefined);
  const live = useRef({ requirements, scopeKey, disabled, busy, onResolve });
  useLayoutEffect(() => {
    live.current = { requirements, scopeKey, disabled, busy, onResolve };
  }, [requirements, scopeKey, disabled, busy, onResolve]);
  useEffect(() => {
    token.current++;
    setError(undefined);
    setReading(false);
    setUpdating(false);
    chosen.current = undefined;
  }, [scopeKey]);
  useEffect(
    () =>
      subscribeAuthState(() => {
        token.current++;
        chosen.current = undefined;
        setReading(false);
        setUpdating(false);
        setError(undefined);
      }),
    [],
  );
  useEffect(
    () => () => {
      token.current++;
    },
    [],
  );
  const missing = requirements.filter((need) => need.status === "missing");
  const failure = t("presentation.ui.fontResolution.failure");
  const current = (
    id: number,
    scope: string,
    need: PresentationFontRequirement,
  ) =>
    token.current === id &&
    live.current.scopeKey === scope &&
    !live.current.disabled &&
    !live.current.busy &&
    live.current.requirements.some(
      (item) =>
        item.status === "missing" &&
        item.family === need.family &&
        JSON.stringify(item.roles) === JSON.stringify(need.roles),
    );
  const resolve = async (
    records: OfficeLocalFontRecord[],
    need: PresentationFontRequirement,
    id: number,
    scope: string,
  ) => {
    if (
      !records.length ||
      records.length > 4
    )
      throw Error("source_mismatch");
    const variants = await Promise.all(
      records.map((record) =>
        resolveOfficeLocalFontVariant(record, { inspectSource: true }),
      ),
    );
    const nameMatches = (value: string | undefined) => value?.toLowerCase() === need.family.toLowerCase();
    if (!variants.some(variant => variant?.fontFace &&
      (nameMatches(variant.family) || nameMatches(variant.postscriptName))) ||
      variants.some(variant => !variant?.fontFace || variant.family !== variants[0]?.family))
      throw Error("source_mismatch");
    const regular = variants.find(
      (variant) => variant?.fontFace && !variant.bold && !variant.italic,
    );
    const roles = new Set(
      variants
        .filter((variant): variant is OfficeFontVariant => Boolean(variant))
        .map((variant) =>
          variant.bold
            ? variant.italic
              ? "boldItalic"
              : "bold"
            : variant.italic
              ? "italic"
              : "regular",
        ),
    );
    if (
      !regular ||
      variants.some((variant) => !variant?.fontFace) ||
      need.roles.some((role) => !roles.has(role))
    )
      throw Error("missing_face");
    if (!current(id, scope, need)) return;
    const selectedRecords = records.filter((_, index) => {
      const variant = variants[index]!;
      const role = variant.bold
        ? variant.italic
          ? "boldItalic"
          : "bold"
        : variant.italic
          ? "italic"
          : "regular";
      return role === "regular" || need.roles.includes(role);
    });
    if (
      !(await live.current.onResolve({
        requirement: need,
        variant: regular,
        records: selectedRecords,
        sourceScope: scope,
      }))
    )
      throw Error("stale_font_operation");
  };
  const chooseFiles = (need: PresentationFontRequirement) => {
    chosen.current = need;
    fileInput.current?.click();
  };
  const readFiles = async (files: FileList | null) => {
    const need = chosen.current;
    if (!need || !files?.length || disabled || busy) return;
    const id = ++token.current,
      scope = scopeKey;
    setError(undefined);
    setReading(true);
    try {
      if (files.length > 4) throw Error("font_count");
      const records = await Promise.all(Array.from(files, readOfficeFontFile));
      if (records.some((record) => !record)) throw Error("invalid_font_file");
      await resolve(records as OfficeLocalFontRecord[], need, id, scope);
    } catch {
      if (token.current === id && live.current.scopeKey === scope)
        setError(failure);
    } finally {
      if (token.current === id) setReading(false);
    }
  };
  const browse = async (need: PresentationFontRequirement) => {
    const query = (
      window as Window & {
        queryLocalFonts?: () => Promise<OfficeLocalFontRecord[]>;
      }
    ).queryLocalFonts;
    if (!query) {
      chooseFiles(need);
      return;
    }
    const id = ++token.current,
      scope = scopeKey;
    setError(undefined);
    setReading(true);
    try {
      // Keep the permission-sensitive call in the original click activation.
      const fonts = await query();
      if (!current(id, scope, need)) return;
      const matchingFamilies = new Set(fonts.filter(font =>
        [font.family, font.postscriptName].some(name => typeof name === "string" && name.toLowerCase() === need.family.toLowerCase())
      ).map(font => font.family));
      const records = fonts.filter((font) => {
        if (
          typeof font.family !== "string" ||
          !matchingFamilies.has(font.family)
        )
          return false;
        const candidate = officeVerifiedFontVariant(font);
        if (!candidate) return false;
        const role = candidate.bold
          ? candidate.italic
            ? "boldItalic"
            : "bold"
          : candidate.italic
            ? "italic"
            : "regular";
        return role === "regular" || need.roles.includes(role);
      });
      await resolve(records, need, id, scope);
    } catch {
      if (token.current === id && live.current.scopeKey === scope)
        setError(failure);
    } finally {
      if (token.current === id) setReading(false);
    }
  };
  const updateLayout = async () => {
    if (!onUpdateLayout || !layoutUpdateRequired || disabled || busy || reading || updating || unavailable) return;
    const id = ++token.current, scope = scopeKey;
    setError(undefined);
    setUpdating(true);
    try {
      if (!await onUpdateLayout(scope)) throw Error("layout_update_not_completed");
    } catch {
      if (token.current === id && live.current.scopeKey === scope)
        setError(t("presentation.ui.fontResolution.layoutUpdateFailed"));
    } finally {
      if (token.current === id) setUpdating(false);
    }
  };
  if (!missing.length && !busy && !unavailable && !layoutUpdateRequired && !error && !updating) return null;
  return (
    <div
      data-testid="presentation-font-resolution"
      aria-busy={busy || reading || updating}
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        flexWrap: "wrap",
        padding: "6px 12px",
      }}
    >
      {busy || reading || updating ? (
        <span role="status">{updating || (busy && layoutUpdateRequired)
          ? t("presentation.ui.fontResolution.updatingLayout")
          : t("presentation.ui.fontResolution.matchingFonts")}</span>
      ) : null}
      {missing.map((need) => (
        <span
          key={need.family}
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <span>
            {t("presentation.ui.fontResolution.missingFont", {
              family: need.family,
            })}
          </span>
          <button
            type="button"
            disabled={disabled || busy || reading}
            onClick={() => void browse(need)}
          >
            {t("presentation.ui.fontResolution.matchFont")}
          </button>
          <button
            type="button"
            disabled={disabled || busy || reading}
            onClick={() => chooseFiles(need)}
          >
            {t("presentation.ui.fontResolution.chooseFiles")}
          </button>
        </span>
      ))}
      {!missing.length && layoutUpdateRequired ? (
        <button type="button" data-testid="presentation-layout-update"
          disabled={disabled || busy || reading || updating || unavailable || !onUpdateLayout}
          onClick={() => void updateLayout()}>{t("presentation.ui.fontResolution.updateLayout")}</button>
      ) : null}
      {!missing.length && unavailable && !busy ? (
        <span role="status">
          {t("presentation.ui.fontResolution.notReady")}
        </span>
      ) : null}
      <input
        ref={fileInput}
        type="file"
        accept=".ttf,.otf"
        multiple
        hidden
        data-testid="presentation-font-files"
        disabled={disabled || busy || reading}
        onChange={(event) => {
          void readFiles(event.target.files);
          event.target.value = "";
        }}
      />
      {error ? <span role="alert">{error}</span> : null}
    </div>
  );
}
