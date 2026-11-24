"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import PdfNativeListTextEditDialog, {
  type PdfNativeListTextEditDialogProps,
  type QueuedNativeTextRibbonAction,
} from "./PdfNativeListTextEditDialog";
import { markPdfTextLatency } from "../../../../lib/pdf/text-edit-latency";

type Opening = Pick<
  PdfNativeListTextEditDialogProps,
  "originalText" | "initialLayout" | "initialCaretOffset" | "initialDraftText"
> & {
  sessionKey: string;
  /** The session key of the opening this one takes over: an opening refused
   * a moment ago (a paragraph refused whole) of which this one is a part (the
   * run under the press). The presses held for that opening are held for
   * this one, and answered by its proof. */
  continues?: string;
};

/** How long an editor named as taken over holds its presses for the editor
 * that takes it over to open; left standing that long, it answers them. */
const TAKEOVER_PATIENCE_MS = 5_000;

export interface PdfNativeTextEditSessionHandle {
  begin: (opening: Opening) => void;
  /** The proof for this opening failed for good: the session stops waiting
   * (no longer busy), shows `message`, and keeps the draft editable. */
  fail: (message: string) => void;
  retire: () => void;
  isActive: () => boolean;
}

const rejectUnpreparedWrite = async () => false;

/** Keep the first caret paint local, as other editors do for their input
 * surfaces. The provisional session has no lease/proof and cannot write. The
 * parent adopts the SAME dialog after its first paint; it must not replace
 * text, selection, IME or geometry with the original snapshot on adoption. */
const PdfNativeTextEditSessionHost = forwardRef<
  PdfNativeTextEditSessionHandle,
  PdfNativeListTextEditDialogProps & { scopeKey: string; sessionKey: string }
>(function PdfNativeTextEditSessionHost(
  { scopeKey, sessionKey, ...props },
  ref,
) {
  const [opening, setOpening] = useState<
    (Opening & { scopeKey: string; failure?: string }) | null
  >(null);
  const openingRef = useRef<(Opening & { scopeKey: string; failure?: string }) | null>(null);
  const liveScopeRef = useRef({ scopeKey, open: props.open });
  useLayoutEffect(() => { liveScopeRef.current = { scopeKey, open: props.open }; }, [scopeKey, props.open]);
  // The presses held for a refused opening that the opening begun over it
  // takes (Opening.continues): named by `takeover` as that opening begins,
  // left here by the refused editor as it closes, taken by the new one as it
  // opens. The refused editor is whichever is shown: the provisional one, or
  // -- a moment after its first paint, and so for all but the first frames
  // of a proof that takes seconds -- the window's own editor that adopted it
  // (`open`, under the window's `sessionKey`). The takeover was read off the
  // provisional opening alone, which the adoption had long cleared: the
  // presses of every refused paragraph were answered by the refusal after
  
  const [takeover, setTakeover] = useState<{ from: string; to: string } | null>(null);
  const takeoverRef = useRef<{ from: string; to: string } | null>(null);
  const heldPressesRef = useRef<{ to: string; actions: readonly QueuedNativeTextRibbonAction[] } | null>(null);
  const editorKeyRef = useRef<string | null>(null);
  const nameTakeover = (next: { from: string; to: string } | null) => { takeoverRef.current = next; setTakeover(next); };
  useEffect(() => {
    if (!takeover) return;
    const timer = window.setTimeout(() => { if (takeoverRef.current === takeover) nameTakeover(null); }, TAKEOVER_PATIENCE_MS);
    return () => window.clearTimeout(timer);
  }, [takeover]);
  useImperativeHandle(
    ref,
    () => ({
      begin: (next) => {
        const shown = editorKeyRef.current;
        nameTakeover(next.continues !== undefined && shown === next.continues && shown !== next.sessionKey
          ? { from: shown, to: next.sessionKey } : null);
        heldPressesRef.current = null;
        const value = { ...next, scopeKey }; openingRef.current = value; setOpening(value);
      },
      fail: (message) => {
        const current = openingRef.current;
        if (!current) return;
        const value = { ...current, failure: message };
        openingRef.current = value;
        setOpening(value);
      },
      retire: () => { openingRef.current = null; setOpening(null); },
      isActive: () => liveScopeRef.current.open || openingRef.current?.scopeKey === liveScopeRef.current.scopeKey,
    }),
    [scopeKey],
  );
  useLayoutEffect(() => {
    if (props.open || opening?.scopeKey !== scopeKey) { openingRef.current = null; setOpening(null); }
  }, [props.open, opening?.scopeKey, scopeKey]);

  const provisional =
    !props.open && opening?.scopeKey === scopeKey ? opening : null;
  /** The key of the editor shown: the provisional opening's, or the window's own. */
  const editorKey = provisional?.sessionKey ?? sessionKey;
  useLayoutEffect(() => { editorKeyRef.current = props.open || provisional ? editorKey : null; });
  // (Development: an editor given another key while open is a new editor --
  // its caret and keys start again -- and says which key moved.)
  const shownKeyRef = useRef<string | null>(null);
  const shownKey = props.open || provisional ? `${provisional ? "p" : "o"}|${provisional?.sessionKey ?? sessionKey}` : null;
  if (process.env.NODE_ENV !== "production" && shownKey !== shownKeyRef.current) {
    if (shownKeyRef.current && shownKey) markPdfTextLatency("editor.rekeyed", {
      from: shownKeyRef.current.replace(/[0-9a-f]{40,}/g, (sha) => sha.slice(0, 8)),
      to: shownKey.replace(/[0-9a-f]{40,}/g, (sha) => sha.slice(0, 8)), scopeMoved: opening !== null && opening.scopeKey !== scopeKey });
    shownKeyRef.current = shownKey;
  }
  return (
    <PdfNativeListTextEditDialog
      {...props}
      {...(provisional
        ? {
            originalText: provisional.originalText,
            initialLayout: provisional.initialLayout,
            initialCaretOffset: provisional.initialCaretOffset,
            initialDraftText: provisional.initialDraftText ?? null,
            open: true,
            preparationPending: provisional.failure === undefined,
            preparationFailed: provisional.failure !== undefined,
            propertyProof: null,
            sourceGeometry: undefined,
            sourceAppearance: undefined,
            paragraphColors: undefined,
            initialEditingSurface: null,
            initialEditingSurfacePrepared: false,
            error: provisional.failure ?? null,
            applyDisabledReason: provisional.failure ?? props.labels.previewing,
            // Publishing the initial draft to PageWindow would synchronously render
            // the whole reader before this caret paints. Adoption publishes it once.
            onDraftStateChange: undefined,
            onApply: rejectUnpreparedWrite,
          }
        : {})}
      heldRibbonActionsTakenOver={takeover !== null && takeover.from === editorKey}
      onHeldRibbonActionsLeft={(actions: readonly QueuedNativeTextRibbonAction[]) => {
        const named = takeoverRef.current;
        if (!named || named.from !== editorKey) return false;
        heldPressesRef.current = { to: named.to, actions };
        return true;
      }}
      takeHeldRibbonActions={() => {
        const held = heldPressesRef.current;
        if (!held || held.to !== editorKey) return null;
        heldPressesRef.current = null;
        nameTakeover(null);
        return held.actions;
      }}
      key={provisional?.sessionKey ?? sessionKey}
    />
  );
});

export default PdfNativeTextEditSessionHost;
