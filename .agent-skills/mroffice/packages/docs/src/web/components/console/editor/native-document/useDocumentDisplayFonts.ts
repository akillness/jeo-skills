"use client";
/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import type { Editor } from "@tiptap/core";
import { subscribeAuthState } from "@mrnote/core/web/lib/auth-state.ts";
import type {WordLineMetricsTarget} from "@mrnote/core/web/components/console/editor/native-document/documentWordLineMetrics.ts";
import { mountDocumentDisplayFonts, mountDocumentDisplayFontSource, readDocumentDisplayFontPlan, DOCUMENT_DISPLAY_FONT_BINDINGS_EVENT, unresolvedDocumentDisplayFontNeeds, type DocumentDisplayFontPlan, type DocumentDisplayFontFailure } from "@mrnote/core/web/components/console/editor/native-document/documentDisplayFonts.ts";

/** A page's font plan handed in whole (the server's PDF renderer): the answer
 * `GET /pages/{id}/font-bindings` gave, bound to its own page and version. */
export function useHandedDocumentDisplayFonts(editor: Editor | null, plan: unknown, enabled: boolean, lineMetricsTarget?: WordLineMetricsTarget): void {
  useEffect(() => {
    if (!editor || editor.isDestroyed || !enabled || !plan || typeof plan !== "object") return;
    const raw = plan as {page_id?: unknown; notebook_id?: unknown; content_version?: unknown};
    if (typeof raw.page_id !== "string" || typeof raw.notebook_id !== "string" || typeof raw.content_version !== "number") return;
    const expected = {pageId: raw.page_id, notebookId: raw.notebook_id, version: raw.content_version};
    const mounted = mountDocumentDisplayFontSource(editor, {
      read: async () => plan,
      parse: (response) => readDocumentDisplayFontPlan(response, expected),
      // The print waits for every drawn character's faces itself (printFontsReady).
      charactersAwaitedByCaller: true,
    }, undefined, lineMetricsTarget);
    void mounted.refresh(expected.version);
    return () => mounted.destroy();
  }, [editor, enabled, plan, lineMetricsTarget]);
}

export function useDocumentDisplayFonts(editor: Editor | null, options: {pageId: string; notebookId?: string; version?: number; enabled: boolean; lineMetricsTarget?: WordLineMetricsTarget}) {
  const [authRevision, setAuthRevision] = useState(0);
  const controller = useRef<ReturnType<typeof mountDocumentDisplayFonts> | null>(null);
  const {pageId, notebookId, version, enabled, lineMetricsTarget} = options;
  const scope = `${pageId}:${notebookId ?? ""}:${authRevision}:${lineMetricsTarget ?? ""}`;
  const [binding, setBinding] = useState<{scope: string; plan: DocumentDisplayFontPlan | null; failure?: DocumentDisplayFontFailure} | null>(null);
  useEffect(() => subscribeAuthState(() => { controller.current?.destroy(); setAuthRevision(value => value + 1); }), []);
  useEffect(() => {
    if (!editor || editor.isDestroyed || !enabled || !notebookId) return;
    const mounted = mountDocumentDisplayFonts(editor, pageId, notebookId, (plan, failure) => setBinding({scope, plan, failure}), lineMetricsTarget);
    controller.current = mounted;
    return () => { mounted.destroy(); if (controller.current === mounted) controller.current = null; };
  }, [authRevision, editor, enabled, notebookId, pageId, scope, lineMetricsTarget]);
  useEffect(() => {
    if (!enabled || !Number.isInteger(version) || version! <= 0) return;
    void controller.current?.refresh(version!);
    const changed = (event: Event) => {
      if (event instanceof CustomEvent && event.detail?.pageId === pageId) void controller.current?.refresh(version!, true);
    };
    const recovered = () => { void controller.current?.refresh(version!, true); };
    window.addEventListener(DOCUMENT_DISPLAY_FONT_BINDINGS_EVENT, changed);
    window.addEventListener("online", recovered);
    return () => {
      window.removeEventListener(DOCUMENT_DISPLAY_FONT_BINDINGS_EVENT, changed);
      window.removeEventListener("online", recovered);
    };
  }, [authRevision, editor, enabled, notebookId, pageId, version, lineMetricsTarget]);
  const plan = binding?.scope === scope ? binding.plan : null;
  const failure = binding?.scope === scope ? binding.failure : undefined;
  // A busy server can miss the 15 s deadline for a document that ships many
  // fonts (its faces are read and verified on every request). Ask again on
  // our own, twice and spaced out, before leaving it to the retry control:
  // otherwise one slow answer leaves the whole document in substitutes.
  const automaticRetries = useRef<{scope: string; count: number}>({scope: "", count: 0});
  useEffect(() => {
    if (!enabled || !failure || !Number.isInteger(version) || version! <= 0) return;
    if (failure !== "timeout" && failure !== "request" && failure !== "font") return;
    if (automaticRetries.current.scope !== scope) automaticRetries.current = {scope, count: 0};
    if (automaticRetries.current.count >= 2) return;
    const attempt = ++automaticRetries.current.count;
    const timer = window.setTimeout(() => { void controller.current?.refresh(version!, true); }, 3000 * attempt);
    return () => window.clearTimeout(timer);
    // `binding` is a new object for every answer, so a second failure of the
    // same kind schedules the second retry.
  }, [binding, enabled, failure, scope, version]);
  const retry = useCallback(() => {
    if (!enabled || !Number.isInteger(version) || version! <= 0 || !controller.current) return;
    setBinding(null);
    void controller.current.refresh(version!, true);
  }, [enabled, version]);
  const needs = useMemo(() => editor && !editor.isDestroyed && enabled && typeof version === "number" && version > 0
    ? unresolvedDocumentDisplayFontNeeds(editor.state, plan) : [], [editor, enabled, plan, version]);
  return {needs, ready: plan !== null, failure, retry: failure ? retry : undefined};

}
