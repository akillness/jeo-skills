"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { isDocumentFormsProtected } from "@mrnote/core/web/components/console/editor/native-document/documentProtection.ts";
import {
  legacyCheckBoxChecked,
  legacyDropdownEntries,
  legacyDropdownIndex,
  legacyFormFieldEnabled,
  legacyFormFieldKind,
  legacyTextMaxLength,
  withLegacyCheckBox,
  withLegacyDropdown,
  withLegacyText,
  type LegacyFormFieldKind,
} from "@mrnote/core/web/components/console/editor/native-document/legacyFormFields.ts";
import { Extension, Node, mergeAttributes } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection, type Transaction } from "@tiptap/pm/state";
import type { NodeView } from "@tiptap/pm/view";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import { reactNodeViewWithLivePosition } from "@mrnote/core/web/components/console/editor/extensions/reactNodeViewPosition.tsx";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import {
  layoutAuthorityTable,
  layoutDocumentIndex,
  type AuthorityLayoutEntry,
  type IndexLayoutEntry,
  type IndexLayoutGroup,
  type ReferencePage,
} from "./documentIndexLayout";
import { normalizeIndexSettings } from "@mrnote/core/web/components/console/editor/native-document/documentIndexSettings.ts";
import { liveSeqFieldText } from "@mrnote/core/web/components/console/editor/native-document/fieldCaptions.ts";

import {
  createDocumentFieldAttrs,
  DOCUMENT_FIELD_NODE_NAME,
  normalizeDocumentFieldAttrs,
  normalizeDocumentFieldFormat,
  normalizeDocumentFieldInstruction,
  normalizeDocumentFieldOptions,
  normalizeDocumentFieldType,
  normalizeDocumentFieldUpdatePolicy,
  resolveDocumentFieldDisplay,
  sanitizeDocumentFieldCachedValue,
  withBandDashFormat,
  type DocumentFieldInput,
  type DocumentFieldType,
  type FieldContext,
} from "@mrnote/core/web/components/console/editor/native-document/documentFieldValues.ts";
import { normalizeAuthorityTableSettings } from "@mrnote/core/web/components/console/editor/native-document/documentAuthoritySettings.ts";
import { createDocumentFieldStyleRunPlugin } from "./documentFieldStyleRun";
import { documentPageNumberLabel, documentPageNumberValue } from "@mrnote/core/web/components/console/editor/native-document/documentPageNumbers.ts";
import { bookmarkRangesFor } from "@mrnote/core/web/components/console/editor/native-document/bookmarkExtension.ts";
import { liveCrossRefLabel } from "@mrnote/core/web/components/console/editor/native-document/crossReferenceExtension.tsx";
import { refreshWhenEditPauses } from "@mrnote/core/web/components/console/editor/native-document/editPausedViews.ts";
import {
  createDocumentFieldCodesPlugin,
  documentFieldCodeShown,
  documentFieldCodesKey,
  documentFieldCodeText,
  nativeFieldIsPlain,
  computeNativeFieldResult,
  selectedDocumentFields,
  toggleDocumentFieldCodesMeta,
} from "./documentFieldCodes";

export interface InsertDocumentFieldOptions extends Omit<
  DocumentFieldInput,
  "fieldType"
> {
  /** Display-only values used to capture the initial cached result. */
  context?: FieldContext;
}

export interface DocumentFieldExtensionOptions {
  /** Optional live metadata supplied by the host (author, filename, clock). */
  getContext?: () => FieldContext;
}

/**
 * The document's live identity -- its current file name -- as the host knows
 * it, per editor. A FILENAME field is recomputed on open in Word: its
 * stored result is only what it showed when last computed. Nothing supplied
 * the name to the body's fields, so each kept the name it was inserted with
 * and a renamed document showed two names (WUA 116). The host publishes the
 * name here; every field view of that editor redraws with it.
 */
type LiveFieldIdentity = Pick<FieldContext, "filename">;
const liveFieldIdentities = new WeakMap<object, LiveFieldIdentity>();
const liveFieldIdentityListeners = new WeakMap<object, Set<() => void>>();

export function publishDocumentFieldIdentity(editor: object, identity: LiveFieldIdentity): void {
  const previous = liveFieldIdentities.get(editor);
  if (previous?.filename === identity.filename) return;
  liveFieldIdentities.set(editor, identity);
  for (const listener of liveFieldIdentityListeners.get(editor) ?? []) listener();
}

function subscribeDocumentFieldIdentity(editor: object, listener: () => void): () => void {
  let listeners = liveFieldIdentityListeners.get(editor);
  if (!listeners) {
    listeners = new Set();
    liveFieldIdentityListeners.set(editor, listeners);
  }
  listeners.add(listener);
  return () => listeners?.delete(listener);
}

function liveFieldIdentity(editor: object): LiveFieldIdentity {
  const identity = liveFieldIdentities.get(editor);
  return identity?.filename ? identity : {};
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    documentFields: {
      /** Insert a real inline field atom; no magic placeholder text is stored. */
      insertDocumentField: (
        fieldType: DocumentFieldType,
        options?: InsertDocumentFieldOptions,
      ) => ReturnType;
      /** Insert (or, at `replaceAt`, replace) a field with these attrs. */
      insertDocumentFieldAttrs: (
        attrs: Record<string, unknown>,
        replaceAt?: number,
      ) => ReturnType;
      /** Shift+F9 (the selected fields) / Option+F9 (every field). */
      toggleDocumentFieldCodes: (scope: "selection" | "all") => ReturnType;
      /** F9: the selected fields compute their result again. */
      updateDocumentFields: () => ReturnType;
      /** Command+F11 / Command+Shift+F11. */
      setDocumentFieldsLocked: (locked: boolean) => ReturnType;
      /** Command+Shift+F9: the selected fields become their result text. */
      unlinkDocumentFields: () => ReturnType;
    };
  }
}

/**
 * Derive PAGE/NUMPAGES from the editor's structural pageBlock containers.
 * PAGE shows the number its page prints (the section's Start at and format,
 * as the footer on that page does), not the sheet's index: with Start at 10
 * a body PAGE field said 1 under a footer saying 10 (live Word audit WUA 118).
 */
function pageContextAtPosition(
  doc: ProseMirrorNode,
  position: number | null,
): Pick<FieldContext, "pageNumber" | "pageCount" | "pageLabel" | "pageOrdinal"> {
  const starts = pageStartsOf(doc);
  const pageCount = starts.length;
  if (pageCount === 0) return { pageNumber: null, pageCount: null };
  const pageNumber = position === null ? null : pageHolding(doc, starts, position);
  if (pageNumber === null) return { pageNumber, pageCount };
  return {
    pageNumber,
    pageCount,
    pageLabel: documentPageNumberLabel(doc, pageNumber),
    pageOrdinal: documentPageNumberValue(doc, pageNumber),
  };
}

/** Where a document's sheets start, read once per document version: every field
 * of the document asks. */
const pageStartsByDoc = new WeakMap<ProseMirrorNode, readonly number[]>();

function pageStartsOf(doc: ProseMirrorNode): readonly number[] {
  const known = pageStartsByDoc.get(doc);
  if (known) return known;
  const starts: number[] = [];
  doc.forEach((child, offset) => {
    if (child.type.name === "pageBlock") starts.push(offset);
  });
  pageStartsByDoc.set(doc, starts);
  return starts;
}

/** The 1-based sheet `position` is inside, or null between or after the sheets. */
function pageHolding(doc: ProseMirrorNode, starts: readonly number[], position: number): number | null {
  if (position < starts[0]!) return null;
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (starts[middle]! <= position) low = middle;
    else high = middle - 1;
  }
  const sheet = doc.nodeAt(starts[low]!);
  return sheet && position < starts[low]! + sheet.nodeSize ? low + 1 : null;
}

function fieldOptionsFromElement(element: HTMLElement) {
  try {
    return normalizeDocumentFieldOptions(
      JSON.parse(element.getAttribute("data-field-options") || "{}"),
    );
  } catch {
    return {};
  }
}

const REFERENCE_LEADER_GLYPH: Record<string, string> = {
  dot: ".",
  hyphen: "-",
  underscore: "_",
  none: " ",
};

function ReferencePages({
  pages,
  separator,
}: {
  pages: readonly ReferencePage[];
  separator: string;
}) {
  return (
    <>
      {pages.map((page, index) => (
        <span key={page.label}>
          {index > 0 ? separator : null}
          <span
            style={{
              fontWeight: page.bold ? 700 : undefined,
              fontStyle: page.italic ? "italic" : undefined,
            }}
          >
            {page.label}
          </span>
        </span>
      ))}
    </>
  );
}

/**
 * What Word's INDEX / TOA field shows: the entries themselves with their
 * pages, in the field's columns, type and format. Re-derived from the live
 * document once an edit pauses, committed only when it changed.
 */
function ReferenceListFieldResult({
  editor,
  fieldType,
  options,
}: {
  editor: NodeViewProps["editor"];
  fieldType: "INDEX" | "TOA";
  options: Record<string, unknown>;
}) {
  const t = useTranslations("console-notebooks");
  const optionsKey = JSON.stringify(options ?? {});
  const derive = useCallback(() => {
    const parsed = JSON.parse(optionsKey) as Record<string, unknown>;
    return fieldType === "INDEX"
      ? JSON.stringify(layoutDocumentIndex(editor.state.doc, parsed))
      : JSON.stringify(layoutAuthorityTable(editor.state.doc, parsed));
  }, [editor, fieldType, optionsKey]);
  const [layout, setLayout] = useState(derive);
  useEffect(() => {
    const refresh = () => {
      const next = derive();
      setLayout((previous) => (previous === next ? previous : next));
    };
    refresh();
    return refreshWhenEditPauses(editor, "reference-lists", refresh);
  }, [derive, editor]);

  if (fieldType === "INDEX") {
    const settings = normalizeIndexSettings(JSON.parse(optionsKey));
    const groups = JSON.parse(layout) as IndexLayoutGroup[];
    if (groups.length === 0) {
      // Word's INDEX field with nothing marked reads "No index entries
      // found." in bold.
      return <strong data-testid="document-index-result-empty">{t("toolbar.indexEmpty")}</strong>;
    }
    const tail = (entry: IndexLayoutEntry, leader: boolean) => (
      <>
        {entry.pages.length > 0 ? (
          leader ? (
            <>
              <span className="mrnote-reference-list__leader" aria-hidden="true">
                {(REFERENCE_LEADER_GLYPH[settings.tabLeader] ?? ".").repeat(200)}
              </span>
              <span className="mrnote-reference-list__pages">
                <ReferencePages pages={entry.pages} separator={settings.pageListSeparator} />
              </span>
            </>
          ) : (
            <span>
              {settings.entryPageSeparator}
              <ReferencePages pages={entry.pages} separator={settings.pageListSeparator} />
            </span>
          )
        ) : null}
        {entry.crossReferences.map((reference) => (
          <span key={reference}>
            {settings.crossReferenceSeparator}
            <span style={{ fontStyle: "italic" }}>{reference}</span>
          </span>
        ))}
      </>
    );
    return (
      <span
        className="mrnote-reference-list mrnote-reference-list--index"
        data-testid="document-index-result"
        data-format={settings.format}
        data-run-in={settings.runIn ? "true" : "false"}
        style={{ columnCount: settings.columns }}
      >
        {groups.map((group, groupIndex) => {
          // Run-in: a main entry and its subentries share one paragraph.
          const paragraphs: IndexLayoutEntry[][] = [];
          for (const entry of group.entries) {
            if (settings.runIn && entry.level === 2 && paragraphs.length > 0) {
              paragraphs[paragraphs.length - 1].push(entry);
            } else {
              paragraphs.push([entry]);
            }
          }
          return (
            <span key={`${group.heading ?? ""}:${groupIndex}`} className="mrnote-reference-list__group">
              {group.heading ? (
                <span className="mrnote-reference-list__heading" data-format={settings.format}>
                  {group.heading}
                </span>
              ) : null}
              {paragraphs.map((paragraph) => (
                <span
                  key={`${paragraph[0].level}:${paragraph[0].text}`}
                  className="mrnote-reference-list__entry"
                  data-testid="document-index-result-entry"
                  data-level={paragraph[0].level}
                  data-leader={settings.rightAlignPageNumbers && !settings.runIn ? "true" : undefined}
                >
                  {paragraph.map((entry, index) => (
                    <span key={`${entry.level}:${entry.text}`} className="mrnote-reference-list__run">
                      {index === 1 ? ": " : index > 1 ? "; " : null}
                      <span className="mrnote-reference-list__text">{entry.text}</span>
                      {tail(entry, settings.rightAlignPageNumbers && !settings.runIn)}
                    </span>
                  ))}
                </span>
              ))}
            </span>
          );
        })}
      </span>
    );
  }

  const settings = normalizeAuthorityTableSettings(JSON.parse(optionsKey));
  const entries = JSON.parse(layout) as AuthorityLayoutEntry[];
  // An empty separator is Word's own result: a right tab stop with a dot leader.
  const leader = settings.entryPageSeparator === "";
  return (
    <span
      className="mrnote-reference-list mrnote-reference-list--authorities"
      data-testid="document-authority-result"
    >
      {settings.includeCategoryHeading ? (
        <span className="mrnote-reference-list__heading" data-format="authorities">
          {t(`toolbar.authorityCategory${settings.category}` as "toolbar.authorityCategory1")}
        </span>
      ) : null}
      {entries.length === 0 ? (
        <strong data-testid="document-authority-result-empty">{t("toolbar.authorityTableEmpty")}</strong>
      ) : (
        entries.map((entry) => (
          <span
            key={entry.citation}
            className="mrnote-reference-list__entry"
            data-testid="document-authority-result-entry"
            data-level={1}
            data-leader={leader ? "true" : undefined}
          >
            <span className="mrnote-reference-list__text">{entry.citation}</span>
            {leader ? (
              <span className="mrnote-reference-list__leader" aria-hidden="true">
                {".".repeat(200)}
              </span>
            ) : (
              settings.entryPageSeparator
            )}
            <span className="mrnote-reference-list__pages">
              {entry.passim ? (
                <span style={{ fontStyle: "italic" }}>passim</span>
              ) : (
                <ReferencePages pages={entry.pages} separator={settings.pageListSeparator} />
              )}
            </span>
          </span>
        ))
      )}
    </span>
  );
}

/** The text a field atom at `position` shows. */
/**
 * The page bookmark a field's bookmark operand names: the export's own
 * `Mrbk_<name>` is `<name>`, Word's hidden `_Ref#########` is the page's
 * `MrRef#########` (the import reads it so when a field cites it).
 */
export function pageBookmarkNameForFieldTarget(target: unknown): string | null {
  if (typeof target !== "string" || !target) return null;
  const hidden = /^_Ref(\d{9})$/i.exec(target);
  if (hidden) return `MrRef${hidden[1]}`;
  return target.startsWith("Mrbk_") ? target.slice("Mrbk_".length) : target;
}

/**
 * What a plain REF field shows now: the text its bookmark holds, the SEQ
 * fields in it at their live numbers. Null when the field asks for a
 * paragraph number or a position (\r \n \w \p), or its bookmark holds
 * nothing on the page (a point): the field's cached result stands.
 */
export function liveBookmarkReferenceText(
  doc: ProseMirrorNode,
  options: Record<string, unknown> | undefined,
): string | null {
  if (!options || options.numberMode || options.position === true) return null;
  const name = pageBookmarkNameForFieldTarget(options.target);
  if (!name) return null;
  const ranges = bookmarkRangesFor(doc, name);
  if (!ranges.some((range) => range.to > range.from)) return null;
  return liveCrossRefLabel(doc, "bookmark", name);
}

export function documentFieldViewText(
  doc: ProseMirrorNode,
  askedPosition: number | null,
  attrs: Record<string, unknown>,
  context?: Partial<FieldContext>,
): string {
  // A view's position is read back from the DOM and may still be the one from
  // before an edit that shortened the document: read past the end, a caption's
  // SEQ near the end threw and the whole window fell to its error page, from a
  // table row deleted above it (corpus R337-D01). Its text waits for the next
  // refresh, as a view with no position does.
  const position =
    askedPosition !== null && askedPosition >= 0 && askedPosition <= doc.content.size ? askedPosition : null;
  const field = normalizeDocumentFieldAttrs(attrs);
  // INDEX and TOA draw their own result (ReferenceListFieldResult).
  if (field?.fieldType === "INDEX" || field?.fieldType === "TOA") return "";
  // A SEQ field is a caption's number: it counts with the document's other
  // captions of its label, live, instead of showing the number it was
  // imported with -- unless it is locked, which keeps its cached result as
  
  if (field?.fieldType === "SEQ" && !field.locked && position !== null) {
    const live = liveSeqFieldText(doc, position, field.format);
    if (live !== null) return live;
  }
  // A REF shows the text its bookmark holds (ECMA-376 §17.16.5.47), the way
  // Word's update writes it: a caption's "Table 2" once a table is inserted
  // before it, not the "Table 1" the file was saved with (AI70H H46 A06).
  // A bookmark the page holds only as a point keeps the cached result.
  if (field?.fieldType === "REF" && !field.locked && position !== null) {
    const live = liveBookmarkReferenceText(doc, field.options);
    if (live !== null) return live;
  }
  // A PAGEREF Word left without a result (written dirty, to be updated on
  // open: corpus R01-D15/R04-D14's hundreds of bookmarks, one per number
  // format) shows the page its bookmark is on, in that page's own number
  // format, as Word's update writes it. A stated result stays the result.
  if (field?.fieldType === "PAGEREF" && !field.locked && !field.cachedValue && position !== null) {
    const target = field.options.target;
    const at = typeof target === "string" ? bookmarkRangesFor(doc, target)[0]?.from : undefined;
    if (typeof at === "number") {
      const page = pageContextAtPosition(doc, at);
      if (page.pageNumber !== null && page.pageNumber !== undefined) {
        return resolveDocumentFieldDisplay({ ...attrs, fieldType: "PAGE" }, { ...(context ?? {}), ...page });
      }
    }
  }
  const structural = pageContextAtPosition(doc, position);
  return withBandDashFormat(attrs, resolveDocumentFieldDisplay(attrs, {
    ...structural,
    ...(context ?? {}),
  }));
}









function replaceSelectionWithField(tr: Transaction, node: ProseMirrorNode): void {
  const { selection } = tr;
  const marks =
    tr.storedMarks ??
    (selection.empty ? selection.$from.marks() : (selection.$from.marksAcross(selection.$to) ?? []));
  tr.replaceSelectionWith(node.mark(marks.filter((mark) => mark.type.name !== "link")), false);
}

/**
 * A SEQ field just inserted holds the number it shows as its result, as Word
 * writes one when it inserts it: a second "Figure" SEQ after a first reads 2,
 * not the 1 its new attributes carry, so a save writes 2 (FIXQUEUE 96: the
 * second of two inserted SEQ fields was saved as 1).
 */
function withInsertedSeqResult(tr: Transaction, pos: number, context?: Partial<FieldContext>): void {
  const node = pos >= 0 ? tr.doc.nodeAt(pos) : null;
  if (node?.type.name !== DOCUMENT_FIELD_NODE_NAME) return;
  const attrs = node.attrs as Record<string, unknown>;
  if (attrs.fieldType !== "SEQ" || attrs.locked === true) return;
  const cachedValue = sanitizeDocumentFieldCachedValue(documentFieldViewText(tr.doc, pos, attrs, context));
  if (!cachedValue || cachedValue === attrs.cachedValue) return;
  tr.setNodeMarkup(pos, undefined, { ...attrs, cachedValue });
}

/** INDEX, TOA and form fields draw controls and lists; all others draw a text. */
function fieldDrawsControls(attrs: Record<string, unknown>): boolean {
  const fieldType = normalizeDocumentFieldType(attrs.fieldType);
  return fieldType === "INDEX" || fieldType === "TOA" || legacyFormFieldKind(attrs) !== null;
}

/** Writes an attribute only when it differs (a write dirties the element's style). */
function writeAttribute(element: HTMLElement, name: string, value: string | undefined): void {
  if (value === undefined) {
    if (element.hasAttribute(name)) element.removeAttribute(name);
  } else if (element.getAttribute(name) !== value) {
    element.setAttribute(name, value);
  }
}

/**
 * The view of a field that draws a text (PAGE, REF, SEQ, a kept Word field: nearly
 * every field of a document). No React root: a document of 700 fields mounted 700
 * at every page cut, and a root also answers each selection change on its own frame.
 */
function createPlainFieldView(
  editor: NodeViewProps["editor"],
  initial: ProseMirrorNode,
  getPos: NodeViewProps["getPos"],
  options: DocumentFieldExtensionOptions,
): NodeView {
  let node = initial;
  let drawnAttrs: Record<string, unknown> | null = null;
  const dom = document.createElement("span");
  dom.className = "mrnote-document-field";
  dom.setAttribute("data-type", "document-field");
  dom.setAttribute("data-testid", "document-field");
  dom.contentEditable = "false";
  dom.style.whiteSpace = "normal";

  const paint = () => {
    if (editor.isDestroyed) return;
    if (drawnAttrs !== node.attrs) {
      drawnAttrs = node.attrs;
      const attrs = normalizeDocumentFieldAttrs(node.attrs);
      writeAttribute(dom, "data-field-type", attrs?.fieldType ?? "");
      writeAttribute(dom, "data-field-instruction", attrs?.instruction ?? "");
      writeAttribute(dom, "data-field-options", JSON.stringify(attrs?.options ?? {}));
      writeAttribute(dom, "data-field-format", attrs?.format ?? "");
      writeAttribute(dom, "data-field-update-policy", attrs?.updatePolicy ?? "on-open");
      writeAttribute(dom, "data-field-cached-value", attrs?.cachedValue ?? "");
      // A kept Word field shows Word's result; its code is the hover text.
      writeAttribute(dom, "title", attrs?.fieldType === "NATIVE" ? attrs.instruction.trim() : undefined);
    }
    const rawPos = typeof getPos === "function" ? getPos() : null;
    const position = typeof rawPos === "number" ? rawPos : null;
    const codeShown = documentFieldCodeShown(editor.state, position);
    writeAttribute(dom, "data-field-code-shown", codeShown ? "true" : undefined);
    const text = codeShown
      ? documentFieldCodeText(node.attrs)
      : documentFieldViewText(editor.state.doc, position, node.attrs, {
          ...liveFieldIdentity(editor),
          ...(options.getContext?.() ?? {}),
        });
    if (dom.textContent !== text) dom.textContent = text;
  };
  paint();

  const stopRefreshing = refreshWhenEditPauses(editor, "document-fields", paint, showsFieldCodesAsked);
  const unsubscribeIdentity = subscribeDocumentFieldIdentity(editor, paint);
  // DATE/TIME remain live even while the document is otherwise idle.
  const fieldType = normalizeDocumentFieldType(node.attrs.fieldType);
  const interval = fieldType === "DATE" || fieldType === "TIME" ? window.setInterval(paint, 30_000) : null;

  return {
    dom,
    update(next) {
      if (next.type !== node.type || fieldDrawsControls(next.attrs)) return false;
      node = next;
      paint();
      return true;
    },
    ignoreMutation: () => true,
    destroy() {
      stopRefreshing();
      unsubscribeIdentity();
      if (interval !== null) window.clearInterval(interval);
    },
  };
}

/** Shift+F9 and Option+F9 answer at once; everything else waits for the edit. */
function showsFieldCodesAsked(transaction: Transaction): boolean {
  return transaction.getMeta(documentFieldCodesKey) !== undefined;
}

function DocumentFieldView({ editor, node, getPos }: NodeViewProps) {
  const options = editor.extensionManager.extensions.find(
    (extension) => extension.name === "documentFields",
  )?.options as DocumentFieldExtensionOptions | undefined;

  const derive = useCallback(() => {
    const rawPos = typeof getPos === "function" ? getPos() : null;
    return documentFieldViewText(
      editor.state.doc,
      typeof rawPos === "number" ? rawPos : null,
      node.attrs,
      { ...liveFieldIdentity(editor), ...(options?.getContext?.() ?? {}) },
    );
  }, [editor, getPos, node.attrs, options]);
  const [display, setDisplay] = useState(derive);
  const [codeShown, setCodeShown] = useState(false);
  // Whether the editor takes edits, read again as it changes: a page opens
  
  // node, and a form field left drawn as its plain result never offered its
  
  const [editable, setEditable] = useState(() => editor.isEditable);

  useEffect(() => {
    const refresh = () => {
      const rawPos = typeof getPos === "function" ? getPos() : null;
      setCodeShown(documentFieldCodeShown(editor.state, typeof rawPos === "number" ? rawPos : null));
      setDisplay(derive());
      setEditable(editor.isEditable);
    };
    refresh();
    const stopRefreshing = refreshWhenEditPauses(editor, "document-fields", refresh, showsFieldCodesAsked);
    // setEditable dispatches no transaction (NoteEditor asks for no update
    // event either): the view's contenteditable is what changes.
    const dom = editor.view?.dom;
    const editableObserver = dom instanceof HTMLElement && typeof MutationObserver !== "undefined"
      ? new MutationObserver(() => setEditable(editor.isEditable))
      : null;
    if (editableObserver && dom) editableObserver.observe(dom, { attributes: true, attributeFilter: ["contenteditable"] });
    const unsubscribeIdentity = subscribeDocumentFieldIdentity(editor, refresh);
    // DATE/TIME remain live even while the document is otherwise idle.
    const fieldType = normalizeDocumentFieldType(node.attrs.fieldType);
    const interval =
      fieldType === "DATE" || fieldType === "TIME"
        ? window.setInterval(refresh, 30_000)
        : null;
    return () => {
      stopRefreshing();
      editableObserver?.disconnect();
      unsubscribeIdentity();
      if (interval !== null) window.clearInterval(interval);
    };
  }, [derive, editor, getPos, node.attrs.fieldType]);

  const attrs = normalizeDocumentFieldAttrs(node.attrs);
  const formKind = legacyFormFieldKind(node.attrs);
  const fillable =
    formKind !== null &&
    !codeShown &&
    editable &&
    isDocumentFormsProtected(editor.state.doc.attrs?.documentProtection) &&
    legacyFormFieldEnabled(node.attrs);
  return (
    <NodeViewWrapper
      as="span"
      className="mrnote-document-field"
      data-type="document-field"
      data-field-type={attrs?.fieldType ?? ""}
      data-field-instruction={attrs?.instruction ?? ""}
      data-field-options={JSON.stringify(attrs?.options ?? {})}
      data-field-format={attrs?.format ?? ""}
      data-field-update-policy={attrs?.updatePolicy ?? "on-open"}
      data-field-cached-value={attrs?.cachedValue ?? ""}
      data-field-code-shown={codeShown ? "true" : undefined}
      data-testid="document-field"
      // A kept Word field shows Word's result; its code is the hover text.
      title={attrs?.fieldType === "NATIVE" ? attrs.instruction.trim() : undefined}
      contentEditable={false}
    >
      {codeShown ? (
        documentFieldCodeText(node.attrs)
      ) : attrs?.fieldType === "INDEX" || attrs?.fieldType === "TOA" ? (
        <ReferenceListFieldResult
          editor={editor}
          fieldType={attrs.fieldType}
          options={attrs.options}
        />
      ) : fillable && formKind ? (
        <LegacyFormFieldFill editor={editor} node={node} getPos={getPos} kind={formKind} display={display} />
      ) : (
        display
      )}
    </NodeViewWrapper>
  );
}








function LegacyFormFieldFill({
  editor,
  node,
  getPos,
  kind,
  display,
}: Pick<NodeViewProps, "editor" | "node" | "getPos"> & { kind: LegacyFormFieldKind; display: string }) {
  const [typing, setTyping] = useState(false);
  const commit = (next: Record<string, unknown>) => {
    const position = typeof getPos === "function" ? getPos() : null;
    if (typeof position !== "number" || editor.state.doc.nodeAt(position) !== node) return;
    editor.view.dispatch(editor.state.tr.setNodeMarkup(position, undefined, next));
  };
  const shade = { background: "var(--mrnote-form-field-shade, rgba(128, 128, 128, 0.18))", cursor: "pointer" } as const;
  const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();
  if (kind === "checkBox") {
    const checked = legacyCheckBoxChecked(node.attrs);
    return (
      <span
        role="checkbox"
        aria-checked={checked}
        data-testid="document-form-checkbox"
        style={shade}
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          commit(withLegacyCheckBox(node.attrs, !checked));
        }}
      >
        {display}
      </span>
    );
  }
  if (kind === "dropDown") {
    const entries = legacyDropdownEntries(node.attrs);
    return (
      <select
        data-testid="document-form-dropdown"
        value={String(legacyDropdownIndex(node.attrs))}
        style={{ ...shade, font: "inherit", color: "inherit", border: "none" }}
        onMouseDown={stop}
        onChange={(event) => commit(withLegacyDropdown(node.attrs, Number(event.target.value)))}
      >
        {entries.map((entry, index) => (
          <option key={index} value={String(index)}>
            {entry}
          </option>
        ))}
      </select>
    );
  }
  if (typing) {
    const maxLength = legacyTextMaxLength(node.attrs);
    const words = typeof node.attrs.cachedValue === "string" ? node.attrs.cachedValue : "";
    const keep = (value: string) => {
      setTyping(false);
      if (value !== words) commit(withLegacyText(node.attrs, value));
    };
    return (
      <input
        data-testid="document-form-text-input"
        autoFocus
        defaultValue={words}
        maxLength={maxLength ?? undefined}
        size={Math.max(4, words.length + 1)}
        style={{ font: "inherit", color: "inherit", border: "none", ...shade, cursor: "text" }}
        onMouseDown={stop}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter") keep(event.currentTarget.value);
          else if (event.key === "Escape") setTyping(false);
        }}
        onBlur={(event) => keep(event.currentTarget.value)}
      />
    );
  }
  return (
    <span
      data-testid="document-form-text"
      style={{ ...shade, cursor: "text" }}
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setTyping(true);
      }}
    >
      {display || "\u2003\u2003\u2003"}
    </span>
  );
}

const DocumentField = Node.create<DocumentFieldExtensionOptions>({
  name: DOCUMENT_FIELD_NODE_NAME,
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return { getContext: undefined };
  },

  addAttributes() {
    return {
      fieldType: {
        default: "DATE" as DocumentFieldType,
        parseHTML: (element: HTMLElement) =>
          normalizeDocumentFieldType(element.getAttribute("data-field-type")) ??
          "DATE",
        renderHTML: (attrs: Record<string, unknown>) => ({
          "data-field-type":
            normalizeDocumentFieldType(attrs.fieldType) ?? "DATE",
        }),
      },
      instruction: {
        default: ' DATE \\@ "M/d/yyyy" ',
        parseHTML: (element: HTMLElement) => {
          const type =
            normalizeDocumentFieldType(
              element.getAttribute("data-field-type"),
            ) ?? "DATE";
          if (type === "NATIVE") {
            return element.getAttribute("data-field-instruction") ?? "";
          }
          const format = normalizeDocumentFieldFormat(
            type,
            element.getAttribute("data-field-format"),
          );
          return normalizeDocumentFieldInstruction(
            type,
            element.getAttribute("data-field-instruction"),
            format,
            fieldOptionsFromElement(element),
          );
        },
        renderHTML: (attrs: Record<string, unknown>) => {
          const type = normalizeDocumentFieldType(attrs.fieldType) ?? "DATE";
          const format = normalizeDocumentFieldFormat(type, attrs.format);
          if (type === "NATIVE") {
            return {
              "data-field-instruction":
                typeof attrs.instruction === "string" ? attrs.instruction : "",
            };
          }
          return {
            "data-field-instruction": normalizeDocumentFieldInstruction(
              type,
              attrs.instruction,
              format,
              normalizeDocumentFieldOptions(attrs.options),
            ),
          };
        },
      },
      options: {
        default: {} as Record<string, string | number | boolean>,
        parseHTML: fieldOptionsFromElement,
        renderHTML: (attrs: Record<string, unknown>) => ({
          "data-field-options": JSON.stringify(
            normalizeDocumentFieldOptions(attrs.options),
          ),
        }),
      },
      format: {
        default: "M/d/yyyy",
        parseHTML: (element: HTMLElement) => {
          const type =
            normalizeDocumentFieldType(
              element.getAttribute("data-field-type"),
            ) ?? "DATE";
          return normalizeDocumentFieldFormat(
            type,
            element.getAttribute("data-field-format"),
          );
        },
        renderHTML: (attrs: Record<string, unknown>) => {
          const type = normalizeDocumentFieldType(attrs.fieldType) ?? "DATE";
          return {
            "data-field-format": normalizeDocumentFieldFormat(
              type,
              attrs.format,
            ),
          };
        },
      },
      updatePolicy: {
        default: "on-open",
        parseHTML: (element: HTMLElement) =>
          normalizeDocumentFieldUpdatePolicy(
            element.getAttribute("data-field-update-policy"),
          ),
        renderHTML: (attrs: Record<string, unknown>) => ({
          "data-field-update-policy": normalizeDocumentFieldUpdatePolicy(
            attrs.updatePolicy,
          ),
        }),
      },
      cachedValue: {
        default: "",
        parseHTML: (element: HTMLElement) =>
          sanitizeDocumentFieldCachedValue(
            element.getAttribute("data-field-cached-value"),
          ),
        renderHTML: (attrs: Record<string, unknown>) => ({
          "data-field-cached-value": sanitizeDocumentFieldCachedValue(
            attrs.cachedValue,
          ),
        }),
      },
      // Word's `w:fldLock` (OFL-034): kept from the file, shown as the cached
      // result, written back as the lock.
      locked: {
        default: false,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-field-locked") === "true",
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.locked === true ? { "data-field-locked": "true" } : {},
      },
      // A NATIVE field's code, flags and result runs, exactly as Word stored
      // them (document_docx_preserved_fields.py on the server, which checks
      // and writes it). Opaque here: carried, never edited.
      preservedField: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const raw = element.getAttribute("data-preserved-field");
          if (!raw) return null;
          try {
            const value: unknown = JSON.parse(raw);
            return value && typeof value === "object" && !Array.isArray(value) ? value : null;
          } catch {
            return null;
          }
        },
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.preservedField && typeof attrs.preservedField === "object"
            ? { "data-preserved-field": JSON.stringify(attrs.preservedField) }
            : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="document-field"]', priority: 100 }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-type": "document-field",
        class: "mrnote-document-field",
      }),
      resolveDocumentFieldDisplay(node.attrs),
    ];
  },

  renderText({ node }) {
    return resolveDocumentFieldDisplay(node.attrs);
  },

  addNodeView() {
    const interactive = reactNodeViewWithLivePosition(DocumentFieldView);
    const options = this.options;
    return (props) =>
      fieldDrawsControls(props.node.attrs)
        ? interactive(props)
        : createPlainFieldView(props.editor, props.node, props.getPos, options);
  },

  addProseMirrorPlugins() {
    // An unmarked field result takes its paragraph style's run formatting.
    return [createDocumentFieldStyleRunPlugin(), createDocumentFieldCodesPlugin()];
  },
});

/** Registers the atom and its insertion command as one additive feature. */
export const DocumentFields = Extension.create<DocumentFieldExtensionOptions>({
  name: "documentFields",

  addOptions() {
    return { getContext: undefined };
  },

  addExtensions() {
    return [DocumentField.configure({ getContext: this.options.getContext })];
  },

  addCommands() {
    return {
      insertDocumentField:
        (fieldType: DocumentFieldType, options = {}) =>
        ({ editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const nodeType = state.schema.nodes[DOCUMENT_FIELD_NODE_NAME];
          if (!nodeType) return false;
          const attrs = createDocumentFieldAttrs(fieldType, options);
          if (!attrs) return false;
          if (dispatch) {
            // The field wears the character formatting of its place, as the
            // text it stands for would (an auto-updating date in 24pt bold
            
            const $from = state.selection.$from;
            const paragraphType = state.schema.nodes.paragraph;
            const ownParagraph =
              (fieldType === "INDEX" || fieldType === "TOA") &&
              $from.depth > 0 &&
              $from.parent.isTextblock &&
              $from.parent.content.size > 0 &&
              paragraphType &&
              $from
                .node($from.depth - 1)
                .canReplaceWith(
                  $from.indexAfter($from.depth - 1),
                  $from.indexAfter($from.depth - 1),
                  paragraphType,
                );
            if (ownParagraph) {
              // Word builds an index in paragraphs of its own (a section of
              // its own, in fact); it never runs on from the words of the
              // paragraph the insertion point was in.
              const at = $from.after($from.depth);
              tr.insert(at, paragraphType.create(null, nodeType.create(attrs)));
              tr.setSelection(NodeSelection.create(tr.doc, at + 1));
              dispatch(tr.scrollIntoView());
              return true;
            }
            replaceSelectionWithField(tr, nodeType.create(attrs));
            withInsertedSeqResult(tr, tr.selection.from - 1, this.options.getContext?.());
            dispatch(tr);
          }
          return true;
        },
      insertDocumentFieldAttrs:
        (attrs, replaceAt) =>
        ({ editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const nodeType = state.schema.nodes[DOCUMENT_FIELD_NODE_NAME];
          if (!nodeType) return false;
          const node = nodeType.create(attrs);
          if (typeof replaceAt === "number") {
            const current = state.doc.nodeAt(replaceAt);
            if (current?.type !== nodeType) return false;
            // An edited field keeps the character formatting it wore.
            if (dispatch) dispatch(tr.replaceWith(replaceAt, replaceAt + current.nodeSize, node.mark(current.marks)));
            return true;
          }
          if (dispatch) {
            replaceSelectionWithField(tr, node);
            withInsertedSeqResult(tr, tr.selection.from - 1, this.options.getContext?.());
            dispatch(tr);
          }
          return true;
        },
      toggleDocumentFieldCodes:
        (scope) =>
        ({ state, tr, dispatch }) => {
          if (scope === "all") {
            if (dispatch) dispatch(toggleDocumentFieldCodesMeta(tr, "all"));
            return true;
          }
          const fields = selectedDocumentFields(state);
          if (fields.length === 0) return false;
          if (dispatch) dispatch(toggleDocumentFieldCodesMeta(tr, fields.map((field) => field.pos)));
          return true;
        },
      updateDocumentFields:
        () =>
        ({ editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const fields = selectedDocumentFields(state);
          if (fields.length === 0) return false;
          const context = { ...liveFieldIdentity(editor), ...(this.options.getContext?.() ?? {}) };
          let changed = false;
          for (const { pos, node } of fields) {
            const attrs = node.attrs as Record<string, unknown>;
            if (attrs.locked === true) continue;
            if (attrs.fieldType === "NATIVE") {
              // Word computes its own fields; the ones the editor can compute
              // take that result now, and every one asks Word to update.
              if (!nativeFieldIsPlain(attrs)) continue;
              const code = String(attrs.instruction ?? "");
              const result = computeNativeFieldResult(code, { ...context, doc: state.doc });
              const preserved = attrs.preservedField as { code: unknown; result: unknown };
              const next = {
                ...attrs,
                updatePolicy: "on-open",
                ...(result
                  ? {
                      cachedValue: result.replace(/[\x00-\x1f\x7f-\x9f]/g, "").trim().slice(0, 256).trim(),
                      preservedField: { ...preserved, result: [{ text: result }] },
                    }
                  : {}),
              };
              tr.setNodeMarkup(pos, undefined, next);
              changed = true;
              continue;
            }
            if (attrs.fieldType === "INDEX" || attrs.fieldType === "TOA") continue;
            const shown = documentFieldViewText(state.doc, pos, attrs, context);
            const cachedValue = sanitizeDocumentFieldCachedValue(shown);
            if (cachedValue === attrs.cachedValue) continue;
            tr.setNodeMarkup(pos, undefined, { ...attrs, cachedValue });
            changed = true;
          }
          if (dispatch && changed) dispatch(tr);
          return true;
        },
      setDocumentFieldsLocked:
        (locked) =>
        ({ editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const fields = selectedDocumentFields(state);
          if (fields.length === 0) return false;
          const context = { ...liveFieldIdentity(editor), ...(this.options.getContext?.() ?? {}) };
          for (const { pos, node } of fields) {
            const attrs = node.attrs as Record<string, unknown>;
            if ((attrs.locked === true) === locked) continue;
            // A locked field keeps the result it shows at the moment it is
            // locked, as Word's does.
            const freeze =
              locked && attrs.fieldType !== "NATIVE" && attrs.fieldType !== "INDEX" && attrs.fieldType !== "TOA"
                ? { cachedValue: sanitizeDocumentFieldCachedValue(documentFieldViewText(state.doc, pos, attrs, context)) }
                : {};
            tr.setNodeMarkup(pos, undefined, { ...attrs, ...freeze, locked });
          }
          if (dispatch) dispatch(tr);
          return true;
        },
      unlinkDocumentFields:
        () =>
        ({ editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const fields = selectedDocumentFields(state).filter(
            ({ node }) => node.attrs.fieldType !== "INDEX" && node.attrs.fieldType !== "TOA",
          );
          if (fields.length === 0) return false;
          const context = { ...liveFieldIdentity(editor), ...(this.options.getContext?.() ?? {}) };
          // Last first, so the earlier positions stay where they were.
          for (const { pos, node } of [...fields].sort((a, b) => b.pos - a.pos)) {
            const text = documentFieldViewText(state.doc, pos, node.attrs, context);
            if (text) tr.replaceWith(pos, pos + node.nodeSize, state.schema.text(text, node.marks));
            else tr.delete(pos, pos + node.nodeSize);
          }
          if (dispatch) dispatch(tr);
          return true;
        },
    };
  },
});

export default DocumentFields;
