"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Node, mergeAttributes, Extension } from "@tiptap/core";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import { refreshWhenEditPauses } from "@mrnote/core/web/components/console/editor/native-document/editPausedViews.ts";
import { reactNodeViewWithLivePosition } from "@mrnote/core/web/components/console/editor/extensions/reactNodeViewPosition.tsx";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection, Plugin, type Transaction } from "@tiptap/pm/state";
import { useEffect, useState } from "react";
import {
  CAPTION_ANCHOR_ID_ATTR,
  CAPTION_NODE_NAME,
  builtinCaptionLabelName,
  builtinCaptionLabelNamesAreInstalled,
  captionPrefix,
  collectCaptionsFromDoc,
  normalizeCaptionAttributes,
  normalizeCaptionKind,
  sanitizeCaptionLabel,
  sanitizeCaptionLabelName,
  subscribeBuiltinCaptionLabelNames,
  type CaptionAttributes,
  type CaptionKind,
} from "@mrnote/core/web/components/console/editor/native-document/captions.ts";
import { sanitizeAnchorId } from "@mrnote/core/web/components/console/editor/native-document/tableOfContents.ts";
import { hasImeCompositionTransaction } from "@mrnote/core/web/components/console/editor/native-document/imeCompositionGuard.ts";
import {
  anchorIncumbents,
  releaseDuplicateAnchorIds,
  type AnchorHolders,
} from "./anchorIncumbency";
import { editsStayInsideTextblocks } from "@mrnote/core/web/components/console/editor/native-document/textblockOnlyEdits.ts";

/**
 * Document CAPTIONS (Word/WPS "Figure N" / "Table N" parity) — TipTap wiring.
 *
 * ADDITIVE: registering these extensions adds ONE block node ("caption") plus a
 * global anchor-id back-fill plugin. A caption is bound to a figure (image) or
 * table by sitting adjacent to it in document order; it carries:
 *   - `kind`: "figure" | "table" | "equation" | "custom" (the Word SEQ
 *     sequence + the independent counter it advances).
 *   - `labelName`: the label text the caption was written with ("Figure",
 *     "图表", a New Label name); null shows the viewer's built-in name.
 *   - `label`: the editable prose AFTER the auto-number ("…flow diagram").
 *   - `anchor_id`: a stable, sanitized id (back-filled lazily; same scheme as
 *     headings) so a cross-reference link survives edits to the label.
 *
 * The sequential NUMBER ("Figure 1", "Table 2") is NOT stored — it is derived
 * LIVE by `collectCaptions`, counting prior captions of the same kind in
 * document order (exactly how the Table of Contents derives heading numbers), so
 * inserting / deleting / reordering a figure renumbers without drift and figure
 * vs table counters stay independent.
 *
 * The node rides the document schema's open content/attrs passthrough, so
 * EXISTING documents — which carry none — still validate and load unchanged.
 * There is no flag: the feature is opt-in per user action (Insert caption); a
 * document with no captions behaves exactly as before.
 *
 * SECURITY: every attribute funnels through the ./captions + ./tableOfContents
 * sanitizers on parse / render / command, so a forged or imported value can
 * never break out of the DOM attribute surface or inject markup; the label is
 * rendered as TEXT (React/TipTap escape it).
 */

const CAPTION_ANCHOR_DATA_ATTR = "data-caption-anchor-id";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    documentCaptions: {
      /**
       * Insert a caption block of the given kind ("figure"/"table") at the caret,
       * with the supplied (sanitized) label prose. The auto-number is derived for
       * display, never stored.
       */
      addCaption: (attrs: Partial<CaptionAttributes>) => ReturnType;
      /** Update the selected native caption atom without changing its anchor. */
      updateCaption: (attrs: Partial<CaptionAttributes>) => ReturnType;
    };
  }
}

/**
 * Live number for the caption owning `anchorId`, or null when it cannot be
 * resolved (e.g. a freshly-inserted node not yet anchored). Derived through the
 * SAME `collectCaptions` walk the export/import use, so the number shown in the
 * editor equals the number Word renders for the SEQ field's cached result.
 */
function captionNumberForNode(
  doc: ProseMirrorNode,
  anchorId: string,
): { kind: CaptionKind; number: number; chapterNumber: string } | null {
  if (!anchorId) return null;
  const found = collectCaptionsFromDoc(doc).find((c) => c.id === anchorId);
  return found
    ? {
        kind: found.kind,
        number: found.number,
        chapterNumber: found.chapterNumber ?? "",
      }
    : null;
}

/**
 * The caption block. Renders a non-editable "Figure N" / "Table N" prefix
 * (derived live) followed by the editable label prose. The prefix re-derives on
 * every document update (insert/delete/reorder) so the visible number is never
 * stale — mirroring the live Table of Contents.
 */
function CaptionView(props: NodeViewProps) {
  const { editor, node } = props;
  const attrs = normalizeCaptionAttributes(node.attrs);
  const { kind, label } = attrs;
  const anchorId = sanitizeAnchorId(node.attrs?.[CAPTION_ANCHOR_ID_ATTR]);

  const [prefix, setPrefix] = useState<string>(() => {
    const resolved = captionNumberForNode(editor.state.doc, anchorId);
    return resolved
      ? captionPrefix(resolved.kind, resolved.number, {
          labelName: attrs.labelName,
          numberFormat: attrs.numberFormat,
          excludeLabel: attrs.excludeLabel,
          includeChapterNumber: attrs.includeChapterNumber,
          chapterSeparator: attrs.chapterSeparator,
          chapterNumber: resolved.chapterNumber,
        })
      : captionPrefix(kind, 1, {
          labelName: attrs.labelName,
          numberFormat: attrs.numberFormat,
          excludeLabel: attrs.excludeLabel,
          includeChapterNumber: attrs.includeChapterNumber,
          chapterSeparator: attrs.chapterSeparator,
        });
  });

  // Live-update: re-derive this caption's number whenever the document changes
  // (a figure inserted/removed/reordered before it shifts its number). We only
  // commit a changed prefix so unrelated edits don't churn React.
  useEffect(() => {
    const refresh = () => {
      const resolved = captionNumberForNode(editor.state.doc, anchorId);
      const next = resolved
        ? captionPrefix(resolved.kind, resolved.number, {
            labelName: attrs.labelName,
            numberFormat: attrs.numberFormat,
            excludeLabel: attrs.excludeLabel,
            includeChapterNumber: attrs.includeChapterNumber,
            chapterSeparator: attrs.chapterSeparator,
            chapterNumber: resolved.chapterNumber,
          })
        : captionPrefix(kind, 1, {
            labelName: attrs.labelName,
            numberFormat: attrs.numberFormat,
            excludeLabel: attrs.excludeLabel,
            includeChapterNumber: attrs.includeChapterNumber,
            chapterSeparator: attrs.chapterSeparator,
          });
      setPrefix((prev) => (prev === next ? prev : next));
    };
    refresh();
    const stopRefreshing = refreshWhenEditPauses(editor, "captions", refresh);
    // A caption without a stored label name shows the viewer's built-in name,
    // which arrives from the message catalog after the first paint.
    const unsubscribe = subscribeBuiltinCaptionLabelNames(refresh);
    return () => {
      stopRefreshing();
      unsubscribe();
    };
  }, [
    editor,
    anchorId,
    attrs.labelName,
    attrs.excludeLabel,
    attrs.includeChapterNumber,
    attrs.chapterHeadingLevel,
    attrs.chapterSeparator,
    attrs.numberFormat,
    kind,
  ]);

  return (
    <NodeViewWrapper
      as="figcaption"
      className="mrnote-caption"
      data-type="caption"
      data-caption-kind={kind}
      data-caption-label-name={attrs.labelName ?? undefined}
      data-caption-position={attrs.position}
      data-caption-number-format={attrs.numberFormat}
      data-caption-exclude-label={attrs.excludeLabel ? "true" : undefined}
      data-caption-separator={attrs.separator}
      data-caption-include-chapter-number={
        attrs.includeChapterNumber ? "true" : undefined
      }
      data-caption-chapter-heading-level={attrs.chapterHeadingLevel}
      data-caption-chapter-separator={attrs.chapterSeparator}
      data-caption-anchor-id={anchorId || undefined}
      data-testid="document-caption"
    >
      <span
        className="mrnote-caption__prefix"
        contentEditable={false}
        data-testid="document-caption-prefix"
      >
        {prefix}
        {label ? attrs.separator : ""}
      </span>
      <span className="mrnote-caption__label">{label}</span>
    </NodeViewWrapper>
  );
}

const Caption = Node.create({
  name: CAPTION_NODE_NAME,
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      kind: {
        default: "figure" as CaptionKind,
        parseHTML: (element: HTMLElement) =>
          normalizeCaptionKind(element.getAttribute("data-caption-kind")),
        renderHTML: (attrs: Record<string, unknown>) => ({
          "data-caption-kind": normalizeCaptionKind(attrs.kind),
        }),
      },
      labelName: {
        default: null as string | null,
        parseHTML: (element: HTMLElement) =>
          sanitizeCaptionLabelName(
            element.getAttribute("data-caption-label-name"),
          ) || null,
        renderHTML: (attrs: Record<string, unknown>) => {
          const labelName = sanitizeCaptionLabelName(attrs.labelName);
          return labelName ? { "data-caption-label-name": labelName } : {};
        },
      },
      label: {
        default: "" as string,
        parseHTML: (element: HTMLElement) =>
          sanitizeCaptionLabel(element.getAttribute("data-caption-label")),
        renderHTML: (attrs: Record<string, unknown>) => {
          const label = sanitizeCaptionLabel(attrs.label);
          return label ? { "data-caption-label": label } : {};
        },
      },
      position: {
        default: "below",
        parseHTML: (element: HTMLElement) =>
          normalizeCaptionAttributes({
            position: element.getAttribute("data-caption-position"),
          }).position,
        renderHTML: (attrs: Record<string, unknown>) => ({
          "data-caption-position": normalizeCaptionAttributes(attrs).position,
        }),
      },
      numberFormat: {
        default: "Arabic",
        parseHTML: (element: HTMLElement) =>
          normalizeCaptionAttributes({
            numberFormat: element.getAttribute("data-caption-number-format"),
          }).numberFormat,
        renderHTML: (attrs: Record<string, unknown>) => ({
          "data-caption-number-format": normalizeCaptionAttributes(attrs).numberFormat,
        }),
      },
      excludeLabel: {
        default: false,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-caption-exclude-label") === "true",
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.excludeLabel === true
            ? { "data-caption-exclude-label": "true" }
            : {},
      },
      separator: {
        default: ": ",
        parseHTML: (element: HTMLElement) =>
          normalizeCaptionAttributes({
            separator: element.getAttribute("data-caption-separator"),
          }).separator,
        renderHTML: (attrs: Record<string, unknown>) => ({
          "data-caption-separator": normalizeCaptionAttributes(attrs).separator,
        }),
      },
      includeChapterNumber: {
        default: false,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-caption-include-chapter-number") === "true",
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.includeChapterNumber === true
            ? { "data-caption-include-chapter-number": "true" }
            : {},
      },
      chapterHeadingLevel: {
        default: 1,
        parseHTML: (element: HTMLElement) =>
          normalizeCaptionAttributes({
            chapterHeadingLevel: Number.parseInt(
              element.getAttribute("data-caption-chapter-heading-level") ?? "",
              10,
            ),
          }).chapterHeadingLevel,
        renderHTML: (attrs: Record<string, unknown>) => ({
          "data-caption-chapter-heading-level": normalizeCaptionAttributes(attrs)
            .chapterHeadingLevel,
        }),
      },
      chapterSeparator: {
        default: "-",
        parseHTML: (element: HTMLElement) =>
          normalizeCaptionAttributes({
            chapterSeparator: element.getAttribute(
              "data-caption-chapter-separator",
            ),
          }).chapterSeparator,
        renderHTML: (attrs: Record<string, unknown>) => ({
          "data-caption-chapter-separator": normalizeCaptionAttributes(attrs)
            .chapterSeparator,
        }),
      },
      [CAPTION_ANCHOR_ID_ATTR]: {
        default: null as string | null,
        parseHTML: (element: HTMLElement) =>
          sanitizeAnchorId(element.getAttribute(CAPTION_ANCHOR_DATA_ATTR)) ||
          null,
        renderHTML: (attrs: Record<string, unknown>) => {
          const id = sanitizeAnchorId(attrs[CAPTION_ANCHOR_ID_ATTR]);
          return id ? { [CAPTION_ANCHOR_DATA_ATTR]: id } : {};
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'figcaption[data-type="caption"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const attrs = normalizeCaptionAttributes({
      kind: (HTMLAttributes as { "data-caption-kind"?: unknown })[
        "data-caption-kind"
      ],
      labelName: (HTMLAttributes as { "data-caption-label-name"?: unknown })[
        "data-caption-label-name"
      ],
      label: (HTMLAttributes as { "data-caption-label"?: unknown })[
        "data-caption-label"
      ],
      position: (HTMLAttributes as { "data-caption-position"?: unknown })[
        "data-caption-position"
      ],
      numberFormat: (HTMLAttributes as { "data-caption-number-format"?: unknown })[
        "data-caption-number-format"
      ],
      excludeLabel:
        (HTMLAttributes as { "data-caption-exclude-label"?: unknown })[
          "data-caption-exclude-label"
        ] === "true",
      separator: (HTMLAttributes as { "data-caption-separator"?: unknown })[
        "data-caption-separator"
      ],
      includeChapterNumber:
        (HTMLAttributes as { "data-caption-include-chapter-number"?: unknown })[
          "data-caption-include-chapter-number"
        ] === "true",
      chapterHeadingLevel: Number.parseInt(
        String(
          (HTMLAttributes as {
            "data-caption-chapter-heading-level"?: unknown;
          })["data-caption-chapter-heading-level"] ?? "",
        ),
        10,
      ),
      chapterSeparator: (
        HTMLAttributes as { "data-caption-chapter-separator"?: unknown }
      )["data-caption-chapter-separator"],
    });
    const { kind, label } = attrs;
    const id = sanitizeAnchorId(
      (HTMLAttributes as { [k: string]: unknown })[CAPTION_ANCHOR_DATA_ATTR],
    );
    return [
      "figcaption",
      mergeAttributes(
        {},
        { "data-type": "caption", class: "mrnote-caption" },
        { "data-caption-kind": kind },
        attrs.labelName ? { "data-caption-label-name": attrs.labelName } : {},
        { "data-caption-position": attrs.position },
        { "data-caption-number-format": attrs.numberFormat },
        attrs.excludeLabel ? { "data-caption-exclude-label": "true" } : {},
        { "data-caption-separator": attrs.separator },
        attrs.includeChapterNumber
          ? { "data-caption-include-chapter-number": "true" }
          : {},
        { "data-caption-chapter-heading-level": attrs.chapterHeadingLevel },
        { "data-caption-chapter-separator": attrs.chapterSeparator },
        label ? { "data-caption-label": label } : {},
        id ? { [CAPTION_ANCHOR_DATA_ATTR]: id } : {},
      ),
      // The number is derived live, so static HTML emits only the label text;
      // viewers without the NodeView still see the caption prose.
      label,
    ];
  },

  addNodeView() {
    return reactNodeViewWithLivePosition(CaptionView);
  },

  addCommands() {
    return {
      addCaption:
        (input: Partial<CaptionAttributes>) =>
        ({ editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const type = state.schema.nodes[CAPTION_NODE_NAME];
          if (!type) return false;
          const normalized = normalizeCaptionAttributes(input);
          // Word writes the label into the caption when it is inserted, so a
          // new caption keeps the text it was made with for every viewer.
          const attrs: CaptionAttributes =
            normalized.kind !== "custom" && !normalized.labelName
              ? {
                  ...normalized,
                  labelName: builtinCaptionLabelName(normalized.kind),
                }
              : normalized;
          if (dispatch) {
            const node = type.create(attrs);
            const selection = state.selection;
            if (
              selection instanceof NodeSelection &&
              selection.node.type.name !== CAPTION_NODE_NAME
            ) {
              const insertPos =
                attrs.position === "above"
                  ? selection.from
                  : selection.from + selection.node.nodeSize;
              tr.insert(insertPos, node);
              tr.setSelection(NodeSelection.create(tr.doc, insertPos));
            } else {
              // No object selected: Word adds the caption as a paragraph of
              // its own beside the block the insertion point is in. It never
              // splits that paragraph, and never replaces selected words.
              const $from = selection.$from;
              let depth = 0;
              for (let d = 1; d <= $from.depth; d += 1) {
                const index = $from.index(d - 1);
                if ($from.node(d - 1).canReplaceWith(index, index, type)) {
                  depth = d;
                  break;
                }
              }
              if (depth === 0) {
                tr.replaceSelectionWith(node);
              } else {
                const insertPos =
                  attrs.position === "above"
                    ? $from.before(depth)
                    : $from.after(depth);
                tr.insert(insertPos, node);
                tr.setSelection(NodeSelection.create(tr.doc, insertPos));
              }
            }
            dispatch(tr.scrollIntoView());
          }
          return true;
        },
      updateCaption:
        (input: Partial<CaptionAttributes>) =>
        ({ editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const selection = state.selection;
          if (
            !(selection instanceof NodeSelection) ||
            selection.node.type.name !== CAPTION_NODE_NAME
          ) {
            return false;
          }
          if (dispatch) {
            const attrs = normalizeCaptionAttributes({
              ...selection.node.attrs,
              ...input,
            });
            const previousPosition = normalizeCaptionAttributes(
              selection.node.attrs,
            ).position;
            const parent = selection.$from.parent;
            const index = selection.$from.index();
            if (
              attrs.position !== previousPosition &&
              attrs.position === "above" &&
              index > 0
            ) {
              const previous = parent.child(index - 1);
              const insertPos = selection.from - previous.nodeSize;
              tr.delete(selection.from, selection.from + selection.node.nodeSize);
              tr.insert(insertPos, selection.node.type.create(attrs));
              tr.setSelection(NodeSelection.create(tr.doc, insertPos));
            } else if (
              attrs.position !== previousPosition &&
              attrs.position === "below" &&
              index + 1 < parent.childCount
            ) {
              const next = parent.child(index + 1);
              const insertPos = selection.from + next.nodeSize;
              tr.delete(selection.from, selection.from + selection.node.nodeSize);
              tr.insert(insertPos, selection.node.type.create(attrs));
              tr.setSelection(NodeSelection.create(tr.doc, insertPos));
            } else {
              tr.setNodeMarkup(selection.from, undefined, attrs);
              tr.setSelection(NodeSelection.create(tr.doc, selection.from));
            }
            dispatch(tr);
          }
          return true;
        },
    };
  },
});

/**
 * Back-fill a sanitized, document-unique `anchor_id` on every caption missing
 * one (or whose stored value sanitizes to empty). Mutates the given transaction;
 * returns whether anything changed. The ids are derived through the SAME
 * `collectCaptions` helper the NodeView/export read from, so the back-filled id
 * always equals the id a cross-reference targets, even under de-duplication.
 */
/** Documents found with every caption's id and label in place, with
 * whether the built-in label names were installed then. */
const completeCaptionDocuments = new WeakMap<ProseMirrorNode, boolean>();

export function assignMissingCaptionAnchorIds(
  tr: Transaction,
  doc: ProseMirrorNode,
): boolean {
  const ids = collectCaptionsFromDoc(doc).map((c) => c.id);
  let changed = false;
  let index = 0;
  doc.descendants((node, pos) => {
    if (node.type.name !== CAPTION_NODE_NAME) return true;
    const positional = index;
    index += 1;
    const current = sanitizeAnchorId(node.attrs?.[CAPTION_ANCHOR_ID_ATTR]);
    const next = current ? null : ids[positional];
    // A caption made before labels were stored in the caption has none: it
    // showed the viewer's label, but the DOCX export (which has no viewer)
    // wrote the English "Figure". It takes the label it is showing, once,
    // like every caption inserted since.
    const attrs = normalizeCaptionAttributes(node.attrs);
    const labelName =
      !attrs.labelName &&
      attrs.kind !== "custom" &&
      builtinCaptionLabelNamesAreInstalled()
        ? builtinCaptionLabelName(attrs.kind)
        : null;
    if (!next && !labelName) return true;
    tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      ...(next ? { [CAPTION_ANCHOR_ID_ATTR]: next } : {}),
      ...(labelName ? { labelName } : {}),
    });
    changed = true;
    return true;
  });
  if (changed) tr.setMeta("addToHistory", false);
  return changed;
}

/** Captions as holders of anchor ids. */
const CAPTION_ANCHOR_HOLDERS: AnchorHolders = {
  idOf: (node) =>
    node.type.name === CAPTION_NODE_NAME
      ? sanitizeAnchorId(node.attrs?.[CAPTION_ANCHOR_ID_ATTR]) || null
      : null,
  attr: CAPTION_ANCHOR_ID_ATTR,
};









export function releaseDuplicateCaptionAnchorIds(
  tr: Transaction,
  original: (id: string) => number | null = () => null,
): boolean {
  return releaseDuplicateAnchorIds(tr, CAPTION_ANCHOR_HOLDERS, original);
}

/** pageRebalanceExtension's REBALANCE_META (a module this one does not load). */
const PAGE_LEDGER_REBALANCE_META = "structuralRebalance";

/**
 * A page-ledger transaction that moves no caption: blocks moved between
 * sheets as the same nodes, or cut into pieces, none of them a caption. The
 * captions are the ones they were, each with its id; collecting them again
 * serialized the whole book on every ledger pass (the 298-page book).
 */
function movesNoCaption(transaction: Transaction): boolean {
  if (!transaction.docChanged) return true;
  if (transaction.getMeta(PAGE_LEDGER_REBALANCE_META) !== true) return false;
  return transaction.steps.every((step, index) => {
    const range = step as unknown as { from?: number; to?: number; slice?: { content: ProseMirrorNode["content"] } };
    if (!range.slice || typeof range.from !== "number" || typeof range.to !== "number") return false;
    let caption = false;
    const visit = (node: ProseMirrorNode) => {
      if (caption) return false;
      if (node.type.name === CAPTION_NODE_NAME) caption = true;
      return !caption && !node.isTextblock;
    };
    range.slice.content.descendants(visit);
    // What the step removes, too (a caption moved away from here).
    if (!caption && range.to > range.from) transaction.docs[index]?.nodesBetween(range.from, range.to, visit);
    return !caption;
  });
}

/** Global plugin that keeps every caption's stable anchor id back-filled. */
const CaptionAnchorIds = Extension.create({
  name: "captionAnchorIds",

  onCreate({ editor }) {
    const tr = editor.state.tr;
    const released = releaseDuplicateCaptionAnchorIds(tr);
    if (assignMissingCaptionAnchorIds(tr, tr.doc) || released) {
      tr.setMeta("addToHistory", false);
      editor.view.dispatch(tr);
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (transactions, oldState, newState) => {
          if (hasImeCompositionTransaction(transactions)) return null;
          // A document found with every caption complete stays so through an
          // edit inside text blocks that are not captions; whether the
          // built-in label names are installed is part of the finding.
          const installed = builtinCaptionLabelNamesAreInstalled();
          if (completeCaptionDocuments.get(newState.doc) === installed) return null;
          if (completeCaptionDocuments.get(oldState.doc) === installed &&
              (editsStayInsideTextblocks(transactions, (block) => block.type.name === CAPTION_NODE_NAME) ||
                transactions.every(movesNoCaption))) {
            completeCaptionDocuments.set(newState.doc, installed);
            return null;
          }
          const tr = newState.tr;
          let released = false;
          if (transactions.some((transaction) => transaction.docChanged)) {
            released = releaseDuplicateCaptionAnchorIds(
              tr,
              anchorIncumbents(CAPTION_ANCHOR_HOLDERS, oldState.doc, transactions),
            );
          }
          const assigned = assignMissingCaptionAnchorIds(tr, tr.doc);
          if (!assigned && !released) completeCaptionDocuments.set(newState.doc, installed);
          if (released && !assigned) tr.setMeta("addToHistory", false);
          return assigned || released ? tr : null;
        },
      }),
    ];
  },
});

/**
 * The caption feature bundle: the `caption` node + the anchor-id back-fill
 * plugin. Registering this is purely additive (see module note).
 */
export const DocumentCaptions = [Caption, CaptionAnchorIds];

export default DocumentCaptions;
