"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The editing surface of a header/footer island: a real editor instance on
 * the band's story, so every command the ribbon offers a body paragraph
 * (alignment, tabs, fonts, fields, pictures, tables) works the same way here.
 *
 * The story opens as the band model turned into a document
 * (`bandStoryDoc.ts`), with the document editor's own extensions, and every
 * change goes back as the band model to the island, which commits it through
 * the same doc-attr commands as before. The story document also mirrors the
 * DOCUMENT's attributes (page setup, section bands, ...) so a ribbon that
 * reads them while this editor is the active one reads the truth, and a
 * command that writes them from here (page margins, a band option) is
 * forwarded to the document editor instead of landing on the mirror.
 */

import { useEffect, useRef } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { UndoRedo } from "@tiptap/extensions";
import type { Extensions } from "@tiptap/core";
import type { Transaction } from "@tiptap/pm/state";

import type { BandRichBlock } from "@mrnote/core/web/components/console/editor/native-document/headerFooter.ts";
import { bandRichToPmDoc, pmDocToBandRich, type PmJson } from "./bandStoryDoc";
import {
  BandNativeAtoms,
  BandRunMark,
  BandStoryBlocks,
  BandStoryExtras,
  bandStoryRuleExtensions,
} from "@mrnote/core/web/components/console/editor/native-document/paged/bandRunMark.ts";
import type { DocumentFieldExtensionOptions } from "../documentFieldExtension";
import type { FieldContext } from "@mrnote/core/web/components/console/editor/native-document/documentFieldValues.ts";
import { BandLineLayout } from "./bandLineLayout";
import type { BandTokenContext } from "@mrnote/core/web/components/console/editor/native-document/paged/bandRichDom.ts";
import { BandTabLayout } from "./bandTabLayout";
import { BandStoryPictures } from "./bandStoryPictures";

/** Transactions that only refresh the document-attr mirror carry this meta. */
export const BAND_STORY_MIRROR_META = "bandStoryMirror";

export interface BandStoryEditorProps {
  readonly initialBlocks: readonly BandRichBlock[] | null;
  /** The text width of the sheet in twips: an empty story's first line gets
   * Word's Header/Footer style stops, centre at half the width and right at
   * the width, as its own tab stops. */
  readonly textWidthTwips?: number;
  /** The document's own Header (or Footer) paragraph style id, given to the
   * lines of a story that opens blank, as Word types a new header in its
   * Header style. Absent on a page without Word styles: the export writes
   * the style there. */
  readonly paragraphStyleId?: string;
  readonly extensions: Extensions;
  /** The page number and page count the sheet's painted band shows: a PAGE
   * or NUMPAGES field in the open story shows the same (Word's header pane
   * shows the page it is open on), not the story's own one page. */
  readonly fieldContext?: Pick<BandTokenContext, "pageLabel" | "totalPages" | "pageNumberValue">;
  readonly editable: boolean;
  /** The document editor's doc attrs, mirrored onto the story document. */
  readonly documentAttrs: Record<string, unknown>;
  readonly ariaLabel: string;
  readonly testId?: string;
  /** The band the story now holds, and the nodes it holds that the band
   * cannot (named, so the edit is refused instead of losing them). */
  readonly onChange: (blocks: BandRichBlock[], unsupported: readonly string[]) => void;
  /** A doc-attr change a command made on the story goes to the document. */
  readonly onDocumentAttrsChange: (patch: Record<string, unknown>) => void;
  readonly onReady: (editor: Editor | null) => void;
  readonly onEscape: () => void;
  readonly onBlur: (event: FocusEvent) => void;
  /** Content the band cannot hold was not applied (a rule or a picture
   * pasted, a command that would make a list): the island says so. */
  readonly onBlockRefused?: () => void;
}

/** Whether the extensions already bring undo/redo. A collaborative document
 * hands undo to its Yjs undo manager and drops StarterKit's own history; the
 * story is outside that collaboration (it commits on close), so it then needs
 * its own, or Undo, and the "undo this" a refused edit asks for, do nothing. */
function extensionsBringUndoRedo(extensions: Extensions): boolean {
  return extensions.some((extension) => {
    if (extension.name === "undoRedo") return true;
    if (extension.name !== "starterKit") return false;
    return (extension.options as { undoRedo?: unknown }).undoRedo !== false;
  });
}

/** The story's page fields read the sheet's numbers: the document's field
 * extension, with the sheet's page number and count laid over its context. */
function withSheetFieldContext(
  extensions: Extensions,
  sheetContext: () => FieldContext | null,
): Extensions {
  return extensions.map((extension) => {
    if (extension.name !== "documentFields") return extension;
    const parent = (extension.options as DocumentFieldExtensionOptions | undefined)?.getContext;
    return extension.configure({
      getContext: () => ({ ...(parent?.() ?? {}), ...(sheetContext() ?? {}) }),
    });
  });
}

function mirrorableAttrs(
  editor: Editor,
  attrs: Record<string, unknown>,
): Record<string, unknown> {
  const spec = editor.schema.nodes.doc.spec.attrs ?? {};
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(spec)) {
    if (key in attrs) out[key] = attrs[key];
  }
  return out;
}

function applyMirror(editor: Editor, attrs: Record<string, unknown>): void {
  if (editor.isDestroyed) return;
  const wanted = mirrorableAttrs(editor, attrs);
  const current = editor.state.doc.attrs;
  const changed = Object.keys(wanted).filter((key) => current[key] !== wanted[key]);
  if (!changed.length) return;
  const tr = editor.state.tr;
  for (const key of changed) tr.setDocAttribute(key, wanted[key]);
  tr.setMeta(BAND_STORY_MIRROR_META, true);
  tr.setMeta("addToHistory", false);
  editor.view.dispatch(tr);
}

export default function BandStoryEditor({
  initialBlocks,
  textWidthTwips,
  paragraphStyleId,
  extensions,
  fieldContext,
  editable,
  documentAttrs,
  ariaLabel,
  testId = "sheet-band-story-editor",
  onChange,
  onDocumentAttrsChange,
  onReady,
  onEscape,
  onBlur,
  onBlockRefused,
}: BandStoryEditorProps) {
  const callbacks = useRef({ onChange, onDocumentAttrsChange, onEscape, onBlur, onBlockRefused });
  callbacks.current = { onChange, onDocumentAttrsChange, onEscape, onBlur, onBlockRefused };
  const sheetFields = useRef(fieldContext);
  sheetFields.current = fieldContext;
  const initialContent = useRef<PmJson | null>(null);
  if (initialContent.current === null) {
    initialContent.current = bandRichToPmDoc(initialBlocks);
    const width = Math.round(textWidthTwips ?? 0);
    const blank = (initialBlocks ?? []).every(
      (block) => block.type === "paragraph" && !block.runs.length && !block.tabStops?.length,
    );
    if (blank && paragraphStyleId) {
      for (const line of initialContent.current.content?.[0]?.content ?? []) {
        if (line.type !== "paragraph" || line.attrs?.docxStyleId) continue;
        line.attrs = { ...line.attrs, docxStyleId: paragraphStyleId };
      }
    }
    if (blank && width >= 720) {
      // Word's Header and Footer styles: a centre stop at half the text
      // width and a right stop at the width (Letter: 4680 / 9360 twips). A
      // story that opens blank -- new, or Word's empty part -- starts with
      // them on every line.
      for (const line of initialContent.current.content?.[0]?.content ?? []) {
        if (line.type !== "paragraph") continue;
        line.attrs = {
          ...line.attrs,
          tabStops: [
            { pos: Math.round(width / 2), align: "center", leader: "none" },
            { pos: width, align: "right", leader: "none" },
          ],
        };
      }
    }
  }

  const storyExtensions = useRef<Extensions | null>(null);
  if (storyExtensions.current === null) {
    storyExtensions.current = [
      ...withSheetFieldContext(extensions, () =>
        sheetFields.current
          ? {
              pageLabel: sheetFields.current.pageLabel,
              pageCount: sheetFields.current.totalPages,
              pageOrdinal: sheetFields.current.pageNumberValue ?? null,
            }
          : null,
      ),
      ...(extensionsBringUndoRedo(extensions) ? [] : [UndoRedo]),
      BandRunMark,
      BandStoryExtras,
      BandNativeAtoms,
      // The line's pictures, drawn where the band draws them: selected,
      // sized by their corner and deleted as in Word's header pane.
      BandStoryPictures,
      BandStoryBlocks.configure({ onRefused: () => callbacks.current.onBlockRefused?.() }),
      
      // with its own extension set still gets it here.
      ...(extensions.some((extension) => extension.name === BandTabLayout.name) ? [] : [BandTabLayout]),
      BandLineLayout,
    ];
  }
  const ruleExtensions = useRef<string[] | null>(null);
  if (ruleExtensions.current === null) ruleExtensions.current = bandStoryRuleExtensions(storyExtensions.current);

  const editor = useEditor(
    {
      extensions: storyExtensions.current,
      enableInputRules: ruleExtensions.current,
      enablePasteRules: ruleExtensions.current,
      content: initialContent.current,
      editable,
      immediatelyRender: false,
      autofocus: "end",
      editorProps: {
        attributes: {
          class: "note-editor-content sheet-band-story",
          "aria-label": ariaLabel,
          "data-testid": testId,
        },
        handleKeyDown: (view, event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            callbacks.current.onEscape();
            return true;
          }
          if (event.key === "Tab" && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
            // In a table cell Tab moves to the next cell, as in the body: the
            
            const { $from, empty } = view.state.selection;
            for (let depth = $from.depth; depth > 0; depth -= 1) {
              const role = $from.node(depth).type.spec.tableRole;
              if (role === "cell" || role === "header_cell") return false;
              // Tab at the start of a list item (or over a selection in one)
              // demotes it a level, as Word does in a header and in the body:
              // the list keymap takes it.
              if ($from.node(depth).type.name === "listItem" && (!empty || $from.parentOffset === 0)) return false;
            }
            // In a header the Tab key goes to the next tab stop (Word's
            // "left [Tab] centre [Tab] right"), never to a block indent.
            event.preventDefault();
            view.dispatch(view.state.tr.insertText("\t").scrollIntoView());
            return true;
          }
          return false;
        },
      },
      onTransaction: ({ editor: instance, transaction }: { editor: Editor; transaction: Transaction }) => {
        if (!transaction.docChanged || transaction.getMeta(BAND_STORY_MIRROR_META)) return;
        const before = transaction.before.attrs;
        const after = transaction.doc.attrs;
        const patch: Record<string, unknown> = {};
        for (const key of Object.keys(after)) {
          if (before[key] !== after[key]) patch[key] = after[key];
        }
        if (Object.keys(patch).length) callbacks.current.onDocumentAttrsChange(patch);
        if (!transaction.before.content.eq(transaction.doc.content)) {
          const unsupported: string[] = [];
          const blocks = pmDocToBandRich(instance.getJSON() as PmJson, unsupported);
          callbacks.current.onChange(blocks, unsupported);
        }
      },
      onBlur: ({ event }: { event: FocusEvent }) => callbacks.current.onBlur(event),
    },
    [],
  );

  // Both writes dispatch a ProseMirror transaction, and a transaction re-renders
  // the story's React node views through flushSync. Dispatched from inside the
  // effect that is still part of React's commit, that flush is refused
  // ("flushSync was called from inside a lifecycle method": clicking into a
  // footer right after inserting a page number). A microtask runs once the
  // commit is over; a story unmounted or replaced meanwhile is skipped.
  useEffect(() => {
    if (!editor) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled || editor.isDestroyed) return;
      applyMirror(editor, documentAttrs);
    });
    return () => { cancelled = true; };
  }, [editor, documentAttrs]);

  useEffect(() => {
    if (!editor) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled || editor.isDestroyed) return;
      editor.setEditable(editable);
    });
    return () => { cancelled = true; };
  }, [editor, editable]);

  // A field draws itself again on a transaction: a new page number or count
  // for the sheet (pages added above it) reaches the open story.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.view.dispatch(editor.state.tr.setMeta(BAND_STORY_MIRROR_META, true).setMeta("addToHistory", false));
  }, [editor, fieldContext?.pageLabel, fieldContext?.totalPages]);

  useEffect(() => {
    onReady(editor ?? null);
    return () => onReady(null);
    // The host keeps the instance for as long as the island is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  return <EditorContent editor={editor} className="sheet-band-story-host" />;
}
