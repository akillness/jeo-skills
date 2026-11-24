"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { HOLDS_HEADING } from "@mrnote/core/web/lib/editor/sheet-facts.ts";
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { computeHeadingNumbers } from "@mrnote/core/web/components/console/editor/native-document/headingNumbering.ts";
import { headingListBullets, headingListNumbers } from "@mrnote/core/web/components/console/editor/native-document/headingListNumbers.ts";
import { normalizeWordDocumentSettings } from "@mrnote/core/web/components/console/editor/native-document/wordDocumentSettings.ts";
import { cssFontFamilyList } from "@mrnote/core/web/lib/css-font-family.ts";
import { fragmentCarries } from "@mrnote/core/web/components/console/editor/native-document/paged/fragmentRoles.ts";

/**
 * Word/WPS MULTILEVEL HEADING auto-numbering — TipTap wiring.
 *
 * ADDITIVE + opt-in: this extension adds ONE global boolean attribute,
 * `headingNumbering`, to the top-level `doc` node, plus a ProseMirror plugin that
 * paints the live number (1 / 1.1 / 1.1.1) as a NON-EDITABLE widget at the start
 * of each heading WHEN the attribute is on. The number is never inserted into the
 * text — it is decoration only — so it is distinct from a typed number and from
 * the destructive list-item approach.
 *
 * OFF (the default) the plugin produces an empty decoration set, so a document
 * without heading numbering renders and exports byte-for-byte as before. The
 * attribute rides the document schema's open doc-attrs passthrough (see
 * lib/native-page-schemas.ts → documentDocAttrsSchema), so existing documents —
 * which carry none — still validate unchanged.
 *
 * The numbers re-derive on every document change (the decoration plugin recomputes
 * from the current heading sequence), so promoting / demoting / inserting /
 * deleting a heading renumbers without drift — mirroring the live Table of
 * Contents and caption numbering.
 */

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    headingNumbering: {
      /** Turn document-wide multilevel heading numbering on/off. */
      setHeadingNumbering: (enabled: boolean) => ReturnType;
      /** Flip document-wide multilevel heading numbering. */
      toggleHeadingNumbering: () => ReturnType;
    };
  }
}

const HEADING_NUMBERING_DATA_ATTR = "data-heading-numbering";

/** Read the doc node's `headingNumbering` flag (defensive boolean coercion). */
export function isHeadingNumberingOn(doc: ProseMirrorNode): boolean {
  return doc.attrs?.headingNumbering === true;
}

/**
 * Build a DecorationSet that renders the live multilevel number before each
 * heading's text, in document order, when numbering is ON. Returns the empty set
 * when OFF so there is zero overhead and zero visual change for a normal
 * document. PURE w.r.t. the document (reads positions + levels only).
 */
export function buildHeadingNumberDecorations(
  doc: ProseMirrorNode,
): DecorationSet {
  if (!isHeadingNumberingOn(doc)) return buildHeadingListNumberDecorations(doc);

  const headingPositions: { pos: number; level: number }[] = [];
  HOLDS_HEADING.descendants(doc, (node, pos) => {
    if (
      node.type.name === "heading" &&
      fragmentCarries("listLabel", node.attrs)
    ) {
      const level = node.attrs?.level;
      headingPositions.push({
        pos,
        level: typeof level === "number" ? level : 1,
      });
    }
    return true;
  });

  if (headingPositions.length === 0) return DecorationSet.empty;

  const numbers = computeHeadingNumbers(
    headingPositions.map((h) => ({ level: h.level })),
  );

  const decorations: Decoration[] = [];
  headingPositions.forEach((heading, index) => {
    const number = numbers[index];
    if (!number) return;
    // A widget at pos+1 sits just inside the heading, before its first text.
    // side:-1 keeps it left of the caret so typing at the heading start does not
    // land inside the (non-editable) number. The widget is contentEditable=false
    // and marked ignore-mutation so ProseMirror never tries to read text from it.
    decorations.push(
      Decoration.widget(
        heading.pos + 1,
        () => {
          const span = document.createElement("span");
          span.className = "mrnote-heading-number";
          span.setAttribute("contenteditable", "false");
          span.setAttribute("data-testid", "document-heading-number");
          // textContent (never innerHTML) — the number is pure digits/dots from
          // computeHeadingNumbers, but we stay defensive against any DOM-injection.
          span.textContent = `${number} `;
          return span;
        },
        {
          side: -1,
          ignoreSelection: true,
          key: `heading-number-${number}-${index}`,
        },
      ),
    );
  });

  return DecorationSet.create(doc, decorations);
}

/**
 * The numbers a Word numbering gives imported headings (headingListNumbers):
 * the number sits in the heading's hanging indent and its tab reaches the
 * text's indent, as Word draws a numbered heading; a space or nothing
 * follows instead when the level says so.
 */
/**
 * The look Word draws a heading's number in: the paragraph mark's run, which
 * is the heading style's look -- here read from the heading's first run, the
 * text the style formats. The widget otherwise took the heading element's
 * own stylesheet look (the editor's bold black heading face), not the
 * document's: "Article I." stood in black Calibri before gray Cambria text.
 */
export function headingNumberLook(node: ProseMirrorNode | null | undefined): string {
  // The first text, past the inline atoms that draw nothing before it (Word's
  // rendered page break mark opening the heading of a new page, corpus
  // R324-D01: "1" stood in the document's Times before the Arial heading).
  // `window.__docsHeadingNumberFirstChildLook = true` asks the older look
  // (the first child only) for an A/B of one build.
  const firstChildOnly = typeof window !== "undefined" && (window as Window & { __docsHeadingNumberFirstChildLook?: boolean }).__docsHeadingNumberFirstChildLook === true;
  let first: ProseMirrorNode | null = null;
  if (firstChildOnly) {
    if (node?.firstChild?.isText) first = node.firstChild;
  } else {
    node?.forEach((child) => {
      if (!first && child.isText) first = child;
    });
  }
  if (!first) return "";
  const text: ProseMirrorNode = first;
  const parts: string[] = [];
  for (const mark of text.marks) {
    const attrs = mark.attrs as Record<string, unknown>;
    switch (mark.type.name) {
      case "fontFamily":
        if (typeof attrs.family === "string" && attrs.family) parts.push(`font-family:${cssFontFamilyList(attrs.family)}`);
        break;
      case "fontSize":
        if (typeof attrs.size === "string" && /^\d+(\.\d+)?(px|pt)$/.test(attrs.size)) parts.push(`font-size:${attrs.size}`);
        break;
      case "textColor":
        if (typeof attrs.color === "string" && /^#[0-9a-f]{3,8}$/i.test(attrs.color)) parts.push(`color:${attrs.color}`);
        break;
      case "bold":
        parts.push(`font-weight:${attrs.value === false ? 400 : 700}`);
        break;
      case "italic":
        parts.push(`font-style:${attrs.value === false ? "normal" : "italic"}`);
        break;
    }
  }
  return parts.join(";");
}

/** Word's default tab interval for this document, in points. */
function defaultTabStopPt(doc: ProseMirrorNode): number {
  const twips = normalizeWordDocumentSettings(doc.attrs.wordSettings)?.defaultTabStopTwips;
  return typeof twips === "number" && twips > 0 ? twips / 20 : 36;
}

function buildHeadingListNumberDecorations(doc: ProseMirrorNode): DecorationSet {
  const numbers = new Map<number, { label: string; suffix: string; font?: string | null }>(headingListNumbers(doc));
  for (const [pos, bullet] of headingListBullets(doc)) if (!numbers.has(pos)) numbers.set(pos, bullet);
  if (numbers.size === 0) return DecorationSet.empty;
  const decorations: Decoration[] = [];
  const tabStopPt = defaultTabStopPt(doc);
  let index = 0;
  for (const [pos, number] of numbers) {
    const node = doc.nodeAt(pos);
    const firstLine = Number(node?.attrs?.firstLineIndentPt);
    const hanging = Number.isFinite(firstLine) && firstLine < 0 ? -firstLine : 0;
    const look = headingNumberLook(node);
    const font = number.font ?? null;
    const key = `heading-list-number-${number.label}-${number.suffix}-${hanging}-${look}-${font ?? ""}-${tabStopPt}-${index}`;
    index += 1;
    decorations.push(
      Decoration.widget(
        pos + 1,
        () => {
          const span = document.createElement("span");
          span.className = "mrnote-heading-number mrnote-heading-number--list";
          span.setAttribute("contenteditable", "false");
          span.setAttribute("data-testid", "document-heading-number");
          span.setAttribute("data-suffix", number.suffix);
          span.textContent = number.suffix === "space" ? `${number.label} ` : number.label;
          if (look) span.style.cssText = look;
          // A bullet's symbol font draws its glyph, as a bullet list's does.
          if (font) span.style.fontFamily = cssFontFamilyList(font);
          if (number.suffix === "tab" && hanging > 0) span.style.minWidth = `${hanging}pt`;
          else if (number.suffix === "tab") {
            // No hanging indent to reach: Word's tab after the number goes on
            // to the next default stop (36pt apart unless the document says
            // otherwise), counted from where the number starts.
            // Stops count from the margin; the number starts at the
            // paragraph's first-line indent.
            const left = Number(node?.attrs?.indentLeftPt);
            const startPt = (Number.isFinite(left) ? left : 0) + (Number.isFinite(firstLine) ? firstLine : 0);
            span.dataset.defaultTab = "true";
            requestAnimationFrame(() => {
              if (!span.isConnected) return;
              span.style.paddingRight = "0";
              const endPt = startPt + (span.offsetWidth * 72) / 96;
              span.style.paddingRight = "";
              const stop = Math.floor(endPt / tabStopPt + 1e-6) * tabStopPt + tabStopPt;
              span.style.minWidth = `${stop - startPt}pt`;
            });
          }
          return span;
        },
        // The number of a Word numbering stands in its heading's line as a
        // run does; it owns no line box of its own (documentAutoLineSafety).
        { side: -1, ignoreSelection: true, key, headingListNumber: true },
      ),
    );
  }
  return DecorationSet.create(doc, decorations);
}

const headingNumberingPluginKey = new PluginKey("headingNumbering");

const HeadingNumbering = Extension.create({
  name: "headingNumbering",

  addGlobalAttributes() {
    return [
      {
        // The flag lives on the top-level doc node (one per document).
        types: ["doc"],
        attributes: {
          headingNumbering: {
            default: false,
            parseHTML: (element) =>
              element.getAttribute(HEADING_NUMBERING_DATA_ATTR) === "true",
            renderHTML: (attributes) =>
              (attributes as { headingNumbering?: unknown })
                .headingNumbering === true
                ? { [HEADING_NUMBERING_DATA_ATTR]: "true" }
                : {},
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      // The flag lives on the top-level `doc` node, so it is set through
      // ProseMirror's DocAttrStep (`tr.setDocAttribute`) — the same mechanism the
      // page-setup doc attributes use. `updateAttributes("doc", …)` would NOT work
      // (the doc node is never in a node selection).
      setHeadingNumbering:
        (enabled: boolean) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setDocAttribute("headingNumbering", enabled === true);
          }
          return true;
        },
      toggleHeadingNumbering:
        () =>
        ({ editor, tr, dispatch }) => {
          if (dispatch) {
            tr.setDocAttribute(
              "headingNumbering",
              !isHeadingNumberingOn(editor.state.doc),
            );
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: headingNumberingPluginKey,
        props: {
          decorations(state) {
            return buildHeadingNumberDecorations(state.doc);
          },
        },
      }),
    ];
  },
});

export default HeadingNumbering;
