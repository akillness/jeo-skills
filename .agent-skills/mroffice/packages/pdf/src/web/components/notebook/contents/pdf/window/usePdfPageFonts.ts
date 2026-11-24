/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The fonts from readers' computers a PDF page keeps (lib/pdf/page-fonts.ts),
 * for an editor of that page: the list (each face registered for drawing)
 * and the preparation of a family found on this computer (Browse). WPS sets
 * text in any installed font; Chrome and Edge read it and the page keeps it,
 * and where it cannot be (another browser, the reader said no, its licence
 * forbids embedding) the nearest served family is set instead, and said.
 */

import { createContext, createElement, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { toast } from "@mrnote/core/web/hooks/use-toast.ts";
import { officeFamilyDisplayNames } from "@mrnote/core/web/lib/office-fonts/localized-names.ts";
import { nearestServedPdfFamily, pdfPageFontFamilyToken, type PdfPageFont } from "../../../../../lib/pdf/page-fonts";
import {
  PdfLocalFontError,
  listPdfPageFonts,
  pdfLocalFontsReadable,
  preparePdfPageFont,
  registerPdfPageFontFace,
  type PdfLocalFontRefusal,
} from "../../../../../lib/pdf/page-fonts-browser";

export type PdfPageFontPreparation = (
  family: string,
  style: Readonly<{ bold: boolean; italic: boolean }>,
  /** The text the family is chosen for: kept with the common characters. */
  text?: string,
) => Promise<Readonly<{ family: string; notice?: string }>>;

export function usePdfPageFonts(pageId: string): Readonly<{
  pageFonts: readonly PdfPageFont[];
  preparePageFont: PdfPageFontPreparation;
}> {
  const t = useTranslations("console-notebooks");
  const locale = useLocale();
  const [pageFonts, setPageFonts] = useState<readonly PdfPageFont[]>([]);
  useEffect(() => {
    let live = true;
    void listPdfPageFonts(pageId).then((fonts) => {
      if (!live) return;
      setPageFonts(fonts);
      for (const font of fonts) void registerPdfPageFontFace(font).catch(() => undefined);
    });
    return () => { live = false; };
  }, [pageId]);
  const preparePageFont = useCallback<PdfPageFontPreparation>(async (family, style, text = "") => {
    const reasons: Record<PdfLocalFontRefusal, string> = {
      unsupported: t("pdf.pageFonts.reason.unsupported"),
      denied: t("pdf.pageFonts.reason.denied"),
      missing: t("pdf.pageFonts.reason.missing"),
      restricted: t("pdf.pageFonts.reason.restricted"),
      failed: t("pdf.pageFonts.reason.failed"),
    };
    const substitute = (code: PdfLocalFontRefusal) => {
      const name = nearestServedPdfFamily(family);
      return {
        family: name,
        notice: t("pdf.pageFonts.substituted", {
          family, reason: reasons[code], substitute: officeFamilyDisplayNames(locale)[name] ?? name,
        }),
      };
    };
    if (!pdfLocalFontsReadable()) return substitute("unsupported");
    toast({ description: t("pdf.pageFonts.preparing", { family }) });
    try {
      const font = await preparePdfPageFont(pageId, family, style, text);
      setPageFonts(await listPdfPageFonts(pageId));
      return { family: pdfPageFontFamilyToken(font) };
    } catch (error) {
      return substitute(error instanceof PdfLocalFontError ? error.code : "failed");
    }
  }, [locale, pageId, t]);
  return { pageFonts, preparePageFont };
}

type PdfPageFontsValue = ReturnType<typeof usePdfPageFonts>;

const PdfPageFontsContext = createContext<PdfPageFontsValue | null>(null);

/** The page's fonts for every editor inside a page window (the text-box
 * overlay reads them without its props carrying them). */
export function PdfPageFontsProvider({ pageId, children }: { pageId: string; children: ReactNode }) {
  const value = usePdfPageFonts(pageId);
  return createElement(PdfPageFontsContext.Provider, { value }, children);
}

/** The page fonts of the window this editor is in, or null outside one. */
export function usePdfPageFontsInWindow(): PdfPageFontsValue | null {
  return useContext(PdfPageFontsContext);
}
