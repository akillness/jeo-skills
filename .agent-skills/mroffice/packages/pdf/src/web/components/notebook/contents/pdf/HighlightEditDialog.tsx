"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { EditorLoadingState } from "@mrnote/core/web/components/ui/editor-loading-state.tsx";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Link2,
  Trash2,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import {
  CommentMentionNotice,
  MentionInput,
  MentionText,
  MentionTextarea,
  type CommentMentionsController,
} from "@mrnote/core/web/components/office-comments/CommentMentions.tsx";
import { officeDialogParts as parts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { apiDelete, apiGet, apiPatch } from "@mrnote/core/web/lib/api.ts";
import ConfirmDialog from "@mrnote/core/web/components/ui/ConfirmDialog.tsx";
import {
  MAX_REPLY_TEXT,
  type PdfAnnotationAuthor,
  type PdfAnnotationReply,
} from "@mrnote/core/web/lib/pdf/annotation-replies.ts";
import {
  HIGHLIGHT_MARKUP_STYLES,
  type HighlightMarkupStyle,
} from "@mrnote/core/web/lib/pdf/highlight-markup.ts";
import { isSafeHexColor } from "@mrnote/core/web/lib/pdf/safe-color.ts";
import type { ManagedPdfTextMarkup } from "@mrnote/core/web/lib/pdf/native-text-markup-writeback.ts";

/** Highlight fill opacity for a free (picked) color — keeps text readable. */
const HIGHLIGHT_CUSTOM_ALPHA = 0.4;

/**
 * Convert a strict `#rrggbb` hex (what an `<input type=color>` emits) into a
 * translucent `rgba(...)` so a freely-picked highlight color reads like a
 * highlighter (the underlying text stays visible) instead of an opaque block.
 * Returns null for anything that isn't a safe 6-digit hex.
 */
function hexToHighlightRgba(hex: string): string | null {
  if (!isSafeHexColor(hex) || hex.length !== 7) return null;
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${HIGHLIGHT_CUSTOM_ALPHA})`;
}

/** Best-effort `rgba(...)`/`#rrggbb` → `#rrggbb` for the color input's value. */
function highlightColorToHex(value: string): string {
  if (isSafeHexColor(value) && value.length === 7) return value;
  const m = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!m) return "#fcd34d";
  const toHex = (n: string) =>
    Math.max(0, Math.min(255, Number.parseInt(n, 10)))
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(m[1])}${toHex(m[2])}${toHex(m[3])}`;
}

export type HighlightLink =
  | { kind: "page"; id: string; label?: string }
  | { kind: "memory"; id: string; label?: string };

export interface HighlightDraft {
  id: string;
  page: number;
  text: string;
  color: string;
  createdAt?: string;
  rects: Array<{ x: number; y: number; width: number; height: number }>;
  /** Slanted source quads, one per rect (page percent, PDF vertex order). */
  quads?: number[][];
  note?: string;
  links?: HighlightLink[];
  markupStyle?: HighlightMarkupStyle;
  nativeMarkup?: ManagedPdfTextMarkup;
  /** Creator identity; absent on legacy highlights created before authors. */
  author?: PdfAnnotationAuthor;
  /** Comment-thread replies (Acrobat / WPS PDF "Reply"); absent for none. */
  replies?: PdfAnnotationReply[];
  /** Stable XFDF `name`/fingerprint retained across server-generated ids. */
  xfdfSourceId?: string;
}

interface HighlightEditDialogProps {
  open: boolean;
  notebookId: string;
  highlight: HighlightDraft | null;
  onClose: () => void;
  /** Called after a successful PATCH; parent should merge into local state. */
  onSaved?: (next: HighlightDraft) => void | Promise<void>;
  /** Called after a successful DELETE; parent should drop from local state. */
  onDeleted?: (id: string) => void | Promise<void>;
  /**
   * Post a reply to this highlight's thread. The PARENT persists (it owns the
   * authoritative saved state, so a reply never sneaks unsaved color/note
   * drafts into the PATCH) and returns the stored reply, or null on failure.
   * The composer is hidden when absent.
   */
  onAddReply?: (
    highlight: HighlightDraft,
    text: string,
  ) => Promise<PdfAnnotationReply | null>;
  /** @mentions for this page (null: guests, read-only previews). */
  mentions?: CommentMentionsController | null;
}

interface NotebookPageItem {
  id: string;
  title: string;
}

const HIGHLIGHT_COLORS: Array<{ id: string; value: string; label: string }> = [
  { id: "yellow", value: "rgba(252, 211, 77, 0.45)", label: "yellow" },
  { id: "green", value: "rgba(134, 239, 172, 0.5)", label: "green" },
  { id: "blue", value: "rgba(147, 197, 253, 0.5)", label: "blue" },
  { id: "pink", value: "rgba(249, 168, 212, 0.55)", label: "pink" },
  { id: "purple", value: "rgba(196, 181, 253, 0.55)", label: "purple" },
];

export default function HighlightEditDialog({
  open,
  notebookId,
  highlight,
  onClose,
  onSaved,
  onDeleted,
  onAddReply,
  mentions = null,
}: HighlightEditDialogProps) {
  const t = useTranslations("console-notebooks");
  const [note, setNote] = useState("");
  const [color, setColor] = useState(HIGHLIGHT_COLORS[0].value);
  const [markupStyle, setMarkupStyle] =
    useState<HighlightMarkupStyle>("highlight");
  const [links, setLinks] = useState<HighlightLink[]>([]);
  const [replies, setReplies] = useState<PdfAnnotationReply[]>([]);
  const [replyDraft, setReplyDraft] = useState("");
  const [replySaving, setReplySaving] = useState(false);
  const [pages, setPages] = useState<NotebookPageItem[]>([]);
  const [loadingPages, setLoadingPages] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const noteRef = useRef<HTMLTextAreaElement | null>(null);
  const mutationInFlightRef = useRef(false);

  // Hydrate when opening / switching highlight.
  useEffect(() => {
    if (!open || !highlight) return;
    setNote(highlight.note || "");
    setColor(highlight.color || HIGHLIGHT_COLORS[0].value);
    setMarkupStyle(highlight.markupStyle || "highlight");
    setLinks(highlight.links || []);
    setReplies(highlight.replies || []);
    setReplyDraft("");
    setError(null);
  }, [highlight, open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingPages(true);
    void (async () => {
      try {
        const data = await apiGet<{ items: NotebookPageItem[] }>(
          `/api/v1/notebooks/${notebookId}/pages?limit=200`,
        );
        if (!cancelled) setPages(data.items || []);
      } catch {
        if (!cancelled) setPages([]);
      } finally {
        if (!cancelled) setLoadingPages(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [notebookId, open]);

  const togglePageLink = useCallback((page: NotebookPageItem) => {
    setLinks((prev) => {
      const existing = prev.findIndex(
        (l) => l.kind === "page" && l.id === page.id,
      );
      if (existing >= 0) {
        return prev.filter((_, i) => i !== existing);
      }
      return [...prev, { kind: "page", id: page.id, label: page.title }];
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!highlight || mutationInFlightRef.current) return;
    mutationInFlightRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const nextPayload = {
        page: highlight.page,
        text: highlight.text,
        rects: highlight.rects,
        ...(highlight.quads ? { quads: highlight.quads } : {}),
        color,
        note: note.trim() || undefined,
        links,
        style: markupStyle,
        // Pass the thread + creator through so a full-payload PATCH never
        // wipes them (keys omitted when absent — byte-clean for legacy rows).
        ...(highlight.author ? { author: highlight.author } : {}),
        ...(replies.length > 0 ? { replies } : {}),
        ...(highlight.xfdfSourceId
          ? { xfdfSourceId: highlight.xfdfSourceId }
          : {}),
      };
      const nextHighlight = {
        ...highlight,
        color,
        note: note.trim() || undefined,
        links,
        markupStyle,
        replies,
      };
      if (onSaved) {
        await onSaved(nextHighlight);
      } else {
        await apiPatch(`/api/v1/annotations/${highlight.id}`, {
          payload_json: nextPayload,
        });
      }
      mentions?.notifyPosted({
        threadRef: highlight.id,
        messageRef: highlight.id,
        text: note.trim(),
        previousText: highlight.note ?? "",
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("references.saveFailed"));
    } finally {
      mutationInFlightRef.current = false;
      setSaving(false);
    }
  }, [
    color,
    highlight,
    links,
    markupStyle,
    mentions,
    note,
    onClose,
    onSaved,
    replies,
    t,
  ]);

  // Post one reply through the parent (which PATCHes the persisted payload)
  // and mirror the stored reply into the local thread on success.
  const handlePostReply = useCallback(async () => {
    if (!highlight || !onAddReply || mutationInFlightRef.current) return;
    const text = replyDraft.trim();
    if (!text) return;
    mutationInFlightRef.current = true;
    setReplySaving(true);
    setError(null);
    try {
      const stored = await onAddReply(highlight, text);
      if (stored) {
        mentions?.notifyPosted({
          threadRef: highlight.id,
          messageRef: stored.id,
          text: stored.text,
        });
        setReplies((prev) => [...prev, stored]);
        setReplyDraft("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("references.saveFailed"));
    } finally {
      mutationInFlightRef.current = false;
      setReplySaving(false);
    }
  }, [highlight, mentions, onAddReply, replyDraft, t]);

  const handleDelete = useCallback(() => {
    if (!highlight || mutationInFlightRef.current) return;
    setDeleteConfirmOpen(true);
  }, [highlight]);

  const performDelete = useCallback(async () => {
    if (!highlight || mutationInFlightRef.current) return;
    mutationInFlightRef.current = true;
    setDeleting(true);
    setError(null);
    try {
      if (onDeleted) await onDeleted(highlight.id);
      else await apiDelete(`/api/v1/annotations/${highlight.id}`);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("highlightEdit.deleteFailed"),
      );
    } finally {
      mutationInFlightRef.current = false;
      setDeleting(false);
    }
  }, [highlight, onClose, onDeleted, t]);

  if (!open || !highlight) return null;

  const linkedPageIds = new Set(
    links.filter((l) => l.kind === "page").map((l) => l.id),
  );

  return (
    <OfficeDialogShell
      open={open}
      title={t("highlightEdit.title")}
      description={t("highlightEdit.notePlaceholder")}
      defaultActionLabel={
        <span className="inline-flex items-center gap-2">
          <CheckCircle2 size={13} aria-hidden />
          {t("highlightEdit.save")}
        </span>
      }
      busyActionLabel={
        <span className="inline-flex items-center gap-2">
          <Loader2 size={13} className="animate-spin" aria-hidden />
          {t("highlightEdit.save")}
        </span>
      }
      cancelActionLabel={t("common.cancel")}
      onDefaultAction={() => void handleSave()}
      onCancel={onClose}
      busy={saving || deleting}
      initialFocusRef={noteRef}
      className="max-h-[calc(100vh-40px)] overflow-y-auto sm:max-w-[560px]"
      testIdPrefix="highlight-edit"
    >
      <blockquote className="highlight-edit-dialog__snippet">
        {highlight.text || t("highlightEdit.emptyText")}
        <small>
          p.{highlight.page}
          {highlight.author?.displayName ? (
            // Creator identity — plain text node, never HTML.
            <span data-testid="highlight-edit-author" style={{ marginLeft: 6 }}>
              · {highlight.author.displayName}
            </span>
          ) : null}
        </small>
      </blockquote>

      <CommentMentionNotice mentions={mentions} />
      {error ? (
        <div className="quote-to-page-dialog__error">
          <AlertCircle size={14} />
          {error}
        </div>
      ) : null}

      <div className="highlight-edit-dialog__section">
        <label htmlFor="highlight-note">{t("highlightEdit.noteLabel")}</label>
        <MentionTextarea
          mentions={mentions}
          ref={noteRef}
          id="highlight-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("highlightEdit.notePlaceholder")}
          rows={3}
        />
      </div>

      <div className="highlight-edit-dialog__section">
        <strong>{t("highlightEdit.colorLabel")}</strong>
        <div className="highlight-edit-dialog__color-row">
          {HIGHLIGHT_COLORS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setColor(opt.value)}
              title={opt.label}
              aria-label={opt.label}
              data-testid={`highlight-edit-color-${opt.id}`}
              className={`${parts.iconButton} inline-flex cursor-pointer items-center justify-center`}
            >
              <span
                aria-hidden
                className={
                  color === opt.value
                    ? "highlight-edit-dialog__swatch is-active pointer-events-none"
                    : "highlight-edit-dialog__swatch pointer-events-none"
                }
                style={{ background: opt.value, height: 18, width: 18 }}
              >
                {color === opt.value ? <CheckCircle2 size={11} /> : null}
              </span>
            </button>
          ))}
          {/* Free highlight color: the picked hex is stored as a translucent
                rgba so the underlying text stays readable (a real highlighter,
                not an opaque block). */}
          <label className={`${parts.iconButton} relative`}>
            <input
              type="color"
              className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
              data-testid="highlight-edit-color-custom"
              value={highlightColorToHex(color)}
              onChange={(e) => {
                const rgba = hexToHighlightRgba(e.target.value);
                if (rgba) setColor(rgba);
              }}
              aria-label={t("highlightEdit.colorLabel")}
              title={t("highlightEdit.colorLabel")}
            />
            <span
              aria-hidden
              className="highlight-edit-dialog__swatch pointer-events-none peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2"
              style={{
                background: highlightColorToHex(color),
                height: 18,
                width: 18,
              }}
            />
          </label>
        </div>
      </div>

      <div className="highlight-edit-dialog__section">
        <strong>{t("highlightEdit.styleLabel")}</strong>
        <div
          className="highlight-edit-dialog__style-row"
          data-testid="highlight-edit-style-row"
        >
          {HIGHLIGHT_MARKUP_STYLES.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setMarkupStyle(opt)}
              aria-pressed={markupStyle === opt}
              data-testid={`highlight-edit-style-${opt}`}
              className={`${parts.compactButton} highlight-edit-dialog__style`}
            >
              {t(`highlightEdit.style.${opt}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="highlight-edit-dialog__section">
        <strong>
          <Link2 size={12} /> {t("highlightEdit.linksLabel")}
        </strong>
        <div className="highlight-edit-dialog__pages">
          {loadingPages ? (
            <div className="quote-to-page-dialog__empty">
              <EditorLoadingState
                kind="list"
                minimal
                label={t("common.loading")}
              />
            </div>
          ) : pages.length === 0 ? (
            <div className="quote-to-page-dialog__empty">
              <span>{t("pdfSelection.noPagesYet")}</span>
            </div>
          ) : (
            <ul>
              {pages.map((p) => {
                const linked = linkedPageIds.has(p.id);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => togglePageLink(p)}
                      className={linked ? "is-linked" : undefined}
                      data-testid="highlight-edit-page"
                    >
                      <FileText size={12} />
                      <span>{p.title || t("common.untitled")}</span>
                      {linked ? <CheckCircle2 size={12} /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {onAddReply ? (
        <div className="highlight-edit-dialog__section">
          <strong>{t("highlightEdit.repliesLabel")}</strong>
          <div
            className="highlight-edit-dialog__replies"
            data-testid="highlight-edit-replies"
          >
            {replies.map((reply) => (
              <div
                key={reply.id}
                className="highlight-edit-dialog__reply"
                data-testid="highlight-edit-reply"
                style={{ fontSize: 12, marginTop: 4 }}
              >
                {reply.author?.displayName ? (
                  <span
                    className="highlight-edit-dialog__reply-author"
                    data-testid="highlight-edit-reply-author"
                    style={{ fontWeight: 600, marginRight: 4 }}
                  >
                    {reply.author.displayName}
                  </span>
                ) : null}
                {/* Plain text node — never HTML. */}
                <span className="highlight-edit-dialog__reply-text">
                  <MentionText text={reply.text} mentions={mentions} />
                </span>
              </div>
            ))}
            <MentionInput
              mentions={mentions}
              type="text"
              value={replyDraft}
              maxLength={MAX_REPLY_TEXT}
              placeholder={t("highlightEdit.replyPlaceholder")}
              aria-label={t("highlightEdit.reply")}
              disabled={replySaving || saving || deleting}
              data-testid="highlight-edit-reply-input"
              onChange={(e) => setReplyDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handlePostReply();
                }
              }}
              style={{ width: "100%", marginTop: 6, fontSize: 12 }}
            />
          </div>
        </div>
      ) : null}

      <div className="highlight-edit-dialog__footer">
        <button
          type="button"
          onClick={handleDelete}
          disabled={saving || deleting}
          className={`${parts.compactButton} highlight-edit-dialog__delete`}
          data-tone="danger"
          data-testid="highlight-edit-delete"
        >
          {deleting ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Trash2 size={12} />
          )}
          {t("highlightEdit.delete")}
        </button>
      </div>

      {/* Portaled to <body>: the floating window shell is transform-positioned,
          which would trap the fixed overlay inside the window. */}
      {deleteConfirmOpen && typeof document !== "undefined"
        ? createPortal(
            <ConfirmDialog
              open={deleteConfirmOpen}
              title={t("highlightEdit.deleteConfirm")}
              confirmVariant="destructive"
              onConfirm={() => {
                setDeleteConfirmOpen(false);
                void performDelete();
              }}
              onCancel={() => setDeleteConfirmOpen(false)}
            />,
            document.body,
          )
        : null}
    </OfficeDialogShell>
  );
}
