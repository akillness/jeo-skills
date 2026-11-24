"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import insertRibbonStyles from "../PdfInsertRibbonTab.module.css";
import type { Dispatch, SetStateAction, RefObject } from "react";
import { Layers, X, Lock } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogClose,
  DialogDescription,
} from "@mrnote/core/web/components/ui/dialog.tsx";
import { PDF_POPOVER_CHROME } from "./popoverChrome";
import {
  officeDialogParts,
} from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import type { OcgLayer, OcgOrderEntry } from "../../../../../lib/pdf/optional-content";
import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { PdfRibbonToolButton } from "../PdfRibbonButton";

export interface PdfLayersControlProps {
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  loading: boolean;
  ocgLayers: OcgLayer[];
  

  ocgOrder?: OcgOrderEntry[] | null;
  setLayersPanelOpen: Dispatch<SetStateAction<boolean>>;
  layersPanelOpen: boolean;
  handleToggleLayer: (id: string, visible: boolean) => void;
  layersDialogReturnFocusRef: RefObject<HTMLButtonElement | null>;
}

export function PdfLayersControl({
  t,
  loading,
  ocgLayers,
  ocgOrder = null,
  setLayersPanelOpen,
  layersPanelOpen,
  handleToggleLayer,
  layersDialogReturnFocusRef,
}: PdfLayersControlProps) {
  const layersById = new Map(ocgLayers.map((layer) => [layer.id, layer]));
  type LayerPanelRow =
    | { kind: "layer"; layer: OcgLayer; depth: number }
    | { kind: "label"; text: string; depth: number; key: string };
  const rows: LayerPanelRow[] = [];
  if (ocgOrder) {
    ocgOrder.forEach((entry, index) => {
      if (entry.kind === "label") {
        rows.push({ kind: "label", text: entry.text, depth: entry.depth, key: `label:${index}` });
        return;
      }
      const layer = layersById.get(entry.id);
      if (layer) rows.push({ kind: "layer", layer, depth: entry.depth });
    });
  } else {
    for (const layer of ocgLayers) rows.push({ kind: "layer", layer, depth: 0 });
  }
  return (
    !loading && ocgLayers.length > 0 ? (
      <div className="pdf-viewer__split">
        <PdfRibbonToolButton
          icon={<Layers size={14} />}
          data-testid="pdf-layers-toggle"
          onClick={(event) => {
            layersDialogReturnFocusRef.current = event.currentTarget;
            setLayersPanelOpen((open) => !open);
          }}
          aria-expanded={layersPanelOpen}
          aria-haspopup="dialog"
          title={t("pdfViewer.layers")}
          aria-label={t("pdfViewer.layers")}
        >
          {t("pdfViewer.layers")}
        </PdfRibbonToolButton>
        {layersPanelOpen ? (
          <Dialog
            open={layersPanelOpen}
            onOpenChange={setLayersPanelOpen}
          >
            <DialogContent
              skin="none"
              className={`${PDF_POPOVER_CHROME} ${insertRibbonStyles.decorationDialog}`}
              showCloseButton={false}
              data-testid="pdf-layers-popover"
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                layersDialogReturnFocusRef.current?.focus();
              }}
              >
              <div className={officeDialogParts.header}>
                <DialogTitle className={officeDialogParts.title}>{t("pdfViewer.layers")}</DialogTitle>
                <DialogClose
                  className={officeDialogParts.close}
                  aria-label={t("common.close")}
                >
                  <X size={14} aria-hidden="true" />
                </DialogClose>
              </div>
              <DialogDescription className="sr-only">
                {t("pdfViewer.layers")}
              </DialogDescription>
              <div className={insertRibbonStyles.decorationForm}>
            <div
              className="pdf-viewer__split-modes"
              role="group"
              aria-label={t("pdfViewer.layers")}
            >
              {rows.map((row) =>
                row.kind === "label" ? (
                  <div
                    key={row.key}
                    className="pdf-viewer__layer-group-label"
                    data-testid="pdf-layer-group-label"
                    style={{ paddingInlineStart: row.depth * 16 }}
                  >
                    {row.text}
                  </div>
                ) : (
                  <LayerRow
                    key={row.layer.id}
                    layer={row.layer}
                    depth={row.depth}
                    t={t}
                    handleToggleLayer={handleToggleLayer}
                  />
                ),
              )}
            </div>
              </div>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>
    ) : null
  );
}

function LayerRow({
  layer,
  depth,
  t,
  handleToggleLayer,
}: {
  layer: OcgLayer;
  depth: number;
  t: PdfLayersControlProps["t"];
  handleToggleLayer: PdfLayersControlProps["handleToggleLayer"];
}) {
  return (
                  <label
                    className={`${officeDialogParts.check} pdf-viewer__split-mode pdf-viewer__layer-mode`}
                    style={depth > 0 ? { paddingInlineStart: depth * 16 } : undefined}
                  >
                  <input
                    type="checkbox"
                    className={`${officeDialogParts.markInput} pdf-viewer__layer-toggle`}
                    checked={layer.visible}
                    // The author locked this group's state (/Locked):
                    // it is shown but cannot be switched here.
                    disabled={layer.locked === true}
                    aria-disabled={layer.locked === true || undefined}
                    title={layer.locked ? t("pdfViewer.layerLocked") : undefined}
                    data-pdf-layer-locked={layer.locked ? "true" : undefined}
                    onChange={(event) => {
                      if (layer.locked) return;
                      handleToggleLayer(layer.id, event.target.checked);
                    }}
                    data-testid={`pdf-layer-toggle-${layer.id}`}
                  />
                  <span
                    aria-hidden
                    className={`${officeDialogParts.mark} pdf-viewer__layer-toggle-mark`}
                  />
                  <span className="pdf-viewer__layer-name">
                    {layer.name}
                    {layer.locked ? (
                      <span className="pdf-viewer__layer-lock" aria-hidden>
                        <Lock size={12} />
                      </span>
                    ) : null}
                  </span>
                </label>
  );
}
