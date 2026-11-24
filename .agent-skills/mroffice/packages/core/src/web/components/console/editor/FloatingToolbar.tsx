"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { isBoldSelection } from "./native-document/boldExtension";
import { normalizeDocumentUrl } from "./native-document/documentUrl";
import { selectionText } from "../../../lib/editor/selection-text";
import { BubbleMenu } from "@tiptap/react/menus";
import type { Editor } from "@tiptap/react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Link,
  Sparkles,
} from "../../office-ribbon/icons/houseIcons";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  isCompatMouseFromTouch,
  isTouchLikePointer,
} from "../../../lib/pointer-capability";
import { useTranslations } from "../../../../host/next-intl";
import {
  OfficeFloatingMiniToolbarButton,
  OfficeFloatingMiniToolbarDivider,
} from "../../office-ribbon/OfficeFloatingMiniToolbar";
import AISelectionActions, {
  type ActionApplyPayload,
} from "../../../__cut__/md404c24060";
import type { PreparedBubbleMenu } from "./preparedBubbleMenu";
import { useWindowManagerActionsOptional } from "../../notebook/WindowManager";
import { requestChatPrefill } from "../../../__cut__/m809fa6700a";
import { selectionTableMarkdown } from "./native-document/selectionTableChart";
import { isSuggestingActive } from "./native-document/trackChangesExtension";
import { executeDocumentCommandWithResult } from "./native-document/documentCommands";
import type { NativeDocumentCommand } from "./native-document/documentCommands";
import {
  applyCopilotCommandWithReceipt,
  copilotResultKey,
} from "../../../__cut__/mffac877679";
import { isDocsCopilotStructuredV1Enabled } from "../../../__cut__/m099cb4356d";
import { useChangedState } from "../../../hooks/useChangedState";
import {
  documentCopilotSelectionTarget,
  type DocumentCopilotSelectionTarget,
} from "../../../__cut__/mfb27343d3b";

// ---------------------------------------------------------------------------
// Code block language options (Spec §5.1.3 / §20)
// ---------------------------------------------------------------------------

const CODE_LANGUAGES: Array<{ value: string; label: string }> = [
  { value: "plain", label: "Plain" },
  { value: "python", label: "Python" },
  { value: "typescript", label: "TypeScript" },
  { value: "javascript", label: "JavaScript" },
  { value: "bash", label: "Bash" },
  { value: "sql", label: "SQL" },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust" },
  { value: "markdown", label: "Markdown" },
  { value: "json", label: "JSON" },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FloatingToolbarProps {
  editor: Editor;
  pageId: string;
  windowId?: string | null;
  // In guest / public-preview mode, hide the AI action (it opens
  // AISelectionActions, which hits the authed AI API and 401-redirects on a
  // public page). Formatting buttons stay available.
  guestMode?: boolean;
  






  notebookId?: string | null;
  /** Kept for host compatibility; the global AI window has its own title. */
  documentTitle?: string;
  






  onVisibilityChange?: (visible: boolean) => void;
  structuredCopilotEnabled?: boolean;
  /**
   * The host's structure pick mode (the ribbon AI button's 圈选 mode). When
   * given, the sparkle hands it the selected range, so the mode opens with
   * the structures the selection covers already picked; the user adjusts the
   * pick there and asks from its prompt. Without it (a host that has no pick
   * mode) the sparkle keeps the inline selection AI panel.
   */
  onPickStructures?: (range: { from: number; to: number }) => void;
  /**
   * The menu the host's editor was built with (preparedBubbleMenu). The
   * toolbar then fills that menu instead of registering one of its own,
   * which reconfigured the whole editor when it mounted.
   */
  prepared?: PreparedBubbleMenu | null;
}

function floatingToolbarCanWrite(editor: Editor): boolean {
  return !editor.isDestroyed && editor.isEditable !== false;
}

/**
 * TipTap's React BubbleMenu registers its ProseMirror plugin from a React
 * effect. Registering reconfigures the editor state and can rebuild React
 * NodeViews, whose renderer calls `flushSync`; React 19 rejects that while an
 * effect is still being committed. Keep the public Editor contract intact for
 * BubbleMenu, but move registry mutations and its options-update dispatch to
 * the first post-commit microtask. The current state is returned synchronously
 * because BubbleMenu ignores these return values.
 */
/**
 * A transaction dispatched through the deferred view, as it applies when the
 * deferral runs. The editor may have moved meanwhile (the room's first
 * content, a collaborator's change): ProseMirror refuses a transaction built
 * on another document ("Applying a mismatched transaction", thrown uncaught
 * on a first open), and one built on an older selection puts that selection
 * back. One that only carries metas (a menu's option update, its hide) is
 * rebuilt on the current state; any other that no longer fits is dropped.
 */
function transactionForCurrentState(state: EditorState, tr: Transaction): Transaction | null {
  if (!Array.isArray(tr?.steps) || !("before" in tr)) return tr;
  const metas = (tr as unknown as { meta?: unknown }).meta;
  if (!tr.steps.length && !tr.selectionSet && !tr.storedMarksSet && metas && typeof metas === "object") {
    const rebuilt = state.tr;
    for (const [key, value] of Object.entries(metas)) rebuilt.setMeta(key, value);
    if (tr.scrolledIntoView) rebuilt.scrollIntoView();
    return rebuilt;
  }
  return tr.before === state.doc ? tr : null;
}

export function createLifecycleSafeBubbleMenuEditor(editor: Editor): Editor {
  let safeView: Editor["view"] | null = null;
  return new Proxy(editor, {
    get(target, property, receiver) {
      if (property === "registerPlugin") {
        return (...args: Parameters<Editor["registerPlugin"]>) => {
          queueMicrotask(() => {
            if (!target.isDestroyed) target.registerPlugin(...args);
          });
          return target.state;
        };
      }
      if (property === "unregisterPlugin") {
        return (...args: Parameters<Editor["unregisterPlugin"]>) => {
          queueMicrotask(() => {
            if (!target.isDestroyed) target.unregisterPlugin(...args);
          });
          return target.state;
        };
      }
      if (property === "view") {
        const view = target.view;
        safeView ??= new Proxy(view, {
          get(viewTarget, viewProperty, viewReceiver) {
            if (viewProperty === "dispatch") {
              return (tr: Parameters<typeof view.dispatch>[0]) => {
                queueMicrotask(() => {
                  if (target.isDestroyed) return;
                  const current = transactionForCurrentState(viewTarget.state, tr);
                  if (current) viewTarget.dispatch(current);
                });
              };
            }
            return Reflect.get(viewTarget, viewProperty, viewReceiver);
          },
        });
        return safeView;
      }
      return Reflect.get(target, property, receiver);
    },
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function FloatingToolbar({
  editor,
  pageId,
  windowId,
  guestMode = false,
  notebookId,
  onVisibilityChange,
  structuredCopilotEnabled = isDocsCopilotStructuredV1Enabled(),
  onPickStructures,
  prepared = null,
}: FloatingToolbarProps) {
  const t = useTranslations("console-notebooks");
  const menuRef = useRef<HTMLDivElement>(null);
  // A pointer drag selection in the editor is under way (button still down).
  const pointerSelectingRef = useRef(false);
  const [ownPluginKey] = useState(
    () => new PluginKey("docs-floating-toolbar"),
  );
  const menuPluginKey = prepared?.pluginKey ?? ownPluginKey;
  const bubbleMenuEditor = useMemo(
    () => createLifecycleSafeBubbleMenuEditor(editor),
    [editor],
  );
  // Read on every editor transaction: only a real change may reach React.
  const [editable, setEditable] = useChangedState(() =>
    floatingToolbarCanWrite(editor),
  );
  const copilotWritable = editable && floatingToolbarCanWrite(editor);

  // Stable-identity BubbleMenu options. MUST NOT be an inline literal at the
  // call site: @tiptap/react's BubbleMenu has an "updateOptions" effect keyed
  // on `options`/`shouldShow` that dispatches a ProseMirror transaction
  // whenever those identities change. A fresh object/function every render
  // makes that effect re-fire on every transaction → forceUpdate → render →
  // new identities → … which, under the react-rnd `transform` ancestor (whose
  // layout never lets the menu's getBoundingClientRect converge), trips
  // React's "Maximum update depth exceeded" whenever two note windows are
  // open. A one-time useState initializer keeps the object identity fixed for
  // the component's lifetime (the onShow/onHide closures read the live
  // callback through a ref). See NoteEditor.tsx (mounts this only in
  // !guestMode).
  const onVisibilityChangeRef = useRef(onVisibilityChange);
  onVisibilityChangeRef.current = onVisibilityChange;
  const [bubbleMenuOptions] = useState(() => ({
    placement: "top" as const,
    onShow: () => onVisibilityChangeRef.current?.(true),
    onHide: () => onVisibilityChangeRef.current?.(false),
  }));
  // A finger's selection: the platform puts its own Copy/Paste callout ABOVE
  // the selection (iPad, Android), so the mini toolbar goes below it there,
  // as Office on an iPad does. A second fixed options object, so the menu's
  // options change identity only when the input switches between a finger
  // and a mouse, never per render (see above).
  const [touchBubbleMenuOptions] = useState(() => ({
    placement: "bottom" as const,
    onShow: () => onVisibilityChangeRef.current?.(true),
    onHide: () => onVisibilityChangeRef.current?.(false),
  }));
  const [touchSelecting, setTouchSelecting] = useState(false);
  // The plugin's destroy path does not fire onHide; without this, unmounting
  // mid-selection would leave the band strips suppressed forever.
  useEffect(
    () => () => {
      onVisibilityChangeRef.current?.(false);
    },
    [],
  );
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkInvalid, setLinkInvalid] = useState(false);
  const [showAIActions, setShowAIActions] = useState(false);
  useEffect(() => {
    const element = menuRef.current;
    if (!showAIActions || !element || typeof ResizeObserver === "undefined")
      return;
    let frame: number | null = null;
    let width = -1;
    let height = -1;
    const observer = new ResizeObserver(() => {
      // A structured Copilot result owns a fixed top-layer surface. Moving
      // its one-pixel selection anchor cannot reposition that surface and
      // must not create extra pagination/BubbleMenu transactions.
      if (element.querySelector("[data-copilot-draft-layer-anchor]")) {
        if (frame !== null) cancelAnimationFrame(frame);
        frame = null;
        return;
      }
      const rect = element.getBoundingClientRect();
      const nextWidth = Math.round(rect.width);
      const nextHeight = Math.round(rect.height);
      if (nextWidth === width && nextHeight === height) return;
      width = nextWidth;
      height = nextHeight;
      if (frame !== null) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = null;
        if (editor.isDestroyed || !element.isConnected) return;
        const view = bubbleMenuEditor.view;
        if (!view.dom.isConnected) return;
        // Documented BubbleMenu repositioning metadata; no document change,
        // history item, model call or source mutation is introduced.
        view.dispatch(
          view.state.tr
            .setMeta(menuPluginKey, "updatePosition")
            .setMeta("addToHistory", false),
        );
      });
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [bubbleMenuEditor, editor, menuPluginKey, showAIActions]);
  const [selectionRange, setSelectionRange] = useState<{
    from: number;
    to: number;
  } | null>(null);
  const [selectedText, setSelectedText] = useState("");
  const selectionSourceDocRef = useRef<ProseMirrorNode | null>(null);
  const applyInFlightRef = useRef(false);
  // The result whose save came back unconfirmed: it may already be in the
  // document, so that same result is never sent again. A new result applies
  // normally.
  const applyUnconfirmedResultRef = useRef<string | null>(null);
  const applyFailureRef = useRef<string | null>(null);
  const [selectionJson, setSelectionJson] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [selectionObjectType, setSelectionObjectType] = useState<string | null>(
    null,
  );
  const [selectionTarget, setSelectionTarget] =
    useState<DocumentCopilotSelectionTarget | null>(null);
  // Serialized pipe table captured from the selection when the AI actions
  // panel opened; null → no table in the selection → no 「生成图表」 action.
  const [selectionTable, setSelectionTable] = useState<string | null>(null);
  // Null on guest/mock hosts without a WindowManagerProvider.
  const windowManager = useWindowManagerActionsOptional();
  // U-24 — delayed onBlur so clicking nearby elements (e.g. the same
  // container) doesn't collapse the link input prematurely.
  const linkWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const refreshEditable = () => {
      setEditable(floatingToolbarCanWrite(editor));
    };
    refreshEditable();
    // The Docs host flips editability with setEditable(value, false), which
    // emits no "update": a page that finished connecting kept every button
    // disabled until its first edit. The selection that shows the toolbar is
    // a transaction, so it brings the current authority with it.
    editor.on("update", refreshEditable);
    editor.on("transaction", refreshEditable);
    editor.on("destroy", refreshEditable);
    return () => {
      editor.off("update", refreshEditable);
      editor.off("transaction", refreshEditable);
      editor.off("destroy", refreshEditable);
    };
  }, [editor]);

  useEffect(() => {
    if (!editable) setShowLinkInput(false);
  }, [editable]);

  const toggleLink = useCallback(() => {
    if (!floatingToolbarCanWrite(editor)) return;
    if (editor.isActive("link")) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    setShowLinkInput(true);
    setLinkUrl("");
    setLinkInvalid(false);
  }, [editor]);

  const submitLink = useCallback(() => {
    if (!floatingToolbarCanWrite(editor)) return;
    if (linkUrl.trim()) {
      // The address Insert > Link accepts, so the page can still be saved
      // (a link to `https://` alone made the document unsavable, WUA 024):
      // an address the save would refuse keeps the field open to correct.
      const href = normalizeDocumentUrl(linkUrl, "link");
      if (!href || !editor.chain().focus().setLink({ href }).run()) {
        setLinkInvalid(true);
        return;
      }
    }
    setShowLinkInput(false);
    setLinkUrl("");
    setLinkInvalid(false);
  }, [editor, linkUrl]);

  const captureCurrentSelection = useCallback((): boolean => {
    const { from, to, empty } = editor.state.selection;
    if (empty) return false;
    setShowLinkInput(false);
    setSelectionRange({ from, to });
    setSelectedText(selectionText(editor.state.doc, from, to));
    selectionSourceDocRef.current = editor.state.doc;
    const documentApi = editor.state.doc as ProseMirrorNode & {
      slice?: (start: number, end: number) => { toJSON?: () => unknown };
      resolve?: (position: number) => { parent?: { type?: { name?: string } } };
    };
    const slice =
      typeof documentApi.slice === "function"
        ? documentApi.slice(from, to).toJSON?.()
        : null;
    setSelectionJson(
      slice && typeof slice === "object" && !Array.isArray(slice)
        ? (slice as Record<string, unknown>)
        : null,
    );
    const copilotTarget = documentCopilotSelectionTarget(editor);
    setSelectionTarget(copilotTarget);
    const resolved =
      typeof documentApi.resolve === "function"
        ? documentApi.resolve(from)
        : null;
    setSelectionObjectType(
      copilotTarget?.blockType || resolved?.parent?.type?.name || null,
    );
    // 选中表格 → 生成图表: capture the selected table's data (if any) at open
    
    setSelectionTable(selectionTableMarkdown(editor.state.doc, from, to));
    return true;
  }, [editor]);

  const openAIActions = useCallback(() => {
    if (!captureCurrentSelection()) return;
    setShowAIActions(true);
  }, [captureCurrentSelection]);

  const pickSelectionStructures = useCallback(() => {
    const { from, to, empty } = editor.state.selection;
    if (empty || !floatingToolbarCanWrite(editor)) return;
    onPickStructures?.({ from, to });
  }, [editor, onPickStructures]);

  const dismissAIActions = useCallback(
    (restoreSelection: boolean) => {
      const range = selectionRange;
      const sourceDoc = selectionSourceDocRef.current;
      const canRestore =
        restoreSelection &&
        range !== null &&
        sourceDoc === editor.state.doc &&
        floatingToolbarCanWrite(editor);
      setShowAIActions(false);
      setSelectionRange(null);
      setSelectedText("");
      setSelectionTable(null);
      setSelectionJson(null);
      setSelectionObjectType(null);
      setSelectionTarget(null);
      selectionSourceDocRef.current = null;
      if (canRestore) {
        queueMicrotask(() => {
          if (
            !floatingToolbarCanWrite(editor) ||
            editor.state.doc !== sourceDoc
          )
            return;
          editor.chain().focus().setTextSelection(range).run();
        });
      }
    },
    [editor, selectionRange],
  );

  const handleCloseAI = useCallback(() => {
    dismissAIActions(true);
  }, [dismissAIActions]);

  
  // structured request (table data + "propose a chart block via the
  // confirm flow") in its composer. The user reviews and sends — the AI's
  // answer rides the standard proposal-confirm pipeline; nothing here writes
  // to the document.
  const canGenerateChartFromTable = Boolean(
    windowManager && notebookId && selectionTable,
  );
  const handleGenerateChartFromTable = useCallback(() => {
    if (!windowManager || !notebookId || !selectionTable) return;
    windowManager.openWindow({
      type: "ai_panel",
      title: "AI",
      meta: { notebookId },
    });
    requestChatPrefill({
      notebookId,
      text: t("selection.generateChartPrompt", { table: selectionTable }),
    });
  }, [notebookId, selectionTable, t, windowManager]);

  const handleHandoffToCopilot = useCallback(
    ({ prompt }: { prompt: string; capabilityId: string | null }) => {
      if (!windowManager || !notebookId) return;
      windowManager.openWindow({
        type: "ai_panel",
        title: "AI",
        meta: { notebookId },
      });
      requestChatPrefill({ notebookId, text: prompt });
    },
    [notebookId, windowManager],
  );

  const handleApplyAI = useCallback(
    async (payload: ActionApplyPayload) => {
      if (applyInFlightRef.current) return false;
      applyFailureRef.current = null;
      if (!floatingToolbarCanWrite(editor)) {
        applyFailureRef.current = t("ai.copilot.applyReadOnly");
        return false;
      }
      if (!selectionRange) {
        applyFailureRef.current = t("ai.copilot.applySelectionGone");
        return false;
      }
      if (
        payload.mode === "document_command" &&
        applyUnconfirmedResultRef.current === copilotResultKey(payload.command)
      ) {
        applyFailureRef.current = t("ai.copilot.applyOutcomeUnknown");
        return false;
      }
      if (selectionSourceDocRef.current !== editor.state.doc) {
        // Never rebind an old generated result to a newly captured selection.
        applyFailureRef.current = t("ai.copilot.staleResult");
        return false;
      }

      if (payload.mode === "document_command") {
        const command: NativeDocumentCommand = {
          ...payload.command,
          command_context: {
            ...(payload.command.command_context || {}),
            selection_from: selectionRange.from,
            selection_to: selectionRange.to,
          },
        };
        // Selection-AI structured commands apply LOCALLY through suggesting
        // mode so they land as reviewable revision marks — the event path
        // (page-AI proposal cards) hard-applies, which made the sparkle
        // entry behave differently from the selection bubble (user catch
        
        let applied = false;
        const before = JSON.stringify(editor.getJSON());
        try {
          const wasSuggesting = isSuggestingActive(editor.state as never);
          if (!wasSuggesting) editor.commands.setSuggesting(true);
          try {
            applied = executeDocumentCommandWithResult(editor, command).ok;
          } finally {
            if (!wasSuggesting) editor.commands.setSuggesting(false);
          }
        } catch {
          applied = false;
        }
        if (!applied) {
          // A failed local rollback is not permission to write again. Only
          // forward an unchanged document, and wait for this exact attempt.
          if (JSON.stringify(editor.getJSON()) !== before) {
            applyFailureRef.current = t("ai.copilot.applyPartial");
            return false;
          }
          if (structuredCopilotEnabled && payload.baseContentVersion == null) {
            applyFailureRef.current = t("ai.copilot.applyNeedsRegenerate");
            return false;
          }
          applyInFlightRef.current = true;
          try {
            const result = await applyCopilotCommandWithReceipt({
              pageId,
              windowId: windowId || undefined,
              ...(payload.baseContentVersion != null
                ? { version: payload.baseContentVersion }
                : { legacySelection: true as const }),
              command,
            });
            if (!result.ok) {
              applyFailureRef.current =
                result.message ||
                t(
                  result.reason === "unconfirmed"
                    ? "ai.copilot.applyOutcomeUnknown"
                    : "editor.documentCommandApplyFailed",
                );
              // A missing receipt is ambiguous: never resend this write, even
              // if the user clicks again; a regenerated result may apply.
              if (result.reason === "unconfirmed")
                applyUnconfirmedResultRef.current = copilotResultKey(
                  payload.command,
                );
              return false;
            }
          } finally {
            applyInFlightRef.current = false;
          }
        }
      } else if (payload.mode === "font_size_step") {
        // Relative font ask ("放大字体"): drive the toolbar's own stepper on
        // the anchored selection — identical to pressing A+/A-.
        const chain = editor.chain().focus().setTextSelection(selectionRange);
        const applied =
          payload.step === 1
            ? chain.growFontSize().run()
            : chain.shrinkFontSize().run();
        if (!applied) return false;
      } else if (payload.mode === "insert_task") {
        // Insert a TaskBlock node right after the selection. Uses the custom
        // `task` extension registered in NoteEditor. We generate a fresh
        // client-side block_id; the backend will replace it on next save if
        // needed (see TaskBlock attrs).
        const blockId =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `task-${Date.now()}`;
        const applied = editor
          .chain()
          .focus()
          .insertContentAt(selectionRange.to, {
            type: "task",
            attrs: {
              block_id: blockId,
              title: payload.title,
              description: null,
              due_date: null,
              completed: false,
              completed_at: null,
            },
          })
          .run();
        if (!applied) return false;
      } else if (
        payload.mode === "replace" ||
        payload.mode === "insert_below"
      ) {
        // AI text lands as tracked insertion/deletion marks the user accepts
        // or rejects, the review contract the retired selection bubble had -
        // this path used to hard-replace, so the two selection AI entries
        
        // original vanished without a strikethrough.
        const wasSuggesting = isSuggestingActive(editor.state as never);
        if (!wasSuggesting) editor.commands.setSuggesting(true);
        try {
          if (payload.mode === "replace") {
            const applied = editor
              .chain()
              .focus()
              .insertContentAt(selectionRange, payload.text)
              .run();
            if (!applied) return false;
          } else {
            const applied = editor
              .chain()
              .focus()
              .insertContentAt(selectionRange.to, `\n\n${payload.text}`)
              .run();
            if (!applied) return false;
          }
        } finally {
          if (!wasSuggesting) editor.commands.setSuggesting(false);
        }
      } else {
        const applied = editor
          .chain()
          .focus()
          .insertContentAt(selectionRange.to, `\n\n${payload.text}`)
          .run();
        if (!applied) return false;
      }

      dismissAIActions(false);
      return true;
    },
    [
      editor,
      dismissAIActions,
      pageId,
      selectionRange,
      structuredCopilotEnabled,
      t,
      windowId,
    ],
  );

  const handleLinkKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submitLink();
      }
      if (e.key === "Escape") {
        setShowLinkInput(false);
      }
    },
    [submitLink],
  );

  const codeBlockActive = editor.isActive("codeBlock");
  const codeBlockLanguage =
    (editor.getAttributes("codeBlock")?.language as string | null) ?? "";
  const codeBlockFilename =
    (editor.getAttributes("codeBlock")?.filename as string | null) ?? "";

  const handleSetLanguage = useCallback(
    (language: string) => {
      if (!floatingToolbarCanWrite(editor)) return;
      editor
        .chain()
        .focus()
        .updateAttributes("codeBlock", { language: language || null })
        .run();
    },
    [editor],
  );

  const handleSetFilename = useCallback(
    (filename: string) => {
      if (!floatingToolbarCanWrite(editor)) return;
      const trimmed = filename.trim();
      editor
        .chain()
        .focus()
        .updateAttributes("codeBlock", { filename: trimmed ? trimmed : null })
        .run();
    },
    [editor],
  );

  // Stable identity across renders (reads live editor state from the arg; its
  // only reactive inputs are the two booleans) so BubbleMenu's updateOptions
  // effect does not re-fire — and re-dispatch a transaction — every render.
  const shouldShowBubbleMenu = useCallback(
    ({ editor: currentEditor }: { editor: Editor }) => {
      if (showLinkInput || showAIActions) return true;
      if (pointerSelectingRef.current) return false;
      const { selection } = currentEditor.state;
      // A selected picture, shape, chart or other object is not text: as in
      // Word, it gets its own contextual tab and no text mini toolbar, which
      // would sit on top of the object's rotate grip.
      if (selection instanceof NodeSelection && selection.node.isAtom) return false;
      return currentEditor.isActive("codeBlock") || !selection.empty;
    },
    [showLinkInput, showAIActions],
  );
  const shouldShowRef = useRef(shouldShowBubbleMenu);
  shouldShowRef.current = shouldShowBubbleMenu;

  // Word shows the mini toolbar once a drag selection ENDS. Shown while the
  // button is still down it lands where the pointer is heading (above the
  // selection on an upward drag) and takes the hit-testing the drag needs,
  // so the selection stopped growing under it.
  useEffect(() => {
    if (editor.isDestroyed) return;
    const dom = (editor.view as Editor["view"] | undefined)?.dom;
    if (!dom) return;
    let timer: number | null = null;
    const onDown = (event: MouseEvent) => {
      if (event.type === "pointerdown") {
        const touch = isTouchLikePointer(event as PointerEvent);
        setTouchSelecting((current) => (current === touch ? current : touch));
      }
      if (event.button !== 0) return;
      // A finger selects by the platform's long press and handles, and it
      // never "drags out" a selection under the toolbar. Its tap also sends
      // a compatibility mousedown with no pointerType, after the pointerup
      // that would clear this flag: counting it left the toolbar hidden
      
      if ("pointerType" in event && isTouchLikePointer(event as PointerEvent)) return;
      if (isCompatMouseFromTouch(event)) return;
      pointerSelectingRef.current = true;
    };
    const onUp = () => {
      if (!pointerSelectingRef.current) return;
      pointerSelectingRef.current = false;
      if (timer !== null) window.clearTimeout(timer);
      // After ProseMirror has taken the release's own selection.
      timer = window.setTimeout(() => {
        timer = null;
        if (editor.isDestroyed) return;
        const view = bubbleMenuEditor.view;
        if (!view.dom.isConnected || !shouldShowRef.current({ editor })) return;
        view.dispatch(
          view.state.tr
            .setMeta(menuPluginKey, "show")
            .setMeta("addToHistory", false),
        );
      }, 0);
    };
    // mousedown too: WebKit sends no pointerdown for a press right after a
    // drag and drop.
    dom.addEventListener("pointerdown", onDown, true);
    dom.addEventListener("mousedown", onDown, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onUp, true);
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      pointerSelectingRef.current = false;
      dom.removeEventListener("pointerdown", onDown, true);
      dom.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onUp, true);
    };
  }, [bubbleMenuEditor, editor, menuPluginKey]);

  return (
    <FloatingToolbarMenu
      prepared={prepared}
      menuRef={menuRef}
      pluginKey={menuPluginKey}
      editor={bubbleMenuEditor}
      className="floating-toolbar"
      options={touchSelecting ? touchBubbleMenuOptions : bubbleMenuOptions}
      shouldShow={shouldShowBubbleMenu}
    >
      {codeBlockActive && !showAIActions && !showLinkInput ? (
        <div
          className="floating-toolbar-code"
          data-testid="floating-toolbar-code"
        >
          <label className="floating-toolbar-code__label">
            {t("editor.codeBlock")}
          </label>
          <select
            data-testid="floating-toolbar-code-language"
            className="floating-toolbar-code__field"
            value={codeBlockLanguage || ""}
            disabled={!editable}
            onChange={(e) => handleSetLanguage(e.target.value)}
            aria-label={t("toolbar.code_language")}
          >
            <option value="">{t("toolbar.code_language_auto")}</option>
            {CODE_LANGUAGES.map((lang) => (
              <option key={lang.value} value={lang.value}>
                {lang.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            data-testid="floating-toolbar-code-filename"
            className="floating-toolbar-code__field"
            value={codeBlockFilename}
            disabled={!editable}
            onChange={(e) => handleSetFilename(e.target.value)}
            placeholder={t("toolbar.code_filename_placeholder")}
            aria-label={t("toolbar.code_filename")}
          />
        </div>
      ) : showLinkInput ? (
        <div className="floating-toolbar-link-input" ref={linkWrapRef}>
          <input
            type="url"
            value={linkUrl}
            disabled={!editable}
            aria-invalid={linkInvalid || undefined}
            title={linkInvalid ? t("toolbar.linkDialogInvalidAddress") : undefined}
            onChange={(e) => {
              setLinkUrl(e.target.value);
              setLinkInvalid(false);
            }}
            onKeyDown={handleLinkKeyDown}
            onBlur={() => {
              // Delay so a click on a sibling element (e.g. a paste target
              // or a nearby toolbar button) doesn't immediately close the
              // input. If focus stayed inside the wrapper we abort.
              window.setTimeout(() => {
                if (!linkWrapRef.current?.contains(document.activeElement)) {
                  setShowLinkInput(false);
                }
              }, 120);
            }}
            placeholder={t("toolbar.pasteLink")}
            autoFocus
            className="floating-toolbar-input"
          />
        </div>
      ) : showAIActions && !guestMode ? (
        null
      ) : (
        <>
          {/* The Docs command set on the shared mini toolbar buttons
              (office-ribbon/OfficeFloatingMiniToolbar); TipTap's BubbleMenu
              places them over the ProseMirror selection. */}
          <OfficeFloatingMiniToolbarButton
            active={isBoldSelection(editor.state, editor.view)}
            disabled={!editable}
            onClick={() => {
              if (!floatingToolbarCanWrite(editor)) return;
              editor.chain().focus().toggleBold().run();
            }}
            label={t("toolbar.bold")}
          >
            <Bold size={16} />
          </OfficeFloatingMiniToolbarButton>
          <OfficeFloatingMiniToolbarButton
            active={editor.isActive("italic")}
            disabled={!editable}
            onClick={() => {
              if (!floatingToolbarCanWrite(editor)) return;
              editor.chain().focus().toggleItalic().run();
            }}
            label={t("toolbar.italic")}
          >
            <Italic size={16} />
          </OfficeFloatingMiniToolbarButton>
          <OfficeFloatingMiniToolbarButton
            active={editor.isActive("strike")}
            disabled={!editable}
            onClick={() => {
              if (!floatingToolbarCanWrite(editor)) return;
              editor.chain().focus().toggleStrike().run();
            }}
            label={t("toolbar.strikethrough")}
          >
            <Strikethrough size={16} />
          </OfficeFloatingMiniToolbarButton>
          <OfficeFloatingMiniToolbarButton
            active={editor.isActive("code")}
            disabled={!editable}
            onClick={() => {
              if (!floatingToolbarCanWrite(editor)) return;
              editor.chain().focus().toggleCode().run();
            }}
            label={t("toolbar.code")}
          >
            <Code size={16} />
          </OfficeFloatingMiniToolbarButton>

          <OfficeFloatingMiniToolbarDivider />

          <OfficeFloatingMiniToolbarButton
            active={editor.isActive("link")}
            disabled={!editable}
            onClick={toggleLink}
            label={t("toolbar.link")}
          >
            <Link size={16} />
          </OfficeFloatingMiniToolbarButton>

          <OfficeFloatingMiniToolbarDivider />

          {!guestMode ? (
            null
          ) : null}
        </>
      )}
    </FloatingToolbarMenu>
  );
}

type FloatingToolbarMenuOptions = NonNullable<PreparedBubbleMenu["options"]>;
type FloatingToolbarShouldShow = NonNullable<PreparedBubbleMenu["shouldShow"]>;

interface FloatingToolbarMenuProps {
  prepared: PreparedBubbleMenu | null;
  menuRef: RefObject<HTMLDivElement | null>;
  pluginKey: PluginKey;
  editor: Editor;
  className: string;
  options: FloatingToolbarMenuOptions;
  shouldShow: FloatingToolbarShouldShow;
  children: ReactNode;
}

/** The host's prepared menu when it has one, TipTap's BubbleMenu otherwise. */
function FloatingToolbarMenu({ prepared, menuRef, pluginKey, editor, className, options, shouldShow, children }: FloatingToolbarMenuProps) {
  if (prepared) {
    return (
      <PreparedFloatingToolbarMenu prepared={prepared} menuRef={menuRef} editor={editor}
        className={className} options={options} shouldShow={shouldShow}>
        {children}
      </PreparedFloatingToolbarMenu>
    );
  }
  return (
    <BubbleMenu ref={menuRef} pluginKey={pluginKey} editor={editor} className={className}
      options={options} shouldShow={shouldShow}>
      {children}
    </BubbleMenu>
  );
}

function PreparedFloatingToolbarMenu({ prepared, menuRef, editor, className, options, shouldShow, children }:
  Omit<FloatingToolbarMenuProps, "prepared" | "pluginKey"> & { prepared: PreparedBubbleMenu }) {
  const { element, pluginKey } = prepared;
  // As TipTap's BubbleMenu hands out its element (before the toolbar's own
  // effects, which run after this child's).
  useLayoutEffect(() => {
    menuRef.current = element;
    element.setAttribute("class", className);
  }, [className, element, menuRef]);
  // What the mounted toolbar says drives the menu; the menu's view reads it
  // on every update, and a view built later (any reconfiguration) reads it
  // from the holder. The placement is the view's own copy: told, as TipTap's
  // BubbleMenu tells it, whenever it changes after the first.
  const mountedRef = useRef(false);
  useLayoutEffect(() => {
    prepared.attach({ shouldShow, options });
    if (!mountedRef.current) { mountedRef.current = true; return; }
    if (editor.isDestroyed) return;
    // `editor` is the lifecycle-safe one: the dispatch runs after the commit.
    editor.view.dispatch(editor.state.tr
      .setMeta(pluginKey, { type: "updateOptions", options: { placement: options.placement } })
      .setMeta("addToHistory", false));
  }, [editor, options, pluginKey, prepared, shouldShow]);
  useLayoutEffect(() => () => {
    // Unmounted: nothing more to show until a toolbar mounts again. The
    // toolbar has said it is hidden (its own unmount effect).
    prepared.attach(null);
    if (!editor.isDestroyed) {
      editor.view.dispatch(editor.state.tr.setMeta(pluginKey, "hide").setMeta("addToHistory", false));
    }
  }, [editor, pluginKey, prepared]);
  return createPortal(children, element);
}
