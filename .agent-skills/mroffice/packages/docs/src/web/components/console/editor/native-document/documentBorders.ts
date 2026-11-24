/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection } from "@tiptap/pm/state";

import {
  DEFAULT_DOCUMENT_PARAGRAPH_BORDER,
  DEFAULT_DOCUMENT_TEXT_BOX_OUTLINE,
  DOCUMENT_PARAGRAPH_BORDER_EDGES,
  DOCUMENT_PARAGRAPH_BORDER_PRESETS,
  documentBorderLineIsVisible,
  legacyPresetFromParagraphBorders,
  normalizeDocumentBorderLine,
  normalizeDocumentBorderPen,
  normalizeDocumentParagraphBorders,
  normalizeDocumentTextBoxOutline,
  paragraphBordersFromLegacyPreset,
  stableDocumentParagraphBordersJson,
  stableDocumentTextBoxOutlineJson,
  type DocumentBorderLine,
  type DocumentBorderPen,
  type DocumentParagraphBorderEdge,
  type DocumentParagraphBorderPreset,
  type DocumentParagraphBorders,
} from "@mrnote/core/web/lib/document-borders.ts";
import { TEXT_BOX_NODE_NAME } from "@mrnote/core/web/components/console/editor/native-document/contentControls.ts";

export type BorderTargetKind = "paragraph" | "textBox";

interface SelectionIdentity {
  readonly kind: string;
  readonly from: number;
  readonly to: number;
  readonly anchor: number;
  readonly head: number;
}

interface BorderNodeTarget {
  readonly pos: number;
  readonly node: ProseMirrorNode;
}

export interface DocumentBorderTarget {
  readonly doc: ProseMirrorNode;
  readonly selection: SelectionIdentity;
  readonly paragraphs: readonly BorderNodeTarget[];
  readonly textBox: BorderNodeTarget | null;
  readonly defaultKind: BorderTargetKind;
}

export type DocumentBorderCommitResult = "changed" | "unchanged" | "rejected";

function selectionIdentity(editor: Editor): SelectionIdentity {
  const { selection } = editor.state;
  return {
    kind: selection.constructor.name,
    from: selection.from,
    to: selection.to,
    anchor: selection.anchor,
    head: selection.head,
  };
}

function sameSelectionIdentity(
  left: SelectionIdentity,
  right: SelectionIdentity,
): boolean {
  return (
    left.kind === right.kind &&
    left.from === right.from &&
    left.to === right.to &&
    left.anchor === right.anchor &&
    left.head === right.head
  );
}

function ancestorTarget(
  editor: Editor,
  side: "$from" | "$to",
  typeName: string,
): BorderNodeTarget | null {
  const resolved = editor.state.selection[side];
  for (let depth = resolved.depth; depth > 0; depth -= 1) {
    const node = resolved.node(depth);
    if (node.type.name === typeName) {
      return { pos: resolved.before(depth), node };
    }
  }
  return null;
}

function selectedTextBox(editor: Editor): BorderNodeTarget | null {
  const { selection, doc } = editor.state;
  if (
    selection instanceof NodeSelection &&
    selection.node.type.name === TEXT_BOX_NODE_NAME
  ) {
    return { pos: selection.from, node: selection.node };
  }
  const from = ancestorTarget(editor, "$from", TEXT_BOX_NODE_NAME);
  const to = ancestorTarget(editor, "$to", TEXT_BOX_NODE_NAME);
  if (!from || !to || from.pos !== to.pos || from.node !== to.node) return null;
  return doc.nodeAt(from.pos) === from.node ? from : null;
}

function selectedParagraphs(editor: Editor): BorderNodeTarget[] {
  const { doc, selection } = editor.state;
  const selected = new Map<number, ProseMirrorNode>();
  const supported = new Set(["paragraph", "heading"]);
  doc.nodesBetween(selection.from, selection.to, (node, pos) => {
    if (supported.has(node.type.name)) selected.set(pos, node);
  });
  if (selection.empty || selected.size === 0) {
    for (let depth = selection.$from.depth; depth > 0; depth -= 1) {
      const node = selection.$from.node(depth);
      if (!supported.has(node.type.name)) continue;
      selected.set(selection.$from.before(depth), node);
      break;
    }
  }
  return [...selected]
    .sort(([left], [right]) => left - right)
    .map(([pos, node]) => ({ pos, node }));
}

export function readDocumentBorderTarget(
  editor: Editor,
): DocumentBorderTarget | null {
  if (editor.isDestroyed) return null;
  const paragraphs = selectedParagraphs(editor);
  const textBox = selectedTextBox(editor);
  if (paragraphs.length === 0 && !textBox) return null;
  return {
    doc: editor.state.doc,
    selection: selectionIdentity(editor),
    paragraphs,
    textBox,
    defaultKind: textBox ? "textBox" : "paragraph",
  };
}

function authenticateTarget(
  editor: Editor,
  expected: DocumentBorderTarget,
): DocumentBorderTarget | null {
  if (
    editor.isDestroyed ||
    !editor.isEditable ||
    editor.state.doc !== expected.doc
  ) {
    return null;
  }
  const current = readDocumentBorderTarget(editor);
  if (
    !current ||
    !sameSelectionIdentity(current.selection, expected.selection) ||
    current.paragraphs.length !== expected.paragraphs.length ||
    current.paragraphs.some(
      (entry, index) =>
        entry.pos !== expected.paragraphs[index]?.pos ||
        entry.node !== expected.paragraphs[index]?.node,
    ) ||
    current.textBox?.pos !== expected.textBox?.pos ||
    current.textBox?.node !== expected.textBox?.node
  ) {
    return null;
  }
  return current;
}

export function documentParagraphBordersForNode(
  node: ProseMirrorNode,
): DocumentParagraphBorders | null {
  return (
    normalizeDocumentParagraphBorders(node.attrs.paragraphBorders) ??
    paragraphBordersFromLegacyPreset(node.attrs.borderPreset)
  );
}

function mergeParagraphBorderPatch(
  current: DocumentParagraphBorders | null,
  patch: DocumentParagraphBorders,
): DocumentParagraphBorders | null {
  return normalizeDocumentParagraphBorders({ ...(current ?? {}), ...patch });
}

function paragraphPresetPatch(
  preset: DocumentParagraphBorderPreset,
  line: DocumentBorderLine,
  index: number,
  count: number,
): DocumentParagraphBorders {
  const patch: DocumentParagraphBorders = {};
  const none: DocumentBorderLine = { style: "nil" };
  const set = (
    edge: DocumentParagraphBorderEdge,
    value: DocumentBorderLine = line,
  ) => {
    patch[edge] = value;
  };
  if (preset === "none") {
    for (const edge of DOCUMENT_PARAGRAPH_BORDER_EDGES) set(edge, none);
    return patch;
  }
  if (
    preset === "top" ||
    preset === "right" ||
    preset === "bottom" ||
    preset === "left"
  ) {
    set(preset);
    return patch;
  }
  if (preset === "insideH") {
    set("between");
    return patch;
  }
  if (preset === "outside" || preset === "all") {
    // Word gives every selected paragraph the same box (w:pBdr): consecutive
    // paragraphs with the same settings are one group, boxed once with the
    // inside rule as `between` (paragraphBorderGroups.ts draws the group).
    // Top only on the first and bottom only on the last made four different
    // settings, which Word (and a DOCX reader) draws as separate pieces.
    set("top");
    set("bottom");
    set("left");
    set("right");
    if (preset === "all" && count > 1) set("between");
  }
  return patch;
}

function sameParagraphBorders(
  left: DocumentParagraphBorders | null,
  right: DocumentParagraphBorders | null,
): boolean {
  return (
    stableDocumentParagraphBordersJson(left) ===
    stableDocumentParagraphBordersJson(right)
  );
}

export function commitDocumentBorderPreset(
  editor: Editor,
  expected: DocumentBorderTarget,
  kind: BorderTargetKind,
  preset: DocumentParagraphBorderPreset,
  pen: DocumentBorderPen = DEFAULT_DOCUMENT_PARAGRAPH_BORDER,
  




  mode: "draw" | "remove" = "draw",
): DocumentBorderCommitResult {
  if (!DOCUMENT_PARAGRAPH_BORDER_PRESETS.includes(preset)) return "rejected";
  const live = authenticateTarget(editor, expected);
  if (!live) return "rejected";
  const normalizedPen = normalizeDocumentBorderPen(
    pen,
    kind === "textBox"
      ? DEFAULT_DOCUMENT_TEXT_BOX_OUTLINE
      : DEFAULT_DOCUMENT_PARAGRAPH_BORDER,
  );
  const drawn = normalizeDocumentBorderLine(normalizedPen);
  if (!drawn) return "rejected";
  const line: DocumentBorderLine = mode === "remove" ? { style: "nil" } : drawn;
  let transaction = editor.state.tr;
  let changed = false;

  if (kind === "textBox") {
    if (!live.textBox || (preset !== "none" && preset !== "outside")) {
      return "rejected";
    }
    const next: DocumentBorderLine =
      preset === "none" ? { style: "nil" } : line;
    const current = normalizeDocumentTextBoxOutline(
      live.textBox.node.attrs.textBoxOutline,
    );
    if (
      stableDocumentTextBoxOutlineJson(current) !==
      stableDocumentTextBoxOutlineJson(next)
    ) {
      transaction = transaction.setNodeMarkup(
        live.textBox.pos,
        undefined,
        { ...live.textBox.node.attrs, textBoxOutline: next },
        live.textBox.node.marks,
      );
      changed = true;
    }
  } else {
    if (live.paragraphs.length === 0) return "rejected";
    live.paragraphs.forEach((entry, index) => {
      const current = documentParagraphBordersForNode(entry.node);
      const next = mergeParagraphBorderPatch(
        current,
        paragraphPresetPatch(preset, line, index, live.paragraphs.length),
      );
      if (sameParagraphBorders(current, next)) return;
      transaction = transaction.setNodeMarkup(
        entry.pos,
        undefined,
        {
          ...entry.node.attrs,
          paragraphBorders: next,
          borderPreset: legacyPresetFromParagraphBorders(next),
        },
        entry.node.marks,
      );
      changed = true;
    });
  }

  if (!changed) return "unchanged";
  editor.view.dispatch(closeHistory(transaction.scrollIntoView()));
  return "changed";
}

/**
 * Draw several paragraph presets, each in its own pen, as one change (one
 * Undo step): the Borders list's compound entries such as Top and Thick
 * Bottom Border.
 */
export function commitDocumentParagraphBorderSteps(
  editor: Editor,
  expected: DocumentBorderTarget,
  steps: readonly {
    readonly preset: DocumentParagraphBorderPreset;
    readonly pen: DocumentBorderPen;
  }[],
): DocumentBorderCommitResult {
  const live = authenticateTarget(editor, expected);
  if (!live || live.paragraphs.length === 0 || steps.length === 0) return "rejected";
  const lines: { preset: DocumentParagraphBorderPreset; line: DocumentBorderLine }[] = [];
  for (const step of steps) {
    if (!DOCUMENT_PARAGRAPH_BORDER_PRESETS.includes(step.preset)) return "rejected";
    const line = normalizeDocumentBorderLine(
      normalizeDocumentBorderPen(step.pen, DEFAULT_DOCUMENT_PARAGRAPH_BORDER),
    );
    if (!line) return "rejected";
    lines.push({ preset: step.preset, line });
  }
  let transaction = editor.state.tr;
  let changed = false;
  live.paragraphs.forEach((entry, index) => {
    const current = documentParagraphBordersForNode(entry.node);
    let next = current;
    for (const { preset, line } of lines) {
      next = mergeParagraphBorderPatch(
        next,
        paragraphPresetPatch(preset, line, index, live.paragraphs.length),
      );
    }
    if (sameParagraphBorders(current, next)) return;
    transaction = transaction.setNodeMarkup(
      entry.pos,
      undefined,
      {
        ...entry.node.attrs,
        paragraphBorders: next,
        borderPreset: legacyPresetFromParagraphBorders(next),
      },
      entry.node.marks,
    );
    changed = true;
  });
  if (!changed) return "unchanged";
  editor.view.dispatch(closeHistory(transaction.scrollIntoView()));
  return "changed";
}

function lineForTarget(
  target: DocumentBorderTarget,
  kind: BorderTargetKind,
): DocumentBorderLine | null {
  if (kind === "textBox") {
    const outline = target.textBox
      ? normalizeDocumentTextBoxOutline(
          target.textBox.node.attrs.textBoxOutline,
        )
      : null;
    return documentBorderLineIsVisible(outline)
      ? outline
      : DEFAULT_DOCUMENT_TEXT_BOX_OUTLINE;
  }
  for (const paragraph of target.paragraphs) {
    const borders = documentParagraphBordersForNode(paragraph.node);
    for (const edge of DOCUMENT_PARAGRAPH_BORDER_EDGES) {
      if (documentBorderLineIsVisible(borders?.[edge]))
        return borders?.[edge] ?? null;
    }
  }
  return DEFAULT_DOCUMENT_PARAGRAPH_BORDER;
}

export function documentBorderPenForTarget(
  target: DocumentBorderTarget,
  kind: BorderTargetKind,
): DocumentBorderPen {
  return normalizeDocumentBorderPen(
    lineForTarget(target, kind),
    kind === "textBox"
      ? DEFAULT_DOCUMENT_TEXT_BOX_OUTLINE
      : DEFAULT_DOCUMENT_PARAGRAPH_BORDER,
  );
}

function samePenLine(
  line: DocumentBorderLine | null | undefined,
  pen: DocumentBorderLine,
): boolean {
  return Boolean(
    line &&
      line.style === pen.style &&
      (line.sizePt ?? null) === (pen.sizePt ?? null) &&
      (line.color ?? null) === (pen.color ?? null),
  );
}

function penLineFor(
  pen: DocumentBorderPen,
  kind: BorderTargetKind,
): DocumentBorderLine | null {
  return normalizeDocumentBorderLine(
    normalizeDocumentBorderPen(
      pen,
      kind === "textBox"
        ? DEFAULT_DOCUMENT_TEXT_BOX_OUTLINE
        : DEFAULT_DOCUMENT_PARAGRAPH_BORDER,
    ),
  );
}

function paragraphMatchesPreset(
  target: DocumentBorderTarget,
  preset: DocumentParagraphBorderPreset,
  /** Count an edge only when it is already exactly this pen. */
  penLine?: DocumentBorderLine | null,
): boolean | "indeterminate" {
  const results = target.paragraphs.map((entry, index) => {
    const borders = documentParagraphBordersForNode(entry.node);
    const visible = (edge: DocumentParagraphBorderEdge) =>
      documentBorderLineIsVisible(borders?.[edge]) &&
      (!penLine || samePenLine(borders?.[edge], penLine));
    if (preset === "none") {
      return !DOCUMENT_PARAGRAPH_BORDER_EDGES.some(visible);
    }
    if (
      preset === "top" ||
      preset === "right" ||
      preset === "bottom" ||
      preset === "left"
    ) {
      return visible(preset);
    }
    if (preset === "insideH") return visible("between");
    const outside =
      (index !== 0 || visible("top")) &&
      (index !== target.paragraphs.length - 1 || visible("bottom")) &&
      visible("left") &&
      visible("right");
    return preset === "all"
      ? outside && (target.paragraphs.length === 1 || visible("between"))
      : outside;
  });
  if (results.length === 0) return false;
  if (results.every(Boolean)) return true;
  return results.some(Boolean) ? "indeterminate" : false;
}

/**
 * Whether `preset` is already drawn in exactly `pen`. The Borders button takes
 * a border away only then; after a new line style or colour it redraws the
 * border in that pen.
 */
export function documentBorderPresetMatchesPen(
  target: DocumentBorderTarget | null,
  kind: BorderTargetKind,
  preset: DocumentParagraphBorderPreset,
  pen: DocumentBorderPen,
): boolean {
  if (!target || preset === "none") return false;
  const line = penLineFor(pen, kind);
  if (!line) return false;
  if (kind === "textBox") {
    if (!target.textBox || preset !== "outside") return false;
    const outline = normalizeDocumentTextBoxOutline(
      target.textBox.node.attrs.textBoxOutline,
    );
    return documentBorderLineIsVisible(outline) && samePenLine(outline, line);
  }
  return paragraphMatchesPreset(target, preset, line) === true;
}

/**
 * Redraw the borders the target already shows in `pen`, keeping which edges
 * are drawn (one Undo step). "unchanged" when it shows none: the pen then
 * waits for a border preset.
 */
export function restyleDocumentBorders(
  editor: Editor,
  expected: DocumentBorderTarget,
  kind: BorderTargetKind,
  pen: DocumentBorderPen,
): DocumentBorderCommitResult {
  const live = authenticateTarget(editor, expected);
  if (!live) return "rejected";
  const line = penLineFor(pen, kind);
  if (!line) return "rejected";
  let transaction = editor.state.tr;
  let changed = false;
  if (kind === "textBox") {
    if (!live.textBox) return "rejected";
    const current = normalizeDocumentTextBoxOutline(
      live.textBox.node.attrs.textBoxOutline,
    );
    if (!documentBorderLineIsVisible(current) || samePenLine(current, line)) {
      return "unchanged";
    }
    transaction = transaction.setNodeMarkup(
      live.textBox.pos,
      undefined,
      { ...live.textBox.node.attrs, textBoxOutline: line },
      live.textBox.node.marks,
    );
    changed = true;
  } else {
    for (const entry of live.paragraphs) {
      const current = documentParagraphBordersForNode(entry.node);
      if (!current) continue;
      const next: Record<string, DocumentBorderLine> = { ...current };
      let touched = false;
      for (const edge of DOCUMENT_PARAGRAPH_BORDER_EDGES) {
        const existing = current[edge];
        if (!documentBorderLineIsVisible(existing) || samePenLine(existing, line)) {
          continue;
        }
        next[edge] =
          existing?.spacePt !== undefined
            ? { ...line, spacePt: existing.spacePt }
            : line;
        touched = true;
      }
      if (!touched) continue;
      const borders = next as DocumentParagraphBorders;
      transaction = transaction.setNodeMarkup(
        entry.pos,
        undefined,
        {
          ...entry.node.attrs,
          paragraphBorders: borders,
          borderPreset: legacyPresetFromParagraphBorders(borders),
        },
        entry.node.marks,
      );
      changed = true;
    }
  }
  if (!changed) return "unchanged";
  editor.view.dispatch(closeHistory(transaction));
  return "changed";
}

export function documentBorderPresetState(
  target: DocumentBorderTarget | null,
  kind: BorderTargetKind,
  preset: DocumentParagraphBorderPreset,
): boolean | "indeterminate" {
  if (!target) return false;
  if (kind === "textBox") {
    if (!target.textBox || (preset !== "none" && preset !== "outside")) {
      return false;
    }
    const outline = normalizeDocumentTextBoxOutline(
      target.textBox.node.attrs.textBoxOutline,
    );
    const visible = outline ? documentBorderLineIsVisible(outline) : true;
    return preset === "none" ? !visible : visible;
  }
  return paragraphMatchesPreset(target, preset);
}
