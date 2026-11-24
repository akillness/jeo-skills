/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Node, mergeAttributes, type Editor } from "@tiptap/core";
import {
  breakNodeOf,
  insertTopLevelBreak,
  reportBreakRefusal,
} from "../native-document/breakPlacement";
import { closeHistory } from "@tiptap/pm/history";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";

import {
  insertSectionLayoutAtSelection,
  removePrecedingSectionLayout,
} from "../native-document/sectionLayouts";
import { sectionLayoutBoundarySyncPlugin } from "../native-document/sectionLayoutBoundarySync";
import { sectionStoryBoundarySyncPlugin } from "../native-document/sectionStoryBoundarySync";
import { reportSectionLayoutStructureFailure } from "../native-document/sectionLayoutRepair";
import { COLLABORATIVE_DOCUMENT_SECTION_MUTATION_META } from "../native-document/collaborationDocumentAttrs";

/**
 * The four Word/WPS section-break kinds (Layout ▸ Breaks ▸ Section Breaks):
 * - `nextPage`   — the next section starts on a new page (the default).
 * - `continuous` — the section changes WITHOUT a page break (Word's classic way
 *                  to switch newspaper-column count mid-page; pairs with the
 *                  document's `<w:cols>`).
 * - `evenPage` / `oddPage` — the next section starts on the next even / odd page.
 *
 * On our continuous-scroll (non-paginated) canvas the page-starting kinds all
 * render the same labelled divider; the distinction is preserved through the
 * model + DOCX export (`w:sectPr w:type`). Continuous renders a distinct dotted
 * divider and forces NO page break.
 */
export type SectionBreakType =
  | "nextPage"
  | "continuous"
  | "evenPage"
  | "oddPage"
  | "nextColumn";

const SECTION_BREAK_TYPES: readonly SectionBreakType[] = [
  "nextPage",
  "continuous",
  "evenPage",
  "oddPage",
  // Word's "New column" section start (`w:type nextColumn`), written by the
  // Columns dialog's "Start new column": the next section begins at the top
  // of the next column (on a single-column page, the next page).
  "nextColumn",
];

export function isSectionBreakType(value: unknown): value is SectionBreakType {
  return (
    typeof value === "string" &&
    (SECTION_BREAK_TYPES as readonly string[]).includes(value)
  );
}

/** Coerce an arbitrary value to a valid section-break kind (default next-page). */
export function normalizeSectionBreakType(value: unknown): SectionBreakType {
  return isSectionBreakType(value) ? value : "nextPage";
}

type SectionBreakDeleteDirection = "backward" | "forward";

interface FlowBlock {
  node: ProseMirrorNode;
  parent: ProseMirrorNode;
  pos: number;
}

interface LiveSectionBreakTarget {
  node: ProseMirrorNode;
  pos: number;
}

type LiveSectionBreakResolution =
  | { kind: "none" }
  | { kind: "ambiguous" }
  | ({ kind: "target" } & LiveSectionBreakTarget);

/**
 * Flatten only editable textblocks and block atoms. Physical pageBlock wrappers
 * deliberately disappear from this flow, so Backspace immediately after a
 * forced page-starting break still sees the exact preceding sectionBreak atom.
 */
function flowBlocks(doc: ProseMirrorNode): FlowBlock[] {
  const blocks: FlowBlock[] = [];
  doc.descendants((node, pos) => {
    if (node.isTextblock || (node.isBlock && node.isLeaf)) {
      blocks.push({ node, parent: doc.resolve(pos).parent, pos });
      return false;
    }
    return true;
  });
  return blocks;
}

function resolveLiveSectionBreakTarget(
  editor: Editor,
  direction: SectionBreakDeleteDirection,
): LiveSectionBreakResolution {
  const { doc, selection } = editor.state;
  if (
    selection instanceof NodeSelection &&
    selection.node.type.name === "sectionBreak"
  ) {
    const node = doc.nodeAt(selection.from);
    return node === selection.node
      ? { kind: "target", node, pos: selection.from }
      : { kind: "ambiguous" };
  }
  if (!(selection instanceof TextSelection) || !selection.empty) {
    // A selection that spans section breaks (Select All included) is deleted
    // by the generic keymap, as Word deletes it: the section-layout boundary
    // plugin commits the merged chain in the same transaction, so the merged
    // section keeps the following section's properties.
    return { kind: "none" };
  }

  const blocks = flowBlocks(doc);
  const matches: LiveSectionBreakTarget[] = [];
  for (let index = 0; index < blocks.length; index += 1) {
    const current = blocks[index];
    if (current.node.type.name !== "sectionBreak") continue;
    const adjacent =
      direction === "backward" ? blocks[index + 1] : blocks[index - 1];
    if (!adjacent?.node.isTextblock) continue;
    const sameFlowContainer =
      current.parent === adjacent.parent ||
      (current.parent.type.name === "pageBlock" &&
        adjacent.parent.type.name === "pageBlock");
    if (!sameFlowContainer) continue;
    const exactCaret =
      direction === "backward"
        ? adjacent.pos + 1
        : adjacent.pos + adjacent.node.nodeSize - 1;
    if (selection.from === exactCaret) {
      matches.push({ node: current.node, pos: current.pos });
    }
  }
  if (matches.length === 0) return { kind: "none" };
  if (matches.length !== 1) return { kind: "ambiguous" };
  return { kind: "target", ...matches[0] };
}

function countSectionBreaks(doc: ProseMirrorNode): number {
  let count = 0;
  doc.descendants((node) => {
    if (node.type.name === "sectionBreak") count += 1;
    return true;
  });
  return count;
}

function deleteLiveSectionBreak(
  editor: Editor,
  direction: SectionBreakDeleteDirection,
): boolean {
  if (editor.isDestroyed) return false;
  const resolved = resolveLiveSectionBreakTarget(editor, direction);
  if (resolved.kind === "none") return false;
  // Once the key is known to target (or ambiguously target) a section break,
  // consume every unsafe path so a lower-priority generic keymap cannot delete
  // the atom without updating the ordered section-layout identity.
  if (resolved.kind === "ambiguous" || !editor.isEditable) return true;

  const snapshot = editor.state;
  const rawType = resolved.node.attrs.breakType;
  if (!isSectionBreakType(rawType)) return true;
  const update = removePrecedingSectionLayout(snapshot, resolved.pos);
  if (!update) {
    reportSectionLayoutStructureFailure(editor, snapshot.doc);
    return true;
  }

  const live = editor.state;
  const liveNode = live.doc.nodeAt(resolved.pos);
  if (
    editor.isDestroyed ||
    !editor.isEditable ||
    live.doc !== snapshot.doc ||
    !live.selection.eq(snapshot.selection) ||
    liveNode !== resolved.node ||
    liveNode?.type.name !== "sectionBreak" ||
    liveNode.attrs.breakType !== rawType
  ) {
    return true;
  }

  try {
    const transaction = live.tr
      .delete(resolved.pos, resolved.pos + resolved.node.nodeSize)
      .setDocAttribute("sectionLayouts", update.layouts)
      .setMeta(COLLABORATIVE_DOCUMENT_SECTION_MUTATION_META, {
        type: "delete",
        index: update.sectionIndex,
      });
    if (countSectionBreaks(transaction.doc) + 1 !== update.sectionCount) {
      return true;
    }
    editor.view.dispatch(closeHistory(transaction));
  } catch {
    return true;
  }
  return true;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    sectionBreak: {
      /**
       * Insert a section break (default next-page) at the current selection.
       * Pass a {@link SectionBreakType} for a continuous / even / odd break.
       */
      setSectionBreak: (breakType?: SectionBreakType) => ReturnType;
    };
  }
}

/**
 * A SECTION break — Word/WPS parity (Word 分节符). A leaf block (like the page
 * break) that renders a labelled divider on screen and marks a section boundary.
 * Its `breakType` selects the Word section-break kind (next-page / continuous /
 * even / odd); the next-page kinds always start the following content on a new
 * page, while a continuous break changes the section in place (used to switch
 * newspaper-column count mid-page).
 *
 * Unlike the plain page break, a section break ENDS a section in OOXML — on
 * export it emits a `<w:sectPr w:type="…">` (carried by the preceding paragraph
 * or a dedicated empty paragraph), so Word renders a real section break of the
 * matching kind. Per-section different headers/margins remain a documented
 * follow-up; this node carries the boundary + its kind.
 *
 * Persisted as `<div data-type="section-break" data-break-type="…">` so it
 * survives the HTML round-trip used by import/export (the default next-page kind
 * omits the attribute, keeping a pre-existing deck byte-for-byte), and is
 * registered in the schema via the native-document plugin registry. Insertion
 * goes through the `setSectionBreak` command, surfaced by the toolbar + slash
 * menu.
 */
/**
 * The section break at a collapsed caret in a text block that sits directly
 * on its page (or document). False when the caret is anywhere else.
 */
function placeSectionBreakInParagraph(
  tr: import("@tiptap/pm/state").Transaction,
  breakNode: ProseMirrorNode,
): boolean {
  const { selection } = tr;
  if (!(selection instanceof TextSelection) || !selection.empty) return false;
  const { $from } = selection;
  if (!$from.parent.isTextblock || $from.depth < 1) return false;
  const holder = $from.node($from.depth - 1);
  if (holder.type.name !== "pageBlock" && holder.type.name !== "doc") return false;
  if ($from.parentOffset === 0) {
    const at = $from.before();
    tr.insert(at, breakNode);
    tr.setSelection(TextSelection.create(tr.doc, at + breakNode.nodeSize + 1));
    return true;
  }
  const caret = $from.pos;
  tr.split(caret);
  // </p> closes the head at `caret`; the break goes between the halves.
  const boundary = caret + 1;
  tr.insert(boundary, breakNode);
  tr.setSelection(TextSelection.create(tr.doc, boundary + breakNode.nodeSize + 1));
  return true;
}

const SectionBreak = Node.create({
  name: "sectionBreak",
  group: "block",
  // No editable content; this is a leaf divider like the page break.
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      breakType: {
        default: "nextPage",
        parseHTML: (element) =>
          normalizeSectionBreakType(element.getAttribute("data-break-type")),
        // Emitted by the node's renderHTML below so the DEFAULT next-page kind
        // omits the attribute entirely (byte-stable for pre-existing documents).
        renderHTML: () => ({}),
      },
      // The space after (points) of the dedicated empty paragraph an imported
      // continuous break was read from: Word takes it off the next section's
      // first space before (paragraphSpacingAddsUp's CARRIER_GAP_ATTR).
      carrierSpaceAfter: {
        default: null,
        parseHTML: (element) => {
          const value = Number.parseFloat(element.getAttribute("data-carrier-space-after") ?? "");
          return Number.isFinite(value) && value >= 0 && value <= 1584 ? value : null;
        },
        renderHTML: (attributes) =>
          typeof attributes.carrierSpaceAfter === "number"
            ? { "data-carrier-space-after": String(attributes.carrierSpaceAfter) }
            : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="section-break"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const breakType = normalizeSectionBreakType(node.attrs.breakType);
    const continuous = breakType === "continuous";
    const attrs: Record<string, string> = {
      "data-type": "section-break",
      class: continuous
        ? "note-editor-section-break is-continuous"
        : "note-editor-section-break",
      // A continuous break must NOT force a page break; the page-starting kinds
      // map to the print page-break idiom so the break survives a stylesheet-less
      // export.
      style: continuous ? "" : "page-break-before: always; break-before: page;",
      "aria-hidden": "true",
      contenteditable: "false",
    };
    // Only the non-default kinds persist the attribute (keeps next-page stable).
    if (breakType !== "nextPage") attrs["data-break-type"] = breakType;
    return ["div", mergeAttributes(HTMLAttributes, attrs)];
  },

  addCommands() {
    return {
      setSectionBreak:
        (breakType: SectionBreakType = "nextPage") =>
        ({ commands, dispatch, editor, tr }) => {
          const failClosed = () => {
            tr.setMeta("preventDispatch", true);
            return false;
          };
          if (
            editor.isDestroyed ||
            !editor.isEditable ||
            !isSectionBreakType(breakType) ||
            !(tr.selection instanceof TextSelection) ||
            !tr.selection.empty
          ) {
            return failClosed();
          }

          const live = editor.state;
          if (tr.doc !== live.doc || !tr.selection.eq(live.selection)) {
            return failClosed();
          }
          const update = insertSectionLayoutAtSelection(live);
          if (!update) {
            if (dispatch) reportSectionLayoutStructureFailure(editor, live.doc);
            return failClosed();
          }
          if (!dispatch) return true;

          // In a list, quote, callout or table the break ends the section at
          // a top-level block, where Word holds it (breakPlacement); a box
          // that cannot hold a section boundary refuses it with a reason.
          const breakNode = breakNodeOf(live, this.name, { breakType });
          const placed = breakNode ? insertTopLevelBreak(tr, breakNode) : null;
          if (placed?.kind === "refused") {
            reportBreakRefusal(editor, placed.reason);
            return failClosed();
          }
          // In a paragraph directly on the page the break ends the paragraph
          // the caret's words before it belong to, as Word holds it in that
          // paragraph's mark: at the paragraph's start it goes before the
          // paragraph, elsewhere the paragraph is split at the caret and the
          // tail starts the next section -- an empty one only when the caret
          // was at the end. Inserted as [break, empty paragraph], the break
          // left an extra empty line at the top of every new section (WUA 102).
          const placedInParagraph =
            placed?.kind !== "placed" && breakNode
              ? placeSectionBreakInParagraph(tr, breakNode)
              : false;
          // Elsewhere the break AND a trailing paragraph, so the caret has
          // somewhere to land on the "next section": without it, an atom leaf
          // is the last node and the selection is stranded on the break.
          const inserted =
            placed?.kind === "placed" ||
            placedInParagraph ||
            commands.insertContent([
              { type: this.name, attrs: { breakType } },
              { type: "paragraph" },
            ]);
          if (
            !inserted ||
            editor.isDestroyed ||
            !editor.isEditable ||
            editor.state.doc !== live.doc ||
            !editor.state.selection.eq(live.selection) ||
            countSectionBreaks(tr.doc) + 1 !== update.sectionCount
          ) {
            return failClosed();
          }
          tr.setDocAttribute("sectionLayouts", update.layouts);
          tr.setMeta(COLLABORATIVE_DOCUMENT_SECTION_MUTATION_META, {
            type: "insert",
            index: update.sectionIndex + 1,
          });
          closeHistory(tr);
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => deleteLiveSectionBreak(editor, "backward"),
      Delete: ({ editor }) => deleteLiveSectionBreak(editor, "forward"),
    };
  },

  addProseMirrorPlugins() {
    // Every other path that adds, removes or moves a break (paste, drop, cut,
    // typing over a selection, AI inserts, the per-page header/footer
    // boundary) commits the section-layout chain in the same dispatch.
    // Header/footer stories follow the same boundaries (Word: a new section
    // starts linked to the previous one; a deleted break keeps the second
    // section's headers).
    return [sectionLayoutBoundarySyncPlugin(), sectionStoryBoundarySyncPlugin()];
  },
});

export default SectionBreak;
