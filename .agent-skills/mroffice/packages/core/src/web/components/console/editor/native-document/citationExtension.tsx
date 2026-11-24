"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Extension, Node, mergeAttributes } from "@tiptap/core";
import { DOMSerializer, type Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import type { EditorView, NodeView } from "@tiptap/pm/view";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import { reactNodeViewWithLivePosition } from "../extensions/reactNodeViewPosition";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "../../../../../host/next-intl";
import {
  CITATION_MARK_NAME,
  buildBibliography,
  findSource,
  formatInText,
  normalizeSources,
  normalizeSourceStore,
  normalizeCitationSegments,
  removeSource,
  resolveCitationStyle,
  sanitizeCslField,
  sanitizeLocator,
  sanitizeSourceId,
  sourceStoreIsEditable,
  upsertSource as upsertInStore,
  type BibliographyEntry,
  type CitationStyle,
  type CslSource,
  type CitationSegment,
  type CitationSourceStoreEnvelope,
} from "./citations";
import { trustReadOnlyDocumentMutation } from "./readOnlyTransactionAuthority";
import { imeSafeAppendTransaction } from "./imeCompositionGuard";
import {
  PAGE_ROW_ATTR,
  PAGE_ROW_SLICE_ATTR,
  rowSliceStamp,
  rowSliceView,
} from "./paged/atomRowSlices";
import { updateRowSlicedNodeView } from "./paged/rowSliceNodeView";
import { refreshWhenEditPauses } from "./editPausedViews";

/**
 * Document CITATIONS / BIBLIOGRAPHY (Word/WPS parity) — TipTap wiring.
 *
 * ADDITIVE: registering this extension adds:
 *   - ONE inline ATOM node ("citation") — an in-text marker dropped at the caret,
 *     carrying a sanitized `sourceId` (+ optional locator/prefix). It renders the
 *     live formatted in-text citation in the active style, NOT stored text.
 *   - ONE block node ("bibliography") — an atom whose NodeView renders the
 *     formatted, sorted reference list (only the CITED sources), like the TOC node
 *     derives from headings. A document carries at most one.
 *   - ONE optional top-level doc attribute ("sources") holding the CSL-JSON-like
 *     source store, plus ("citationStyle") = "apa" | "ieee".
 *
 * The node + attribute round-trip through the document schema's open
 * `content`/`attrs` passthrough (see lib/native-page-schemas → documentNodeSchema
 * accepts any node type; documentDocAttrsSchema bounds the optional store), so
 * EXISTING documents — which carry none of these — still validate and load
 * unchanged. There is no flag: the feature is purely opt-in per user action
 * (Insert citation); a document with no citations behaves exactly as before.
 *
 * SECURITY: the citation node renders ONLY a sanitized `data-source-id` attribute
 * + fixed class (no user text in the DOM attribute surface; the in-text label is
 * derived from the sanitized store). Every source field is held on the doc
 * attribute and always rendered as TEXT, never HTML. All values pass through the
 * sanitizers in ./citations on every edge.
 */

/** The block node name for the rendered reference list. */
export const BIBLIOGRAPHY_NODE_NAME = "bibliography";
/** The doc-level attribute key holding the source store. */
export const SOURCES_ATTR = "sources";
/** The doc-level attribute key holding the active citation style. */
export const CITATION_STYLE_ATTR = "citationStyle";

/**
 * Window CustomEvent the toolbar's Insert-citation button dispatches. NoteEditor
 * listens for it to open the source picker (decoupling the thin toolbar trigger
 * from the picker UI). Mirrors ADD_COMMENT_EVENT / INSERT_FOOTNOTE_EVENT.
 */
export const INSERT_CITATION_EVENT = "mrnote:insert-citation";
/** Open the document source library without inserting a citation. */
export const OPEN_CITATION_SOURCE_MANAGER_EVENT =
  "mrnote:open-citation-source-manager";
export interface OpenCitationPickerDetail {
  opener?: HTMLElement | null;
}

interface NativeCitationFieldAuthority {
  version: 1;
  instruction: string;
  cachedValue: string;
  updatePolicy: "on-open" | "manual";
  locked: boolean;
  /** True only after an editor command changes this field's semantics. */
  edited: boolean;
  /** Oversized native fields remain visible/exportable, but are not editable. */
  preserveOnlyReason?: "native_field_authority_too_large";
}

const MAX_PRESERVED_NATIVE_FIELD_CHARS = 1_000_000;

function normalizeNativeFieldAuthority(
  value: unknown,
): NativeCitationFieldAuthority | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    record.version !== 1 ||
    typeof record.instruction !== "string" ||
    record.instruction.length > MAX_PRESERVED_NATIVE_FIELD_CHARS ||
    typeof record.cachedValue !== "string" ||
    record.cachedValue.length > MAX_PRESERVED_NATIVE_FIELD_CHARS ||
    (record.updatePolicy !== "on-open" && record.updatePolicy !== "manual") ||
    typeof record.locked !== "boolean" ||
    (record.edited !== undefined && typeof record.edited !== "boolean") ||
    (record.preserveOnlyReason !== undefined &&
      record.preserveOnlyReason !== "native_field_authority_too_large")
  ) {
    return null;
  }
  return {
    version: 1,
    instruction: record.instruction,
    cachedValue: record.cachedValue,
    updatePolicy: record.updatePolicy,
    locked: record.locked,
    edited: record.edited === true,
    ...(record.preserveOnlyReason
      ? { preserveOnlyReason: record.preserveOnlyReason }
      : {}),
  };
}

function nativeCitationEditIsBlocked(
  doc: ProseMirrorNode,
  affectedSourceIds?: ReadonlySet<string>,
): boolean {
  let blocked = false;
  doc.descendants((node) => {
    const isBibliography = node.type.name === BIBLIOGRAPHY_NODE_NAME;
    const segments =
      node.type.name === CITATION_MARK_NAME
        ? normalizeCitationSegments(node.attrs?.segments, node.attrs?.sourceId)
        : [];
    const isAffectedCitation =
      segments.length > 0 &&
      (!affectedSourceIds ||
        segments.some((segment) => affectedSourceIds.has(segment.sourceId)));
    if (!isBibliography && !isAffectedCitation) return true;
    if (
      normalizeNativeFieldAuthority(node.attrs?.nativeFieldAuthority)
        ?.preserveOnlyReason
    ) {
      blocked = true;
      return false;
    }
    return true;
  });
  return blocked;
}

function dirtyNativeCitationFields(
  tr: import("@tiptap/pm/state").Transaction,
  doc: ProseMirrorNode,
  affectedSourceIds?: ReadonlySet<string>,
): void {
  doc.descendants((node, pos) => {
    const isBibliography = node.type.name === BIBLIOGRAPHY_NODE_NAME;
    const segments =
      node.type.name === CITATION_MARK_NAME
        ? normalizeCitationSegments(node.attrs?.segments, node.attrs?.sourceId)
        : [];
    const isAffectedCitation =
      segments.length > 0 &&
      (!affectedSourceIds ||
        segments.some((segment) => affectedSourceIds.has(segment.sourceId)));
    if (!isBibliography && !isAffectedCitation) return true;
    const authority = normalizeNativeFieldAuthority(
      node.attrs?.nativeFieldAuthority,
    );
    if (!authority || authority.preserveOnlyReason) return true;
    if (authority.updatePolicy === "on-open" && authority.edited) return true;
    tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      nativeFieldAuthority: {
        ...authority,
        updatePolicy: "on-open",
        edited: true,
      },
    });
    return true;
  });
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    documentCitations: {
      /**
       * Insert a citation to an EXISTING source at the caret: drop a citation atom
       * node carrying the (sanitized) source id + optional locator/prefix. No-op
       * when the source id is unusable. Ensures a single bibliography node exists
       * at the document end. Does NOT add the source (use upsertSource first / use
       * addCitationWithSource for a one-shot).
       */
      addCitation: (
        sourceId: string,
        locator?: { locator?: string; prefix?: string },
      ) => ReturnType;
      /**
       * Add/replace a source in the store AND insert a citation to it at the caret
       * in one step. The candidate is normalized; a no-op when it is unusable.
       */
      addCitationWithSource: (
        source: unknown,
        locator?: { locator?: string; prefix?: string },
      ) => ReturnType;
      /** Add or replace a source in the store (keyed by id). No node inserted. */
      upsertSource: (source: unknown) => ReturnType;
      /**
       * Delete an uncited source. A source referenced by any live citation is
       * protected and returns false, so source management can never silently
       * destroy authored citation fields.
       */
      removeSource: (sourceId: string) => ReturnType;
      /** Switch the active citation style (apa | ieee). Re-renders everything. */
      setCitationStyle: (style: CitationStyle) => ReturnType;
      /**
       * Re-apply the source store + style onto the top-level doc attrs from a value
       * read out of persisted content. setContent restores only the doc's CHILDREN
       * (incl. the citation nodes + the bibliography node) and DISCARDS the doc
       * node's own attrs, so the store must be re-attached on load. Mirrors
       * restoreCommentThreads. Always returns true.
       */
      restoreSources: (sources: unknown, style?: unknown) => ReturnType;
    };
  }
}

/** Read + normalize the source store off a doc node's attrs. Never throws. */
export function readSources(doc: ProseMirrorNode): CslSource[] {
  const attrs = (doc.attrs ?? {}) as Record<string, unknown>;
  const stored = attrs[SOURCES_ATTR];
  if (!stored || typeof stored !== "object") return normalizeSources(stored);
  // Every citation asks; the store stays the same object across edits of the text.
  const known = sourcesByStore.get(stored);
  if (known) return [...known];
  const sources = normalizeSources(stored);
  sourcesByStore.set(stored, sources);
  return [...sources];
}

const sourcesByStore = new WeakMap<object, readonly CslSource[]>();

export function readSourceStore(
  doc: ProseMirrorNode,
): CitationSourceStoreEnvelope {
  const attrs = (doc.attrs ?? {}) as Record<string, unknown>;
  return normalizeSourceStore(attrs[SOURCES_ATTR]);
}

/** Convenience reader off an EditorState. */
export function getSources(state: EditorState): CslSource[] {
  return readSources(state.doc);
}

/** The resolved citation style for a doc (default "apa"). */
export function getCitationStyle(state: EditorState): CitationStyle {
  const attrs = (state.doc.attrs ?? {}) as Record<string, unknown>;
  return resolveCitationStyle(attrs[CITATION_STYLE_ATTR]);
}

/**
 * Collect the source ids of every citation node in the order they FIRST appear in
 * the document body. This is the source of truth for IEEE numbering + the
 * bibliography order. Duplicate ids keep their first position.
 */
export function collectCitationOrder(doc: ProseMirrorNode): string[] {
  const known = citationOrderByDoc.get(doc);
  if (known) return [...known];
  const order = readCitationOrder(doc);
  citationOrderByDoc.set(doc, order);
  return [...order];
}

/** One walk per document version: every citation of the document asks for its
 * number on each update. */
const citationOrderByDoc = new WeakMap<ProseMirrorNode, readonly string[]>();

function readCitationOrder(doc: ProseMirrorNode): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  doc.descendants((node) => {
    if (node.type.name === CITATION_MARK_NAME) {
      const segments = normalizeCitationSegments(
        node.attrs?.segments,
        node.attrs?.sourceId,
      );
      for (const segment of segments) {
        if (!seen.has(segment.sourceId)) {
          seen.add(segment.sourceId);
          ids.push(segment.sourceId);
        }
      }
    }
    return true;
  });
  return ids;
}

/** Does the doc carry any citation? */
export function hasCitations(state: EditorState): boolean {
  return (
    readSources(state.doc).length > 0 ||
    collectCitationOrder(state.doc).length > 0
  );
}

/** Whether the doc already contains the single live bibliography node. */
const bibliographyPresence = new WeakMap<ProseMirrorNode, boolean>();

/** Whether `doc` holds a bibliography; kept per document (the toolbar asks
 * on every render, a selection change too). */
export function hasBibliographyNode(doc: ProseMirrorNode): boolean {
  const known = bibliographyPresence.get(doc);
  if (known !== undefined) return known;
  const present = findBibliographyNode(doc);
  bibliographyPresence.set(doc, present);
  return present;
}

function findBibliographyNode(doc: ProseMirrorNode): boolean {
  let present = false;
  doc.descendants((node) => {
    if (node.type.name === BIBLIOGRAPHY_NODE_NAME) {
      present = true;
      return false;
    }
    return true;
  });
  return present;
}

// ---------------------------------------------------------------------------
// Node views.
// ---------------------------------------------------------------------------







export function citationDisplayText(
  doc: ProseMirrorNode,
  node: ProseMirrorNode,
  missing: string,
): string {
  const segments = normalizeCitationSegments(
    node.attrs?.segments,
    node.attrs?.sourceId,
  );
  const authority = normalizeNativeFieldAuthority(
    node.attrs?.nativeFieldAuthority,
  );
  if (authority && !authority.edited) {
    return authority.cachedValue || missing;
  }
  if (!sourceStoreIsEditable(readSourceStore(doc))) {
    return authority?.cachedValue || missing;
  }
  if (!segments.length) return missing;
  const sources = readSources(doc);
  const order = collectCitationOrder(doc);
  const style = resolveCitationStyle(
    ((doc.attrs ?? {}) as Record<string, unknown>)[CITATION_STYLE_ATTR],
  );
  const labels = segments.map((segment) => {
    const source = findSource(sources, segment.sourceId);
    if (!source) return missing;
    const label = formatInText(
      style,
      source,
      order,
      { locator: segment.locator, prefix: segment.prefix },
      sources,
    );
    return `${label}${segment.suffix}`;
  });
  return labels.join("; ");
}

/** `window.__docsCitationTextOff = true` (A/B, read as a citation's view is
 * made): its text is drawn in a <button> again, the older view. */
function citationTextOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsCitationTextOff?: boolean }).__docsCitationTextOff === true;
}

/**
 * The in-text citation marker. Paints the LIVE formatted in-text citation for its
 * source in the active style (APA "(Doe, 2021)" / IEEE "[1]"), recomputed from the
 * store + citation order once an edit pauses, so a style switch or a renumber
 * updates automatically. The label is derived from the SANITIZED store (never raw
 * attrs). No React root: a thesis holds hundreds of these, mounted again at every
 * page cut and each answering every selection change on its own frame.
 */
function createCitationView(
  editor: NodeViewProps["editor"],
  initial: ProseMirrorNode,
  missing: string,
): NodeView {
  let node = initial;
  const dom = document.createElement("span");
  dom.className = "mrnote-citation";
  dom.setAttribute("data-type", "citation");
  dom.setAttribute("data-testid", "citation");
  dom.style.whiteSpace = "normal";
  // Drawn as text of its line, as Word's CITATION field result is runs of its
  // paragraph: "(Doe, 2021)" breaks at its space and goes with the "." after
  // it. A <button> is an atomic inline: never broken inside, and broken
  // before and after by the browser and the line engine (as the note
  // reference was, footnoteExtension). Still a button to the keyboard.
  const asButton = citationTextOff();
  const marker = document.createElement(asButton ? "button" : "span");
  if (marker instanceof HTMLButtonElement) marker.type = "button";
  else {
    marker.setAttribute("role", "button");
    marker.tabIndex = 0;
  }
  marker.className = "mrnote-citation__marker";
  marker.contentEditable = "false";
  dom.append(marker);

  const sourceIdOf = () =>
    normalizeCitationSegments(node.attrs?.segments, node.attrs?.sourceId)[0]?.sourceId ?? null;
  const paint = () => {
    if (editor.isDestroyed) return;
    const text = citationDisplayText(editor.state.doc, node, missing);
    if (marker.textContent !== text) marker.textContent = text;
    const sourceId = sourceIdOf();
    if (sourceId) {
      dom.setAttribute("data-source-id", sourceId);
      marker.setAttribute("data-citation-source-id", sourceId);
    } else {
      dom.removeAttribute("data-source-id");
      marker.removeAttribute("data-citation-source-id");
    }
  };
  paint();
  const stopRefreshing = refreshWhenEditPauses(editor, "citations", paint);

  const jump = () => {
    const sourceId = sourceIdOf();
    if (!sourceId) return;
    const target = editor.view.dom.querySelector(
      `[data-bibliography-entry="${sourceId}"]`,
    ) as HTMLElement | null;
    target?.scrollIntoView({ block: "center", behavior: "smooth" });
  };
  marker.addEventListener("click", jump);
  if (!asButton) {
    marker.addEventListener("keydown", (event) => {
      const { key } = event as KeyboardEvent;
      if (key !== "Enter" && key !== " ") return;
      event.preventDefault();
      jump();
    });
  }

  return {
    dom,
    update(next) {
      if (next.type !== node.type) return false;
      node = next;
      paint();
      return true;
    },
    // The marker is a button of its own; the editor keeps drags and drops.
    stopEvent: (event) => event.target === marker && event.type !== "dragstart" && event.type !== "drop",
    ignoreMutation: () => true,
    destroy: stopRefreshing,
  };
}

/** Compact, order-sensitive signature for cheap bibliography equality. */
function bibSignature(style: CitationStyle, entries: BibliographyEntry[]): string {
  return `${style}\n${entries
    .map((e) => `${e.label ?? "-"}|${e.id}|${e.text}`)
    .join("\n")}`;
}

/**
 * The rendered reference list. Derives its entries from the source store + the
 * citation document order (buildBibliography), live-updating on every edit (APA
 * sorted alphabetically; IEEE numbered in citation order). Only CITED sources
 * appear. Read-only text (entries are edited via the source picker, not inline).
 * Mirrors TableOfContentsView.
 */
function BibliographyView(props: NodeViewProps) {
  const t = useTranslations("console-notebooks");
  const { editor, node } = props;

  const derive = useCallback((): {
    style: CitationStyle;
    entries: BibliographyEntry[];
    hasSources: boolean;
  } => {
    const style = getCitationStyle(editor.state);
    const hasSources = readSources(editor.state.doc).length > 0;
    const authority = normalizeNativeFieldAuthority(
      node.attrs?.nativeFieldAuthority,
    );
    if (authority && !authority.edited) {
      return {
        style,
        hasSources,
        entries: authority.cachedValue
          ? [
              {
                id: "native-bibliography",
                number: null,
                label: null,
                text: authority.cachedValue,
              },
            ]
          : [],
      };
    }
    if (!sourceStoreIsEditable(readSourceStore(editor.state.doc))) {
      return {
        style,
        hasSources,
        entries: authority?.cachedValue
          ? [
              {
                id: "native-bibliography",
                number: null,
                label: null,
                text: authority.cachedValue,
              },
            ]
          : [],
      };
    }
    return {
      style,
      hasSources,
      entries: buildBibliography(
        style,
        readSources(editor.state.doc),
        collectCitationOrder(editor.state.doc),
      ),
    };
  }, [editor, node]);

  const [state, setState] = useState(derive);

  useEffect(() => {
    const refresh = () => {
      const next = derive();
      setState((prev) =>
        prev.hasSources === next.hasSources &&
        bibSignature(prev.style, prev.entries) ===
          bibSignature(next.style, next.entries)
          ? prev
          : next,
      );
    };
    refresh();
    return refreshWhenEditPauses(editor, "bibliography", refresh);
  }, [editor, derive]);

  // A reference list longer than its page flows on, source by source, as
  // the paragraphs of Word's BIBLIOGRAPHY field result do: the page ledger
  // repeats this node on every page the list reaches and gives each copy
  // its rows (atomRowSlices). Only the copy holding the first source draws
  // the list's header.
  const slice = rowSliceView(state.entries, node.attrs);
  const opensList = slice.position === "whole" || slice.position === "head";

  return (
    <NodeViewWrapper
      className="mrnote-bibliography"
      data-testid="bibliography"
      data-style={state.style}
      contentEditable={false}
      {...{ [PAGE_ROW_SLICE_ATTR]: rowSliceStamp(slice.position) }}
    >
      {opensList ? (
        <div className="mrnote-bibliography__header" contentEditable={false}>
          <span className="mrnote-bibliography__title">
            {t("citations.bibliographyTitle")}
          </span>
        </div>
      ) : null}
      {state.entries.length === 0 ? (
        opensList ? (
          <p
            className="mrnote-bibliography__empty"
            data-testid="bibliography-empty"
          >
            {state.hasSources
              ? t("citations.bibliographyEmpty")
              : t("citations.bibliographyNoSources")}
          </p>
        ) : null
      ) : (
        <ol
          className="mrnote-bibliography__items"
          data-testid="bibliography-items"
          // Numeric styles show their own marker (IEEE "[n]", ISO 690 "n.");
          // the others are a hanging-indent unnumbered list. We always render an ordered list but hide the marker for APA
          // via the data-style hook in CSS.
        >
          {slice.rows.map(({ row: entry, index }) => (
            <li
              key={entry.id}
              className="mrnote-bibliography__item"
              data-bibliography-entry={entry.id}
              data-testid="bibliography-item"
              {...{ [PAGE_ROW_ATTR]: index }}
            >
              {entry.label !== null && (
                <span className="mrnote-bibliography__number">
                  {entry.label}
                </span>
              )}
              <span className="mrnote-bibliography__text">
                {entry.runs
                  ? entry.runs.map((run, index) =>
                      run.italic ? (
                        <em key={index} className="mrnote-bibliography__italic">
                          {run.text}
                        </em>
                      ) : (
                        <span key={index}>{run.text}</span>
                      ),
                    )
                  : entry.text}
              </span>
            </li>
          ))}
        </ol>
      )}
    </NodeViewWrapper>
  );
}

// ---------------------------------------------------------------------------
// Nodes + store extension.
// ---------------------------------------------------------------------------

/**
 * The inline citation ATOM node. Carries a sanitized `sourceId` plus an optional
 * `locator` (page) and `prefix`. parse/render funnel the id through
 * sanitizeSourceId so a forged/imported value can never break out of the
 * `data-source-id` attribute. The in-text text is painted by the NodeView from the
 * sanitized store. Mirrors InlineMath (inline atom).
 */
const Citation = Node.create<{ missingSourceLabel: string }>({
  name: CITATION_MARK_NAME,
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      sourceId: {
        default: null as string | null,
        parseHTML: (element: HTMLElement) =>
          sanitizeSourceId(element.getAttribute("data-source-id")),
        renderHTML: (attrs: Record<string, unknown>) => {
          const id = sanitizeSourceId(attrs.sourceId);
          return id ? { "data-source-id": id } : {};
        },
      },
      locator: {
        default: "",
        parseHTML: (element: HTMLElement) =>
          sanitizeLocator(element.getAttribute("data-locator")),
        renderHTML: (attrs: Record<string, unknown>) => {
          const loc = sanitizeLocator(attrs.locator);
          return loc ? { "data-locator": loc } : {};
        },
      },
      prefix: {
        default: "",
        // Sanitize the optional APA prefix (e.g. "see") on both edges: strip
        // control bytes + clamp via the same scrub the formatter applies, so a
        // forged/imported value can never break out of the data-prefix attribute.
        parseHTML: (element: HTMLElement) =>
          sanitizeCslField(element.getAttribute("data-prefix")),
        renderHTML: (attrs: Record<string, unknown>) => {
          const prefix = sanitizeCslField(attrs.prefix);
          return prefix ? { "data-prefix": prefix } : {};
        },
      },
      segments: { default: null as CitationSegment[] | null, rendered: false },
      nativeFieldAuthority: {
        default: null as NativeCitationFieldAuthority | null,
        rendered: false,
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="citation"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const id = sanitizeSourceId(
      (HTMLAttributes as { "data-source-id"?: unknown })["data-source-id"],
    );
    const loc = sanitizeLocator(
      (HTMLAttributes as { "data-locator"?: unknown })["data-locator"],
    );
    // Static serialization: emit only sanitized id + locator + fixed class. The
    // live editor NodeView paints the formatted in-text citation.
    return [
      "span",
      mergeAttributes(
        {},
        id ? { "data-source-id": id } : {},
        loc ? { "data-locator": loc } : {},
        { "data-type": "citation", class: "mrnote-citation" },
      ),
    ];
  },

  addOptions() {
    return { missingSourceLabel: "?" };
  },

  addNodeView() {
    const missing = this.options.missingSourceLabel;
    return ({ editor, node }) => createCitationView(editor, node, missing);
  },
});

/**
 * The block bibliography atom node. Stores nothing — it derives its entries from
 * the source store + the citation document order at render time. A document
 * carries at most one.
 */
const Bibliography = Node.create({
  name: BIBLIOGRAPHY_NODE_NAME,
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      nativeFieldAuthority: {
        default: null as NativeCitationFieldAuthority | null,
        rendered: false,
      },
      source: { default: null as Record<string, unknown> | null, rendered: false },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="bibliography"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "bibliography" }),
    ];
  },

  addNodeView() {
    return reactNodeViewWithLivePosition(BibliographyView, {
      // A copy whose row range the page ledger changed draws its rows at
      // once: the ledger reads them in the same frame.
      update: updateRowSlicedNodeView,
    });
  },
});

/**
 * Doc-level attribute carrier for the source store + style. Registered as GLOBAL
 * attributes on the `doc` node so they persist on doc.attrs through getJSON, and
 * are re-attached on load via `restoreSources` (mirrors DocumentComments).
 */
const CitationStore = Extension.create({
  name: "documentCitationStore",

  addGlobalAttributes() {
    return [
      {
        types: ["doc"],
        attributes: {
          [SOURCES_ATTR]: {
            default: { version: 1, items: [] } as CitationSourceStoreEnvelope,
          },
          [CITATION_STYLE_ATTR]: { default: "apa" as CitationStyle },
        },
      },
    ];
  },
});

/** Insert one citation field. Bibliography remains an independent Word command. */
function insertCitationNode(
  state: EditorState,
  tr: import("@tiptap/pm/state").Transaction,
  sourceId: string,
  locator?: { locator?: string; prefix?: string },
): boolean {
  const citationType = state.schema.nodes[CITATION_MARK_NAME];
  if (!citationType) return false;
  const segment: CitationSegment = {
    sourceId,
    locale: "",
    volume: "",
    locator: sanitizeLocator(locator?.locator),
    prefix: sanitizeCslField(locator?.prefix),
    suffix: "",
    suppressAuthor: false,
    suppressTitle: false,
    suppressYear: false,
  };
  const node = citationType.create({
    sourceId,
    locator: segment.locator,
    prefix: segment.prefix,
    segments: [segment],
  });
  tr.replaceSelectionWith(node, false);
  return true;
}

/** The attribute of the hidden element a copy carries its citations' sources in. */
export const CITATION_CLIPBOARD_SOURCES_ATTR = "data-mrnote-citation-sources";

/** The source ids a fragment's citations name. */
function citedSourceIds(fragment: Fragment): Set<string> {
  const ids = new Set<string>();
  fragment.descendants((node) => {
    if (node.type.name !== CITATION_MARK_NAME) return true;
    for (const segment of normalizeCitationSegments(node.attrs?.segments, node.attrs?.sourceId)) {
      ids.add(segment.sourceId);
    }
    return false;
  });
  return ids;
}









function citationClipboardPlugin(): Plugin {
  let liveView: EditorView | null = null;
  let pendingSources: CslSource[] = [];
  // Plugin props are read once, when the plugin is made: the serializer is
  // a fixed object that reaches the live schema and store when it runs.
  class CitationClipboardSerializer extends DOMSerializer {
    serializeFragment(
      fragment: Fragment,
      options: { document?: Document } = {},
      target?: HTMLElement | DocumentFragment,
    ): HTMLElement | DocumentFragment {
      const base = liveView ? DOMSerializer.fromSchema(liveView.state.schema) : null;
      const out = base
        ? base.serializeFragment(fragment, options, target)
        : super.serializeFragment(fragment, options, target);
      const ids = citedSourceIds(fragment);
      if (!liveView || ids.size === 0) return out;
      const sources = readSources(liveView.state.doc).filter((source) => ids.has(source.id));
      if (sources.length === 0) return out;
      const doc = options.document ?? window.document;
      const carrier = doc.createElement("span");
      carrier.setAttribute(CITATION_CLIPBOARD_SOURCES_ATTR, JSON.stringify(sources));
      carrier.setAttribute("hidden", "");
      out.appendChild(carrier);
      return out;
    }
  }
  const serializer = new CitationClipboardSerializer({}, {});
  return new Plugin({
    key: new PluginKey("citationClipboardSources"),
    view(view) {
      liveView = view;
      return {
        destroy() {
          if (liveView === view) liveView = null;
        },
      };
    },
    props: {
      clipboardSerializer: serializer,
      transformPastedHTML(html: string) {
        pendingSources = [];
        if (!html.includes(CITATION_CLIPBOARD_SOURCES_ATTR)) return html;
        try {
          const parsed = new DOMParser().parseFromString(html, "text/html");
          for (const carrier of Array.from(
            parsed.querySelectorAll(`[${CITATION_CLIPBOARD_SOURCES_ATTR}]`),
          )) {
            pendingSources.push(
              ...normalizeSources(
                JSON.parse(carrier.getAttribute(CITATION_CLIPBOARD_SOURCES_ATTR) ?? "[]"),
              ),
            );
            carrier.remove();
          }
          return parsed.body.innerHTML;
        } catch {
          pendingSources = [];
          return html;
        }
      },
    },
    appendTransaction: imeSafeAppendTransaction((transactions, _oldState, newState) => {
      if (pendingSources.length === 0) return null;
      if (!transactions.some((transaction) => transaction.getMeta("paste"))) return null;
      const incoming = pendingSources;
      pendingSources = [];
      const store = readSourceStore(newState.doc);
      if (!sourceStoreIsEditable(store)) return null;
      const known = new Set(store.items.map((source) => source.id));
      const pastedIds = citedSourceIds(newState.doc.content);
      let items = store.items;
      for (const source of incoming) {
        if (known.has(source.id) || !pastedIds.has(source.id)) continue;
        items = upsertInStore(items, source);
        known.add(source.id);
      }
      if (items === store.items) return null;
      return newState.tr.setDocAttribute(SOURCES_ATTR, { ...store, items });
    }),
  });
}

/**
 * The user-facing extension: registers the citation node + the bibliography node +
 * the store + the commands. The commands keep the document nodes and the store in
 * sync.
 */
export const DocumentCitations = Extension.create<{ missingSourceLabel: string }>({
  name: "documentCitations",

  addOptions() {
    return { missingSourceLabel: "?" };
  },

  addExtensions() {
    return [Citation.configure({ missingSourceLabel: this.options.missingSourceLabel }), Bibliography, CitationStore];
  },

  addProseMirrorPlugins() {
    return [citationClipboardPlugin()];
  },

  addCommands() {
    return {
      addCitation:
        (sourceId: string, locator?: { locator?: string; prefix?: string }) =>
        ({ editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const id = sanitizeSourceId(sourceId);
          if (!id) return false;
          if (!sourceStoreIsEditable(readSourceStore(state.doc))) return false;
          if (nativeCitationEditIsBlocked(state.doc, new Set())) return false;
          // The source should already exist; if it doesn't, the in-text marker
          // degrades to "(missing)" at render — still a valid (if unhelpful) node.
          if (dispatch) {
            dirtyNativeCitationFields(tr, state.doc, new Set());
            if (!insertCitationNode(state, tr, id, locator)) return false;
            dispatch(tr);
          }
          return true;
        },

      addCitationWithSource:
        (source: unknown, locator?: { locator?: string; prefix?: string }) =>
        ({ editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          // Normalize once: an unusable candidate (no id / no citable content)
          // yields nothing and the command is a no-op. A usable candidate gives
          // the canonical stored id used for both the store upsert and the node.
          const stored = normalizeSources([source])[0];
          if (!stored) return false;
          const store = readSourceStore(state.doc);
          if (!sourceStoreIsEditable(store)) return false;
          if (nativeCitationEditIsBlocked(state.doc, new Set())) return false;
          const existing = store.items;
          const nextSources = upsertInStore(existing, source);
          // A store at its capacity keeps its sources and refuses the new one:
          // then no citation goes in either, or the text would point at a
          // source the document does not hold (OFL-051).
          if (!nextSources.some((item) => item.id === stored.id)) return false;
          if (dispatch) {
            dirtyNativeCitationFields(tr, state.doc, new Set());
            if (!insertCitationNode(state, tr, stored.id, locator))
              return false;
            tr.setDocAttribute(SOURCES_ATTR, { ...store, items: nextSources });
            dispatch(tr);
          }
          return true;
        },

      upsertSource:
        (source: unknown) =>
        ({ editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const store = readSourceStore(state.doc);
          if (!sourceStoreIsEditable(store)) return false;
          const existing = store.items;
          const nextSources = upsertInStore(existing, source);
          if (nextSources === existing) return false;
          const sourceId = normalizeSources([source])[0]?.id;
          if (
            sourceId &&
            nativeCitationEditIsBlocked(state.doc, new Set([sourceId]))
          ) {
            return false;
          }
          if (dispatch) {
            tr.setDocAttribute(SOURCES_ATTR, { ...store, items: nextSources });
            if (sourceId) {
              dirtyNativeCitationFields(tr, state.doc, new Set([sourceId]));
            }
            dispatch(tr);
          }
          return true;
        },

      removeSource:
        (sourceId: string) =>
        ({ editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const id = sanitizeSourceId(sourceId);
          if (!id) return false;
          if (collectCitationOrder(state.doc).includes(id)) return false;
          const store = readSourceStore(state.doc);
          if (!sourceStoreIsEditable(store)) return false;
          const existing = store.items;
          const nextSources = removeSource(existing, id);
          if (nextSources === existing) return false;
          if (nativeCitationEditIsBlocked(state.doc, new Set([id]))) {
            return false;
          }
          if (dispatch) {
            tr.setDocAttribute(SOURCES_ATTR, { ...store, items: nextSources });
            dirtyNativeCitationFields(tr, state.doc, new Set([id]));
            dispatch(tr);
          }
          return true;
        },

      setCitationStyle:
        (style: CitationStyle) =>
        ({ editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          if (!sourceStoreIsEditable(readSourceStore(state.doc))) return false;
          if (nativeCitationEditIsBlocked(state.doc)) return false;
          if (dispatch) {
            tr.setDocAttribute(
              CITATION_STYLE_ATTR,
              resolveCitationStyle(style),
            );
            dirtyNativeCitationFields(tr, state.doc);
            dispatch(tr);
          }
          return true;
        },

      restoreSources:
        (sources: unknown, style?: unknown) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setDocAttribute(SOURCES_ATTR, normalizeSourceStore(sources));
            tr.setDocAttribute(
              CITATION_STYLE_ATTR,
              resolveCitationStyle(style),
            );
            trustReadOnlyDocumentMutation(tr, "hydration-restore");
            dispatch(tr);
          }
          return true;
        },
    };
  },
});

export default DocumentCitations;
