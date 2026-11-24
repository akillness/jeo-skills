/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A stored document into the editor: normalized and checked, legacy OMML
 * styles upgraded, wrapped in its page blocks (with the cached layout), set
 * through the authorized replacement, its doc-attr stores restored and the
 * hydration's undo entry dropped. Shared by the editor (NoteEditor) and the
 * print surface; moved unchanged out of NoteEditor.tsx.
 */

import { type JSONContent } from "@tiptap/core";
import { type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { EditorState, type Plugin, type Transaction } from "@tiptap/pm/state";
import { normalizeHydratedDocumentPageAttrs } from "@mrnote/core/web/components/console/editor/extensions/DocumentPageSetup.ts";
import { ensureNativeDocumentBlockIds } from "@mrnote/core/web/components/console/editor/native-document/blockIds.ts";
import { serializeWhiteboardScenes } from "@mrnote/core/web/components/console/editor/extensions/whiteboardScene.ts";
import { withLegacyChartsOnV2, withoutInactiveChartUnionAttrs } from "@mrnote/core/web/components/console/editor/native-document/chartUnionAttrs.ts";
import { hydrateStoredPageBlocks as hydratePagedDocumentBlocks } from "@mrnote/core/web/components/console/editor/native-document/paged/pageBlockExtension.ts";
import { INITIAL_PAGINATION_SETTLING_ATTR } from "@mrnote/core/web/components/console/editor/native-document/paged/pageRebalanceExtension.ts";
import { PAGE_LEDGER_BACKGROUND_ATTR } from "@mrnote/core/web/components/console/editor/native-document/documentLayoutStatus.ts";
import { coldFirstLayoutOn } from "@mrnote/core/web/components/console/editor/native-document/paged/coldFirstLayout.ts";
import { authorizeDocumentShellImportMutation, trustReadOnlyDocumentMutation, type DocumentShellImportAuthorityToken } from "@mrnote/core/web/components/console/editor/native-document/readOnlyTransactionAuthority.ts";
import { flattenPagedDocumentForStorage } from "@mrnote/core/web/components/console/editor/native-document/paged/serialization.ts";
import { captureSavedPaginationProjection } from "@mrnote/core/web/__cut__/m2c7d818b46.ts";
import { cachedDocsLayoutReceipt, cachedDocsLayoutSizes, traceDocsLayoutReceipt } from "@mrnote/core/web/lib/docs-layout-receipt-cache.ts";
import { withProjectionJsonMemo } from "@mrnote/core/web/components/console/editor/native-document/paged/paginationProjectionReceipt.ts";
import { hydrationWasRestored, markRestoredLayout, markRestoredSnapshot } from "@mrnote/core/web/components/console/editor/native-document/paged/restoredLayoutMark.ts";
import { layoutSnapshotsEnabled, printLayoutReceiptFor, snapshotReceiptFor } from "@mrnote/core/web/components/console/editor/native-document/paged/layoutSnapshot.ts";
import { traceLayoutSnapshot } from "@mrnote/core/web/lib/docs-layout-snapshot-store.ts";
import { editorDom, executeEditorCommand, getEditorCommands, isUsableEditor, type MaybeNoteEditor } from "./editorRuntime";

export function hydrateStoredPageBlocks<T>(document: T, fallbackReceipt?: unknown, fallbackSizes?: number[] | null): T {
  traceDocsLayoutReceipt(`hydrate receipt=${Boolean(fallbackReceipt)} sizes=${fallbackSizes?.length ?? "none"}`);
  return hydratePagedDocumentBlocks(document, fallbackReceipt, fallbackSizes);
}

export function emptyDocumentContent(): Record<string, unknown> {
  return { type: "doc", content: [] };
}

export type TipTapDocumentContentIssue =
  | "not_object"
  | "invalid_root_type"
  | "invalid_content"
  // The body is readable but the document's own settings are not: a payload
  // written by a newer version of the product than this bundle.
  | "unsupported_document_attrs";

export type TipTapDocumentContentResult =
  | {
      ok: true;
      document: Record<string, unknown>;
      legacyBlank: boolean;
    }
  | { ok: false; issue: TipTapDocumentContentIssue };

export function resolveTipTapDocumentContent(
  contentJson: unknown,
): TipTapDocumentContentResult {
  if (contentJson === null || contentJson === undefined) {
    return {
      ok: true,
      document: emptyDocumentContent(),
      legacyBlank: true,
    };
  }
  if (typeof contentJson !== "object" || Array.isArray(contentJson)) {
    return { ok: false, issue: "not_object" };
  }

  const document = contentJson as Record<string, unknown>;
  if (Object.keys(document).length === 0) {
    return {
      ok: true,
      document: emptyDocumentContent(),
      legacyBlank: true,
    };
  }
  if (document.type !== "doc") {
    return { ok: false, issue: "invalid_root_type" };
  }
  if (!Array.isArray(document.content)) {
    return { ok: false, issue: "invalid_content" };
  }
  return { ok: true, document, legacyBlank: false };
}

/**
 * One-time compatibility hydration for DOCX projections created before OMML
 * carried an explicit math style. A DOCX source paragraph/table/block already
 * has `attrs.source.adapter="docx"`; only its pre-existing inlineMath/mathBlock
 * nodes that lack `mathStyle` are upgraded. The whole JSON tree is transformed
 * before setContent, avoiding ~10k individual ProseMirror transactions.
 */
export function hydrateLegacyDocxOfficeMathStyles(
  document: Record<string, unknown>,
): Record<string, unknown> {
  let sawDocxSource = false;
  const visit = (
    node: Record<string, unknown>,
    insideDocxSource: boolean,
  ): Record<string, unknown> => {
    const attrs =
      node.attrs && typeof node.attrs === "object" && !Array.isArray(node.attrs)
        ? (node.attrs as Record<string, unknown>)
        : null;
    const source =
      attrs?.source &&
      typeof attrs.source === "object" &&
      !Array.isArray(attrs.source)
        ? (attrs.source as Record<string, unknown>)
        : null;
    const docxContext = insideDocxSource || source?.adapter === "docx";
    if (source?.adapter === "docx") sawDocxSource = true;
    let next = node;

    if (
      (node.type === "inlineMath" || node.type === "mathBlock") &&
      docxContext &&
      attrs?.mathStyle === undefined
    ) {
      next = { ...next, attrs: { ...(attrs ?? {}), mathStyle: "office" } };
    }

    if (Array.isArray(node.content)) {
      let changed = false;
      const content = node.content.map((child) => {
        if (!child || typeof child !== "object" || Array.isArray(child)) {
          return child;
        }
        const hydrated = visit(child as Record<string, unknown>, docxContext);
        if (hydrated !== child) changed = true;
        return hydrated;
      });
      if (changed) next = { ...next, content };
    }
    return next;
  };

  const hydrated = visit(document, false);
  if (!sawDocxSource || hydrated.type !== "doc") return hydrated;
  const attrs =
    hydrated.attrs &&
    typeof hydrated.attrs === "object" &&
    !Array.isArray(hydrated.attrs)
      ? (hydrated.attrs as Record<string, unknown>)
      : {};
  const nextAttrs = { ...attrs };
  let changed = false;
  // Legacy DOCX projections predate document-level paragraph metrics. OOXML's
  // absent values mean single spacing and zero paragraph gaps; add only missing
  // keys so an explicitly imported Normal/docDefaults style always wins.
  //
  // A current projection always carries the paragraph gaps, and leaves the line
  // height out on purpose: the file's default is an exact or at-least height
  // (our own generator writes at-least 21pt) that a unitless multiplier cannot
  // state, and every imported paragraph carries that rule itself. Filling in
  // "1" there declared single spacing the file contradicts — the first save
  // wrote it, and the saved page no longer read back as its own package.
  const legacyProjection =
    attrs.defaultParagraphSpaceBefore === undefined &&
    attrs.defaultParagraphSpaceAfter === undefined &&
    attrs.defaultLineHeight === undefined;
  for (const [key, value] of [
    ["defaultLineHeight", "1"],
    ["defaultParagraphSpaceBefore", 0],
    ["defaultParagraphSpaceAfter", 0],
    ["defaultTextColor", "#000000"],
  ] as const) {
    if (legacyProjection && nextAttrs[key] === undefined) {
      nextAttrs[key] = value;
      changed = true;
    }
  }
  // Older DOCX projections persisted OOXML single spacing as the browser
  // keyword `normal`, and East Asian documents then carried a fabricated 1.3
  // paragraph multiplier guessed from the default family name. Neither is
  // Word's rule: single spacing is the multiplier 1, and an East Asian FACE
  // gets its extra pitch from its own font box (documentAutoLineSpacing), not
  // from the paragraph. Recover the OOXML value so both spellings paginate the
  // way a freshly imported copy of the same document does.
  if (nextAttrs.defaultLineHeight === "normal") {
    nextAttrs.defaultLineHeight = "1";
    changed = true;
  }
  return changed ? { ...hydrated, attrs: nextAttrs } : hydrated;
}

















export function savedDocumentAttrsAreRestorable(document: Record<string, unknown>): boolean {
  try {
    normalizeHydratedDocumentPageAttrs(document.attrs ?? {});
    return true;
  } catch {
    return false;
  }
}

export function executeAuthorizedContentReplacement(
  editor: MaybeNoteEditor,
  content: Record<string, unknown>,
  authority:
    | "hydration-content"
    | "content-restoration"
    | DocumentShellImportAuthorityToken,
  /** A hydration's stored document: its doc-attr stores (documentAttrStoreRestores)
   * are restored in the same transaction as the content. The caller then
   * runs restoreDocumentStoresAfterContent instead of restoreDocumentStores. */
  storesFrom?: Record<string, unknown> | null,
): boolean {
  if (!isUsableEditor(editor)) return false;
  const runtime = editor as unknown as {
    chain?: unknown;
    commandManager?: unknown;
  };
  // Lightweight unit harnesses expose only commands. They have no transaction
  // filter and therefore no bypass surface; retain their existing contract.
  if (runtime.commandManager == null || typeof runtime.chain !== "function") {
    const commands = getEditorCommands<{
      setContent?: (
        value: Record<string, unknown>,
        options?: { emitUpdate?: boolean },
      ) => boolean;
    }>(editor);
    const applied = executeEditorCommand(commands?.setContent, content, {
      emitUpdate: false,
    });
    if (applied && storesFrom) {
      for (const [name, args] of documentAttrStoreRestores(storesFrom)) {
        executeEditorCommand(getEditorCommands<Record<string, (...values: unknown[]) => boolean>>(editor)?.[name], ...args);
      }
    }
    return applied;
  }
  const authorize = (tr: Transaction) => {
    if (typeof authority === "object") {
      authorizeDocumentShellImportMutation(tr, authority);
    } else {
      trustReadOnlyDocumentMutation(tr, authority);
    }
  };
  try {
    let chain = editor
      .chain()
      .command(({ tr }) => {
        authorize(tr);
        return true;
      })
      .setContent(content as JSONContent, { emitUpdate: false });
    if (storesFrom) {
      chain = chain.command(({ commands, tr }) => {
        // Each restore as restoreDocumentStores runs it (a throw is swallowed
        // there too), on this transaction: the document is drawn once, with
        // its own attributes, instead of drawn with the empty editor's and
        // drawn again by the first restore that changed one (a change of the
        // doc node's attributes redraws every node of the document).
        const named = commands as unknown as Record<string, ((...values: unknown[]) => boolean) | undefined>;
        for (const [name, args] of documentAttrStoreRestores(storesFrom)) {
          try {
            named[name]?.(...args);
          } catch {
            // As executeEditorCommand: the store keeps what it had.
          }
        }
        // The restores mark the transaction as theirs; it is the content's.
        authorize(tr);
        return true;
      });
    }
    return chain.run();
  } catch {
    return false;
  }
}

/**
 * Word/Google-Docs open semantics: hydration must leave an EMPTY undo stack.
 *
 * The hydration `setContent` (and the doc-attr restores that follow it) used
 * to land in prosemirror-history as ordinary undoable steps, so ~10×Cmd+Z
 * right after opening walked back through hydration and BLANKED the whole
 * document — the only remaining protection being the empty-overwrite
 * autosave guard. prosemirror-history has no public clear API; recreating
 * the EditorState for the SAME doc + plugins re-initializes every plugin
 * state (history included) while the document, its attrs and the selection
 * are preserved by identity — no redraw, no update event (matching the
 * hydration path's `emitUpdate: false`).
 *
 * Guarded so command-object mock harnesses (no real view/state surface)
 * no-op. Callers must skip collab sessions: collab replaces
 * prosemirror-history with the Yjs undo manager, and the y-sync plugin
 * state must never be recreated behind its back.
 */
type StateField = { name: string; init: (config: object, instance: EditorState) => unknown };
type StateConfiguration = { fields?: readonly StateField[]; plugins?: readonly Plugin[] };

/**
 * `EditorState.create({ doc, plugins, selection })`, field for field (every
 * plugin state, history included, initialized afresh on the same document,
 * attrs and selection), but on the state's own plugin configuration rather
 * than a copy of it. EditorView compares the configuration by identity: a
 * copy is "the plugins changed", and every plugin view was destroyed and
 * built again on a document they had all just been updated to. On a long
 * book that rebuild was the whole set of plugin views a second time in the
 * opening, and it started over what each view times from its start (the page
 * ledger's input gate). The views now see the reset as any other new state
 * (`update(view, prevState)`). Null when the state does not have the shape
 * prosemirror-state 1.x gives it (the caller then rebuilds as before).
 */
function freshStateOfSameConfiguration(
  state: EditorState,
  doc: ProseMirrorNode,
  selection: EditorState["selection"] | undefined,
): EditorState | null {
  const config = (state as unknown as { config?: StateConfiguration }).config;
  if (!config || !Array.isArray(config.fields) || config.plugins !== state.plugins) return null;
  const Constructor = state.constructor as unknown as new (configuration: StateConfiguration) => EditorState;
  if (typeof Constructor !== "function" || !(state instanceof EditorState)) return null;
  const fresh = new Constructor(config);
  const init = { doc, selection, plugins: state.plugins, schema: state.schema };
  for (const field of config.fields) {
    (fresh as unknown as Record<string, unknown>)[field.name] = field.init(init, fresh);
  }
  return fresh;
}

export function clearHydrationUndoHistory(editor: MaybeNoteEditor): boolean {
  if (!isUsableEditor(editor)) return false;
  const view = (
    editor as unknown as {
      view?: {
        state?: EditorState;
        updateState?: (state: EditorState) => void;
      };
    }
  ).view;
  const state = view?.state;
  if (!view || typeof view.updateState !== "function" || !state) return false;
  const doc = (state as { doc?: ProseMirrorNode | null }).doc;
  const plugins = (state as { plugins?: readonly Plugin[] }).plugins;
  const selection = (state as { selection?: EditorState["selection"] })
    .selection;
  if (!doc || !Array.isArray(plugins)) return false;
  try {
    view.updateState(freshStateOfSameConfiguration(state, doc, selection) ??
      EditorState.create({ doc, plugins: [...plugins], selection }));
    return true;
  } catch {
    // A partial editor surface or an exotic plugin set must never break
    // hydration — the worst case is history keeping the hydration entry.
    return false;
  }
}

/**
 * A document as it is stored: validated, charts on V2, whiteboard scenes
 * serialized, page wrappers flattened with the page distribution stamped
 * (measured on `paginationEditor` when its first pagination has settled),
 * block ids ensured. NoteEditor's normalizeDocumentForSave.
 */
export function normalizeDocumentContentForSave(
  contentJson: unknown,
  paginationEditor: MaybeNoteEditor,
  captureProjection = true,
  deferPagination = false,
): TipTapDocumentContentResult {
  // Validate before page-wrapper transforms. Otherwise a malformed root can
  // be flattened/coerced into a valid empty doc and later overwrite the
  // original persisted bytes.
  const resolved = resolveTipTapDocumentContent(contentJson);
  if (!resolved.ok) return resolved;
  let document: Record<string, unknown>;
  try {
    // A page stored with a V1 chart reads back on the one chart model,
    // so the editor, its saved baseline and the next save all hold V2.
    document = withLegacyChartsOnV2(serializeWhiteboardScenes(resolved.document));
  } catch {
    return { ok: false, issue: "invalid_content" };
  }
  // Structural pages purity: storage stays FLAT. pageBlock wrappers are
  // editor-runtime structure only - identity fast-path for flat docs.
  // BUT the page boundaries themselves are document truth the server
  // exporters need (PDF pagination 1:1), so the distribution is stamped
  // into doc.attrs.pageBlockSizes BEFORE the wrappers are stripped.
  // A flat/ineligible doc yields null and leaves attrs untouched (any
  // previously stored distribution is preserved as-is; server exporters
  // validate it against the flat block count before trusting it).
  // V3.6: page-split continuation pairs merge back into ONE block first
  // (Word 同一结构 semantics — the split exists only in the editor), so
  // the stored doc and the stamped distribution both see whole blocks.
  // A save made while the pen writes carries no pagination records, as a
  // save made while the first pagination settles does not: measuring the
  // page and digesting its recipe is a forced layout and several passes
  // over the whole document, under the pen (lib/ink-writing-session
  // inkLayoutUnsettled). The records come with the save that follows once
  // the writing has settled (schedulePaginationSettle).
  // Under the cold first layout a document of a few pages is shown while its
  // later pages are still laid out (the ledger's background): those pages
  // are provisional, and a distribution stamped from them would hand the
  // server's exporters page breaks no layout made (coldFirstLayout). The
  // save after the background has finished stamps the real one.
  const paginationDom = editorDom(paginationEditor);
  const paginationSettled = !deferPagination &&
    paginationDom?.hasAttribute(
      INITIAL_PAGINATION_SETTLING_ATTR,
    ) !== true &&
    !(coldFirstLayoutOn(paginationDom?.ownerDocument.defaultView) && paginationDom?.hasAttribute(PAGE_LEDGER_BACKGROUND_ATTR));
  // One serialization memo for the receipt capture and the flatten: they
  // read the same (unmutated) subtrees many times over.
  const stamped = withProjectionJsonMemo(() =>
    flattenPagedDocumentForStorage(document, {
      paginationSettled,
      projection: paginationSettled && captureProjection
        ? captureSavedPaginationProjection(paginationEditor, document)
        : null,
    }),
  );
  // The server stores chart nodes without their inactive legacy nulls; a
  // save that sent them would read back as different content. The
  // projection above is made from the editor's form and proves both.
  const withBlockIds = ensureNativeDocumentBlockIds(
    withoutInactiveChartUnionAttrs(stamped),
  ).document as
    Record<string, unknown> | null | undefined;
  // Keep this as a typed Result too: save callers can fail closed even if a
  // future normalizer accidentally changes the root contract.
  return resolveTipTapDocumentContent(withBlockIds);
}

/**
 * After a document's content is set: its page setup, table grid fit,
 * comment threads, footnotes, sources, mail-merge data, base typography and
 * named styles restored from its doc attrs. NoteEditor's
 * restoreCommentThreads.
 */
export function restoreDocumentStores(editor: MaybeNoteEditor, content: Record<string, unknown>): void {
  // Each restore below DISPATCHES its own transaction, and TipTap's
  // `editor.commands` snapshots the state transaction AT ACCESS TIME —
  // so the command references must be re-acquired FRESH before every
  // call. A single upfront capture made every restore after the first
  // dispatching one throw "Applying a mismatched transaction" (silently
  // swallowed by executeEditorCommand): on ordinary pages the page-setup
  // restore no-ops and the bug stayed invisible, but on imported DOCX
  // projections it dispatches (pageSize/margins), which silently dropped
  // the comment-thread / footnote / citation stores on every load.
  const freshCommands = () => getEditorCommands<{ fitTableGridsToPage?: () => boolean }>(editor);
  const named = () => getEditorCommands<Record<string, (...values: unknown[]) => boolean>>(editor);
  const [pageSetup, ...stores] = documentAttrStoreRestores(content);
  executeEditorCommand(named()?.[pageSetup[0]], ...pageSetup[1]);
  // The editor instance is created empty and receives the real page through
  // setContent, so TableGridFit's onCreate pass cannot see hydrated tables.
  // Run its one-shot repair only after page geometry is restored; keeping it
  // here also covers page navigation, reload, guest replacement and rollback
  // without continuously clamping widths that the user later drags wider.
  executeEditorCommand(freshCommands()?.fitTableGridsToPage);
  for (const [name, args] of stores) executeEditorCommand(named()?.[name], ...args);
  restoreNamedStyles(editor, content);
}

/**
 * The doc-attr stores of a stored document, in restoreDocumentStores' order:
 * each a command that sets doc attributes only, under the hydration-restore
 * authority (page setup, comment threads, footnotes, sources, mail-merge
 * data, base typography). The table grid fit and the named styles are not
 * among them: the fit is a layout normalization of its own, and the named
 * styles ask whether the editor is editable at the time.
 */
function documentAttrStoreRestores(content: Record<string, unknown>): Array<[string, unknown[]]> {
  const attrs = (content.attrs ?? {}) as Record<string, unknown>;
  return [
    ["restoreDocumentPageSetup", [attrs]],
    ["restoreCommentThreads", [attrs.commentThreads]],
    ["restoreFootnotes", [attrs.footnotes, attrs.footnoteMode]],
    ["restoreSources", [attrs.sources, attrs.citationStyle]],
    ["restoreMailMergeData", [attrs.mailMergeData]],
    // Base typography (imported DOCX defaults) is a doc attr too — without
    // this re-application the page surface AND the .docx export lose the
    // document's own font after every reload.
    ["restoreDocumentTypography", [attrs.defaultFontFamily, attrs.defaultFontSize]],
  ];
}

/**
 * restoreDocumentStores after a content replacement that restored the doc-attr
 * stores in its own transaction (executeAuthorizedContentReplacement with
 * storesFrom): the table grid fit, then the named styles.
 */
export function restoreDocumentStoresAfterContent(editor: MaybeNoteEditor, content: Record<string, unknown>): void {
  executeEditorCommand(getEditorCommands<{ fitTableGridsToPage?: () => boolean }>(editor)?.fitTableGridsToPage);
  restoreNamedStyles(editor, content);
}

function restoreNamedStyles(editor: MaybeNoteEditor, content: Record<string, unknown>): void {
  // The named-style palette rides the same doc-attr restore path.
  const styleCommands = getEditorCommands<{
    setNamedStyles?: (styles: unknown) => boolean;
  }>(editor);
  const namedStyles = (
    content.attrs as { namedStyles?: unknown } | undefined
  )?.namedStyles;
  if (Array.isArray(namedStyles) && namedStyles.length > 0) {
    executeEditorCommand(styleCommands?.setNamedStyles, namedStyles);
  }
}

export type PreparedDocumentHydration =
  | { ok: true; flatContent: Record<string, unknown>; content: Record<string, unknown> }
  | { ok: false; issue: TipTapDocumentContentIssue };

/**
 * The layout a hydration of `pageId` may open on: the row kept for its content
 * (layoutSnapshot), else the one this browser last reached. `restored` says
 * which of them the pages now stand on.
 */
export function hydrationLayoutReceipt(pageId: string): { receipt: (root: JSONContent) => unknown; restored: (root: object | null | undefined) => void } {
  let snapshot: ReturnType<typeof snapshotReceiptFor> = null;
  let content: JSONContent | null = null;
  let printed: ReturnType<typeof printLayoutReceiptFor> = null;
  return {
    receipt: (root) => {
      printed = pageId ? printLayoutReceiptFor(pageId, root) : null;
      if (printed) return printed.receipt;
      if (layoutSnapshotsEnabled()) {
        content = root;
        snapshot = snapshotReceiptFor(pageId, 0, root, "hydration");
        // With kept layouts on, this browser's own older record is not asked:
        // it names no layout code or fonts.
        return snapshot?.receipt ?? null;
      }
      return pageId ? cachedDocsLayoutReceipt(pageId) : null;
    },
    restored: (root) => {
      if (printed) {
        traceLayoutSnapshot(`print restored ${printed.parts.length} parts, complete=${printed.complete}`);
        // A part with no row stands to be laid out: then none is trusted.
        if (!printed.complete) markRestoredLayout(root, false);
        else markRestoredSnapshot(root, { pageId, row: printed.parts[0]!.row, content: printed.parts[0]!.content, printParts: printed.parts });
        return;
      }
      if (snapshot && content) markRestoredSnapshot(root, { pageId, row: snapshot.row, content });
    },
  };
}

/** A stored document ready to be set: normalized, checked, OMML styles upgraded, page blocks wrapped. */
export function prepareDocumentHydration(
  initialContent: unknown,
  paginationEditor: MaybeNoteEditor,
  pageId: string,
): PreparedDocumentHydration {
  const normalized = normalizeDocumentContentForSave(initialContent, paginationEditor);
  if (!normalized.ok) return { ok: false, issue: normalized.issue };
  if (!savedDocumentAttrsAreRestorable(normalized.document)) {
    return { ok: false, issue: "unsupported_document_attrs" };
  }
  const flatContent = hydrateLegacyDocxOfficeMathStyles(normalized.document);
  const kept = hydrationLayoutReceipt(pageId);
  const content = hydrateStoredPageBlocks(flatContent, kept.receipt, pageId ? cachedDocsLayoutSizes(pageId) : null);
  const root = isUsableEditor(paginationEditor) ? editorDom(paginationEditor) : null;
  markRestoredLayout(root, hydrationWasRestored(content));
  if (hydrationWasRestored(content)) kept.restored(root);
  return { ok: true, flatContent, content };
}
