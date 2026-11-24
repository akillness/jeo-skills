"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * "Download and enable (about 300 MB)" on a prompt that says LibreOffice is
 * needed, in MRNote Classic (lib/desktop-libreoffice.ts): an import of a
 * .doc/.xls/.ppt/.odt/.rtf file, an OpenDocument export. Once it is
 * enabled, the operation that failed runs again.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "../../../host/next-intl";

import { ToastAction, type ToastActionElement } from "../ui/toast";
import { toast } from "../../hooks/use-toast";
import {
  canEnableLibreOfficeFor,
  desktopLibreOffice,
  enableDesktopLibreOffice,
  formatDownloadSize,
} from "../../lib/desktop-libreoffice";

function useDownloadSize(): string {
  const [bytes, setBytes] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    void desktopLibreOffice()
      ?.status()
      .then((status) => {
        if (active) setBytes(status?.offered?.downloadBytes ?? null);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  return formatDownloadSize(bytes);
}

function EnableLabel() {
  const t = useTranslations("common");
  const size = useDownloadSize();
  return <>{t("libreOffice.enable", { size })}</>;
}

/** Enable it, then say so and run `retry` (the import or export again). */
export function useEnableLibreOffice(): (retry?: () => void) => Promise<boolean> {
  const t = useTranslations("common");
  return async (retry) => {
    const outcome = await enableDesktopLibreOffice();
    if (!outcome.ok) return false;
    toast({
      title: t("libreOffice.enabled", { version: outcome.version }),
      description: retry ? t("libreOffice.retrying") : t("libreOffice.ready"),
    });
    retry?.();
    return true;
  };
}

function EnableAction({ retry }: { retry?: () => void }) {
  const t = useTranslations("common");
  const enable = useEnableLibreOffice();
  return (
    <ToastAction
      altText={t("libreOffice.enableAlt")}
      onClick={() => void enable(retry)}
      data-testid="libreoffice-enable"
    >
      <EnableLabel />
    </ToastAction>
  );
}

/**
 * The toast's action for a failure that needs LibreOffice, when the app can
 * fetch it; undefined otherwise (the site, a shell without it, any other
 * failure).
 */
export function libreOfficeToastAction(error: unknown, retry?: () => void): ToastActionElement | undefined {
  if (!canEnableLibreOfficeFor(error)) return undefined;
  return (<EnableAction retry={retry} />) as unknown as ToastActionElement;
}

/** The description to show beside that action (the server's words name libreoffice.org). */
export function LibreOfficeNeededText({ format }: { format?: string }) {
  const t = useTranslations("common");
  return <>{format ? t("libreOffice.neededFor", { format }) : t("libreOffice.needed")}</>;
}
