"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import dynamic from "@mrnote/core/host/next/dynamic.tsx";
import { WindowContentFallback } from "@mrnote/core/web/components/notebook/WindowContentFallback.tsx";

export const PdfTextEditor = dynamic(() => import("../PdfTextEditor"), {
  ssr: false,
  loading: () => (
    <WindowContentFallback kind="pdf" testId="pdf-text-module-loading" />
  ),
});
