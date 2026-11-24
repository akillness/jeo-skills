"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { EditorLoadingState } from "../../ui/editor-loading-state";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "../../../../host/next-intl";

import { OfficeTaskPane } from "../../office-ribbon/OfficeTaskPane";

export interface BacklinkItem {
  source_page_id: string;
  source_title: string;
  anchor: string | null;
  snippet: string;
}

const MAX_BACKLINK_ITEMS = 100;
const MAX_BACKLINK_TITLE_LENGTH = 240;
const MAX_BACKLINK_SNIPPET_LENGTH = 500;

function boundedBacklinkText(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return null;
  return value
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .trim()
    .slice(0, maximum);
}

export function normalizeBacklinksPayload(
  value: unknown,
): BacklinkItem[] | null {
  if (
    !value ||
    typeof value !== "object" ||
    !Array.isArray((value as { items?: unknown }).items)
  ) {
    return null;
  }
  const source = (value as { items: unknown[] }).items;
  if (source.length > MAX_BACKLINK_ITEMS) return null;
  const items: BacklinkItem[] = [];
  for (const item of source) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const record = item as Record<string, unknown>;
    const sourcePageId =
      typeof record.source_page_id === "string" &&
      record.source_page_id.length <= 128 &&
      /^[A-Za-z0-9._:-]+$/u.test(record.source_page_id)
        ? record.source_page_id
        : null;
    const sourceTitle = boundedBacklinkText(
      record.source_title,
      MAX_BACKLINK_TITLE_LENGTH,
    );
    const snippet = boundedBacklinkText(
      record.snippet,
      MAX_BACKLINK_SNIPPET_LENGTH,
    );
    const anchor =
      record.anchor === null ? null : boundedBacklinkText(record.anchor, 240);
    if (
      !sourcePageId ||
      sourceTitle === null ||
      snippet === null ||
      (anchor === null && record.anchor !== null)
    ) {
      return null;
    }
    items.push({
      source_page_id: sourcePageId,
      source_title: sourceTitle,
      anchor,
      snippet,
    });
  }
  return items;
}

interface BacklinksPanelProps {
  pageId: string;
  fetchBacklinks: (
    pageId: string,
    signal?: AbortSignal,
  ) => Promise<{ items: BacklinkItem[] }>;
  onOpenSource: (sourcePageId: string) => void;
  onClose: () => void;
}

interface BacklinksState {
  pageId: string;
  items: BacklinkItem[] | null;
  error: string | null;
}

export default function BacklinksPanel({
  pageId,
  fetchBacklinks,
  onOpenSource,
  onClose,
}: BacklinksPanelProps) {
  const t = useTranslations("console-notebooks");
  const [state, setState] = useState<BacklinksState>({
    pageId,
    items: null,
    error: null,
  });
  const [retryGeneration, setRetryGeneration] = useState(0);
  const translationsRef = useRef(t);
  useEffect(() => {
    translationsRef.current = t;
  }, [t]);
  const items = state.pageId === pageId ? state.items : null;
  const error = state.pageId === pageId ? state.error : null;

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    fetchBacklinks(pageId, controller.signal)
      .then((r) => {
        if (cancelled) return;
        const items = normalizeBacklinksPayload(r);
        if (!items) throw new Error("backlinks_response_invalid");
        setState({ pageId, items, error: null });
      })
      .catch(() => {
        if (cancelled || controller.signal.aborted) return;
        setState({
          pageId,
          items: null,
          error: translationsRef.current("backlinks.fetchFailed"),
        });
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [pageId, fetchBacklinks, retryGeneration]);

  // MRAI's own pane (Word has no backlinks), in the same docked task pane
  // frame as the Reviewing, Styles and Navigation panes beside it.
  return (
    <OfficeTaskPane
      title={t("backlinks.title")}
      closeLabel={t("backlinks.close")}
      onClose={onClose}
      testIdPrefix="backlinks"
      testId="backlinks-panel"
      autoFocusClose
      dockRight={false}
      className="ai-panel backlinks-panel"
      headerActions={
        items ? (
          <span className="backlinks-panel-count">{items.length}</span>
        ) : null
      }
    >
      <div className="backlinks-panel-body">
        {error ? (
          <div className="backlinks-panel-error" role="alert">
            <span>{error}</span>
            <button
              type="button"
              data-testid="backlinks-panel-retry"
              onClick={() => {
                setState({ pageId, items: null, error: null });
                setRetryGeneration((current) => current + 1);
              }}
            >
              {t("backlinks.retry")}
            </button>
          </div>
        ) : items === null ? (
          <div className="backlinks-panel-loading">
            <EditorLoadingState
              kind="list"
              minimal
              label={t("common.loading")}
            />
          </div>
        ) : items.length === 0 ? (
          <div className="backlinks-panel-empty">{t("backlinks.empty")}</div>
        ) : (
          items.map((item, idx) => (
            // Same source page can produce multiple PageLink rows (one per
            // occurrence in the source body). source_page_id + anchor is
            // not unique — fall back to the array index to keep React keys
            // stable per render.
            <button
              key={`${item.source_page_id}::${item.anchor ?? ""}::${idx}`}
              type="button"
              className="backlinks-panel-item"
              onClick={() => onOpenSource(item.source_page_id)}
            >
              <span className="backlinks-panel-item-title">
                {item.source_title || t("backlinks.untitled")}
              </span>
              {item.snippet ? (
                <span className="backlinks-panel-item-snippet">
                  {item.snippet}
                </span>
              ) : null}
            </button>
          ))
        )}
      </div>
    </OfficeTaskPane>
  );
}
