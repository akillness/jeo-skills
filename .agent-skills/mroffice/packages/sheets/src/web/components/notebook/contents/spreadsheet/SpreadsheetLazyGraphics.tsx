"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Suspense } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import type { OfficeShapePreviewProps } from "@mrnote/core/web/components/office-ribbon/OfficeShapeCatalogPanel.tsx";
import type { OfficeSmartArtInsertGalleryProps } from "@mrnote/core/web/components/office-ribbon/OfficeSmartArtInsertGallery.tsx";
import { createSpreadsheetLazyDialog, type SpreadsheetLazyRecoveryState } from "./SpreadsheetLazyDialogs";

/** A transient state inside the existing drawing frame, never substitute geometry.
 * The host still owns its anchor, text, selection and native package serialization. */
function GraphicsLoading() {
  const t = useTranslations("console-notebooks");
  return <span role="status" data-spreadsheet-graphics-state="loading" className="flex h-full w-full items-center justify-center text-xs" aria-label={t("common.loading")}>…</span>;
}

function GraphicsFailure({ retry, close, reload, recovering }: { retry(): void; close?: () => void; reload: (() => void) | null; recovering: SpreadsheetLazyRecoveryState }) {
  const t = useTranslations("console-notebooks");
  return <span role="alert" data-spreadsheet-graphics-state="error" className="flex h-full w-full flex-wrap items-center justify-center gap-1 text-xs"
    onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
    <span>{recovering === "unsaved" ? t("spreadsheet.dialogLoadReloadBlocked") : t("spreadsheet.dialogLoadFailed")}</span>
    <button type="button" onClick={retry}>{t("window.error.retry")}</button>
    {close ? <button type="button" onClick={close}>{t("common.close")}</button> : null}
    {reload || recovering === "saving" ? <button type="button" disabled={recovering === "saving"} onClick={reload ?? undefined} data-testid="spreadsheet-graphics-load-reload">{t("spreadsheet.dialogLoadReload")}</button> : null}
  </span>;
}

const shape = createSpreadsheetLazyDialog<OfficeShapePreviewProps>(
  () => import("@mrnote/core/web/components/notebook/contents/presentation/PresentationPresetShapePreview.tsx").then(module => ({ default: module.PresentationPresetShapePreview })),
  () => {}, // Loading failures must never delete or hide an existing drawing.
  (retry, _close, reload, recovering) => <GraphicsFailure retry={retry} reload={reload} recovering={recovering} />,
);

type GalleryProps = OfficeSmartArtInsertGalleryProps & { onClose(): void };
const gallery = createSpreadsheetLazyDialog<GalleryProps>(
  () => import("@mrnote/core/web/components/office-ribbon/OfficeSmartArtInsertGallery.tsx").then(module => ({ default: module.OfficeSmartArtInsertGallery })),
  props => props.onClose(),
  (retry, close, reload, recovering) => <GraphicsFailure retry={retry} close={close} reload={reload} recovering={recovering} />,
);

export function PresentationShapePreview(props: OfficeShapePreviewProps) {
  return <Suspense fallback={<GraphicsLoading />}><shape.Component {...props} /></Suspense>;
}

export function OfficeSmartArtInsertGallery(props: GalleryProps) {
  return <Suspense fallback={<GraphicsLoading />}><gallery.Component {...props} /></Suspense>;
}

/** Hover/focus is write-free and failure is contained until the surface opens. */
export const preloadSpreadsheetShapePreview = shape.preload;
export const preloadSpreadsheetSmartArtGallery = gallery.preload;
