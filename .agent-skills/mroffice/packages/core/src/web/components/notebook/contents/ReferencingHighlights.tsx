"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  FileText,
  Highlighter,
  RefreshCw,
} from "../../office-ribbon/icons/houseIcons";
import { useTranslations } from "../../../../host/next-intl";
import { apiGet } from "../../../lib/api";
import { useWindowManagerActions } from "../WindowManager";
import { Skeleton } from "../../ui/loading-skeleton";
import { pageInterfaceLocale } from "../../../lib/i18n/content-locale";

interface ReferencingHighlightsProps {
  pageId: string;
  notebookId: string;
}

interface HighlightReference {
  annotation_id: string;
  data_item_id: string;
  asset_id: string | null;
  asset_title: string;
  page: number | null;
  text: string;
  color: string | null;
  note: string | null;
  created_at: string | null;
}

function formatRel(value: string | null): string {
  if (!value) return "";
  try {
    const d = new Date(value);
    return new Intl.DateTimeFormat(pageInterfaceLocale(), {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return value;
  }
}

export default function ReferencingHighlights({
  pageId,
  notebookId,
}: ReferencingHighlightsProps) {
  const t = useTranslations("console-notebooks");
  const { openWindow } = useWindowManagerActions();
  const [items, setItems] = useState<HighlightReference[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!pageId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ items: HighlightReference[] }>(
        `/api/v1/pages/${pageId}/highlight-references`,
      );
      setItems(data.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("references.loadFailed"));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [pageId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const openReferenceAt = useCallback(
    (ref: HighlightReference) => {
      if (!ref.asset_id && !ref.data_item_id) return;
      openWindow({
        type: "reference_document",
        title: ref.asset_title || t("references.untitled"),
        meta: {
          notebookId,
          assetId: ref.asset_id || "",
          dataItemId: ref.data_item_id,
        },
      });
      if (ref.page) {
        // Give the document window a moment to mount, then dispatch.
        // PDFViewer queues the jump if pages aren't loaded yet.
        window.setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent("mrnote:open-pdf-page", {
              detail: {
                dataItemId: ref.data_item_id,
                pageNumber: ref.page,
              },
            }),
          );
        }, 120);
      }
    },
    [notebookId, openWindow, t],
  );

  if (!loading && items.length === 0 && !error) {
    return null; // collapse silently when nothing to show
  }

  return (
    <section
      className="referencing-highlights"
      aria-label={t("highlightRefs.sectionLabel")}
      aria-busy={loading}
      data-testid="referencing-highlights"
    >
      <header>
        <strong>
          <Highlighter size={13} /> {t("highlightRefs.title")}
        </strong>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          title={t("highlightRefs.refresh")}
          aria-label={t("highlightRefs.refresh")}
        >
          <RefreshCw
            size={12}
            aria-hidden="true"
            opacity={loading ? 0.42 : 1}
          />
        </button>
      </header>
      {error ? (
        <div className="referencing-highlights__error">
          <AlertCircle size={12} />
          {error}
        </div>
      ) : null}
      {loading && items.length === 0 ? (
        <div
          className="referencing-highlights__loading-skeleton"
          data-testid="referencing-highlights-loading"
          aria-hidden="true"
        >
          {["34%", "28%", "38%", "31%", "26%"].map((width) => (
            <Skeleton key={width} className="h-2.5" style={{ width }} />
          ))}
        </div>
      ) : null}
      <ul>
        {items.map((ref) => (
          <li key={ref.annotation_id}>
            <button
              type="button"
              onClick={() => openReferenceAt(ref)}
              data-testid="referencing-highlights-item"
            >
              <span
                className="referencing-highlights__swatch"
                style={{ background: ref.color || "rgba(252, 211, 77, 0.45)" }}
                aria-hidden="true"
              />
              <span className="referencing-highlights__copy">
                <strong>{ref.asset_title || t("references.untitled")}</strong>
                <em>{ref.text || t("highlightEdit.emptyText")}</em>
                {ref.note ? (
                  <small className="is-note">{ref.note}</small>
                ) : null}
                <small>
                  <FileText size={10} />
                  {ref.page ? ` p.${ref.page}` : ""}
                  {ref.created_at ? ` · ${formatRel(ref.created_at)}` : ""}
                </small>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
