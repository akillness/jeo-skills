"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useEffect } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import {
  notifyBuiltinCaptionLabelNames,
  setBuiltinCaptionLabelNames,
} from "@mrnote/core/web/components/console/editor/native-document/captions.ts";

/**
 * Install Word's built-in caption label names for the app language (图表 /
 * 表格 / 公式, Abbildung / Tabelle / Formel, ...) so every surface that
 * derives a caption prefix — the caption block, cross-references, tables of
 * figures, the export projection — reads them. Mounted by the editor shell.
 *
 * The names are written while rendering, before the caption views below this
 * component mount, and already-mounted views are told afterwards.
 */
export function useCaptionLabelLocale(): void {
  const t = useTranslations("console-notebooks");
  const figure = t("toolbar.captionLabelName_figure");
  const table = t("toolbar.captionLabelName_table");
  const equation = t("toolbar.captionLabelName_equation");
  setBuiltinCaptionLabelNames({ figure, table, equation });
  useEffect(() => {
    notifyBuiltinCaptionLabelNames();
  }, [figure, table, equation]);
}
