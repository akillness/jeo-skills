"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { subscribeEditorSurfaceEditable } from "@mrnote/core/web/components/console/editor/useEditorSurfaceEditable.ts";
import { Node, mergeAttributes } from "@tiptap/core";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import { reactNodeViewWithLivePosition } from "@mrnote/core/web/components/console/editor/extensions/reactNodeViewPosition.tsx";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import {
  FileText,
  Brain,
  BookOpen,
  Link2,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { apiGet, apiPost } from "@mrnote/core/web/lib/api.ts";
import { useWindowManagerActions } from "@mrnote/core/web/components/notebook/WindowManager.tsx";
import { currentNodeViewMutationTarget } from "./nodeViewWriteAuthority";

type TargetType = "page" | "memory" | "study_chunk";

// Historical study_chunk blocks remain renderable, but retired Study product
// references cannot be created or opened.
const PICKER_TABS: readonly TargetType[] = ["page", "memory"];

interface ReferenceAttrs {
  target_type: TargetType | "";
  target_id: string;
  title: string;
  snippet: string;
}

interface ReferenceBlockOptions {
  /**
   * Guest mode (public marketing demo). When `true` the picker's page/memory
   * search fetches are skipped (they would 401), so an
   * unauthenticated visitor never fires reference-search authed calls. Defaults
   * to `false` → the authenticated console searches exactly as before.
   */
  guestMode: boolean;
}

interface ReferenceSearchHit {
  id: string;
  title: string;
  snippet: string;
}

type ReferenceSearchState = "loading" | "ready" | "failed";

interface ReferenceSearchSnapshot {
  authority: string;
  state: Exclude<ReferenceSearchState, "loading">;
  results: ReferenceSearchHit[];
}

const MAX_REFERENCE_RESULTS = 100;
const MAX_REFERENCE_TITLE_LENGTH = 240;
const MAX_REFERENCE_SNIPPET_LENGTH = 240;

function referenceId(value: unknown): string | null {
  return typeof value === "string" &&
    value.length <= 128 &&
    /^[A-Za-z0-9._:-]+$/u.test(value)
    ? value
    : null;
}

function referenceText(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return null;
  return value
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .trim()
    .slice(0, maximum);
}

function optionalReferenceText(value: unknown, maximum: number): string | null {
  return value === null || value === undefined
    ? ""
    : referenceText(value, maximum);
}

function normalizePageReferenceHits(
  value: unknown,
  fallbackTitle: string,
): ReferenceSearchHit[] | null {
  if (
    !value ||
    typeof value !== "object" ||
    !Array.isArray((value as { items?: unknown }).items)
  ) {
    return null;
  }
  const items = (value as { items: unknown[] }).items;
  if (items.length > MAX_REFERENCE_RESULTS) return null;
  const results: ReferenceSearchHit[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const record = item as Record<string, unknown>;
    const id = referenceId(record.id);
    const title = optionalReferenceText(record.title, MAX_REFERENCE_TITLE_LENGTH);
    const snippet = optionalReferenceText(
      record.plain_text,
      MAX_REFERENCE_SNIPPET_LENGTH,
    );
    if (!id || title === null || snippet === null) return null;
    results.push({ id, title: title || fallbackTitle, snippet });
  }
  return results;
}

function normalizeMemoryReferenceHits(
  value: unknown,
  fallbackTitle: string,
): ReferenceSearchHit[] | null {
  if (!Array.isArray(value) || value.length > MAX_REFERENCE_RESULTS) return null;
  const results: ReferenceSearchHit[] = [];
  for (const hit of value) {
    if (!hit || typeof hit !== "object" || Array.isArray(hit)) return null;
    const memory = (hit as { memory?: unknown }).memory;
    if (memory === null || memory === undefined) continue;
    if (typeof memory !== "object" || Array.isArray(memory)) return null;
    const record = memory as Record<string, unknown>;
    const id = referenceId(record.id);
    const title = optionalReferenceText(
      record.title,
      MAX_REFERENCE_TITLE_LENGTH,
    );
    const content = optionalReferenceText(
      record.content,
      MAX_REFERENCE_SNIPPET_LENGTH,
    );
    if (!id || title === null || content === null) return null;
    results.push({
      id,
      title: title || content.slice(0, 80) || fallbackTitle,
      snippet: content,
    });
  }
  return results;
}

function iconFor(target: TargetType | "") {
  if (target === "memory") return <Brain size={14} />;
  if (target === "study_chunk") return <BookOpen size={14} />;
  return <FileText size={14} />;
}

function extractNotebookId(): string | null {
  if (typeof window === "undefined") return null;
  const m = window.location.pathname.match(/\/notebooks\/([^/?#]+)/);
  return m ? m[1] : null;
}

export function referenceBlockMutationIsAuthorized(
  editor: Pick<NodeViewProps["editor"], "isDestroyed" | "isEditable" | "state">,
  getPos: NodeViewProps["getPos"],
  expectedNode: NodeViewProps["node"],
): boolean {
  return Boolean(
    currentNodeViewMutationTarget(
      editor,
      getPos,
      expectedNode,
      "reference",
    ),
  );
}

export function ReferencePickerDialog({
  notebookId,
  guestMode,
  canEdit = true,
  onPick,
  onClose,
}: {
  notebookId: string;
  guestMode: boolean;
  canEdit?: boolean;
  onPick: (attrs: ReferenceAttrs) => void;
  onClose: () => void;
}) {
  const t = useTranslations("console-notebooks");
  const tCommon = useTranslations("common");
  const [tab, setTab] = useState<TargetType>("page");
  const [q, setQ] = useState("");
  const [retryGeneration, setRetryGeneration] = useState(0);
  const [searchSnapshot, setSearchSnapshot] =
    useState<ReferenceSearchSnapshot | null>(null);
  const requestGenerationRef = useRef(0);
  const translateRef = useRef(t);
  const searchAuthority = `${guestMode ? "guest" : "member"}\u0000${notebookId}\u0000${tab}\u0000${q}\u0000${retryGeneration}`;
  const searchState: ReferenceSearchState = guestMode
    ? "ready"
    : searchSnapshot?.authority === searchAuthority
      ? searchSnapshot.state
      : "loading";
  const results =
    !guestMode && searchSnapshot?.authority === searchAuthority
      ? searchSnapshot.results
      : [];

  useEffect(() => {
    translateRef.current = t;
  }, [t]);

  useEffect(() => {
    // Guest demo: never fire the page/memory search authed calls (they
    // would 401). The picker stays open with no results (`results` initializes
    // empty, so there is nothing to reset).
    if (guestMode) return;
    const generation = ++requestGenerationRef.current;
    const controller = new AbortController();
    const requestIsCurrent = () =>
      generation === requestGenerationRef.current &&
      !controller.signal.aborted;
    const handle = setTimeout(() => {
      if (tab === "page") {
        void apiGet<unknown>(
          `/api/v1/pages/search?q=${encodeURIComponent(q)}&notebook_id=${notebookId}`,
          { signal: controller.signal },
        )
          .then((r) => {
            if (!requestIsCurrent()) return;
            const results = normalizePageReferenceHits(
              r,
              translateRef.current("reference.fallback.page"),
            );
            if (!results) throw new Error("reference_search_response_invalid");
            setSearchSnapshot({
              authority: searchAuthority,
              state: "ready",
              results,
            });
          })
          .catch(() => {
            if (!requestIsCurrent()) return;
            setSearchSnapshot({
              authority: searchAuthority,
              state: "failed",
              results: [],
            });
          });
      } else if (tab === "memory") {
        void apiPost<unknown>(
          "/api/v1/memory/search",
          { notebook_id: notebookId, query: q || "memory", top_k: 10 },
          { signal: controller.signal },
        )
          .then((r) => {
            if (!requestIsCurrent()) return;
            const results = normalizeMemoryReferenceHits(
              r,
              translateRef.current("reference.fallback.memory"),
            );
            if (!results) throw new Error("reference_search_response_invalid");
            setSearchSnapshot({
              authority: searchAuthority,
              state: "ready",
              results,
            });
          })
          .catch(() => {
            if (!requestIsCurrent()) return;
            setSearchSnapshot({
              authority: searchAuthority,
              state: "failed",
              results: [],
            });
          });
      }
    }, 250);
    return () => {
      clearTimeout(handle);
      controller.abort();
      requestGenerationRef.current += 1;
    };
  }, [tab, q, notebookId, guestMode, retryGeneration, searchAuthority]);

  return (
    <div
      className="reference-picker"
      role="dialog"
      aria-label={t("reference.pickerTitle")}
      data-testid="reference-picker"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
    >
      <div className="reference-picker__tabs">
        {PICKER_TABS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setTab(k);
            }}
            className={tab === k ? "is-active" : ""}
            data-testid={`reference-picker-tab-${k}`}
          >
            {k === "page"
              ? t("reference.tabs.pages")
              : k === "memory"
                ? t("reference.tabs.memory")
                : t("reference.tabs.chunks")}
          </button>
        ))}
        <button type="button" onClick={onClose} className="reference-picker__close" aria-label={tCommon("dialog.close")}>
          ×
        </button>
      </div>
      <input
        type="text"
        autoFocus
        placeholder={t("reference.searchPlaceholder")}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
        }}
        className="reference-picker__search"
        data-testid="reference-picker-search"
      />
      <ul className="reference-picker__results">
        {results.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => {
                if (!canEdit) return;
                onPick({
                  target_type: tab,
                  target_id: item.id,
                  title: item.title,
                  snippet: item.snippet,
                });
              }}
              data-testid="reference-picker-item"
            >
              <div className="reference-picker__item-title">{item.title}</div>
              {item.snippet && (
                <div className="reference-picker__item-snippet">{item.snippet}</div>
              )}
            </button>
          </li>
        ))}
        {searchState === "loading" ? (
          <li className="reference-picker__empty" role="status">
            {t("reference.searching")}
          </li>
        ) : searchState === "failed" ? (
          <li className="reference-picker__empty" role="alert">
            <span>{t("reference.searchFailed")}</span>
            <button
              type="button"
              data-testid="reference-picker-retry"
              onClick={() => setRetryGeneration((current) => current + 1)}
            >
              {t("reference.retry")}
            </button>
          </li>
        ) : results.length === 0 ? (
          <li className="reference-picker__empty">
            {t("reference.noResults")}
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function ReferenceBlockView(props: NodeViewProps) {
  const t = useTranslations("console-notebooks");
  const { editor, getPos, node, updateAttributes } = props;
  const attrs = node.attrs as ReferenceAttrs;
  const [picking, setPicking] = useState(!attrs.target_id);
  const [editable, setEditable] = useState(
    () => !editor.isDestroyed && editor.isEditable,
  );
  const cardRef = useRef<HTMLButtonElement | null>(null);
  const { openWindow } = useWindowManagerActions();
  const notebookId = extractNotebookId();
  const guestMode = Boolean(
    (props.extension.options as ReferenceBlockOptions).guestMode,
  );

  useEffect(() => {
    const syncEditable = () =>
      setEditable(!editor.isDestroyed && editor.isEditable);
    const unsubscribe = subscribeEditorSurfaceEditable(editor, syncEditable);
    return () => {
      unsubscribe();
    };
  }, [editor]);

  const handlePick = useCallback(
    (next: ReferenceAttrs) => {
      if (!referenceBlockMutationIsAuthorized(editor, getPos, node)) {
        return;
      }
      updateAttributes(next);
      setPicking(false);
      window.requestAnimationFrame(() => cardRef.current?.focus());
    },
    [editor, getPos, node, updateAttributes],
  );

  const closePicker = useCallback(() => {
    setPicking(false);
    window.requestAnimationFrame(() => cardRef.current?.focus());
  }, []);

  const handleOpen = useCallback(() => {
    if (!notebookId || !attrs.target_type || !attrs.target_id) return;
    if (attrs.target_type === "page") {
      openWindow({
        type: "note",
        title: attrs.title || t("reference.fallback.page"),
        meta: { notebookId, pageId: attrs.target_id },
      });
    } else if (attrs.target_type === "memory") {
      openWindow({
        type: "memory_graph",
        title: attrs.title || t("reference.fallback.memory"),
        meta: { notebookId, memoryId: attrs.target_id },
      });
    }
  }, [attrs, notebookId, openWindow, t]);

  return (
    <NodeViewWrapper
      className="reference-block"
      data-testid="reference-block"
      contentEditable={false}
    >
      {picking && notebookId ? (
        <ReferencePickerDialog
          notebookId={notebookId}
          guestMode={guestMode}
          canEdit={editable}
          onPick={handlePick}
          onClose={closePicker}
        />
      ) : (
        <button
          ref={cardRef}
          type="button"
          onClick={handleOpen}
          className="reference-block__card"
          data-testid="reference-block-open"
        >
          {iconFor(attrs.target_type)}
          <div className="reference-block__content">
            <div className="reference-block__title">
              {attrs.title || t("reference.fallback.unnamed")}
            </div>
            {attrs.snippet && (
              <div className="reference-block__snippet">{attrs.snippet}</div>
            )}
          </div>
          <Link2 size={12} />
        </button>
      )}
    </NodeViewWrapper>
  );
}

const ReferenceBlock = Node.create<ReferenceBlockOptions>({
  name: "reference",
  group: "block",
  atom: true,
  draggable: true,

  addOptions() {
    return {
      guestMode: false,
    };
  },

  addAttributes() {
    return {
      target_type: { default: "" },
      target_id: { default: "" },
      title: { default: "" },
      snippet: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="reference"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "reference" })];
  },

  addNodeView() {
    return reactNodeViewWithLivePosition(ReferenceBlockView);
  },
});

export default ReferenceBlock;
