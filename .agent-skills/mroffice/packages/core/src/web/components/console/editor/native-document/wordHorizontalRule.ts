/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { normalizeWordHorizontalRule, type WordHorizontalRule as RuleValue } from "../../../../lib/document-word-horizontal-rule";
import { normalizeLineHeightPt, normalizeLineHeightRule } from "../extensions/DocumentFormatting";
import { documentAutoLineMultiplier } from "./documentAutoLineSpacing";
import { fragmentCarries } from "./paged/fragmentRoles";

/**
 * Draws the Word horizontal line an imported paragraph hosts
 * (`wordHorizontalRule`, see lib/document-word-horizontal-rule.ts).
 *
 * Word keeps the line and the text beside it in ONE paragraph (the line is an
 * inline VML object, `o:hr`), and a save writes exactly that: the line's run is
 * kept and the typed text is appended to the same paragraph, so nothing is lost.
 *
 * Word gives the line a line of its own inside the paragraph and lays the
 * paragraph's text out on the lines below it. A paragraph that hosts nothing
 * else therefore lays out exactly one line, which is the line the rule is
 * drawn inside: that host keeps its ordinary empty-line layout and the rule is
 * an absolutely placed pseudo-element that never changes it unless the rule is
 * taller than the line minus Word's 5pt clearance.
 *
 * A host that also carries text reserves that same line ABOVE its text, in the
 * flow, so the page ledger measures the paragraph's real painted height: an
 * absolutely placed line would be drawn over the first row of text and cost
 * the ledger nothing, which is a page whose accounting and paper disagree.
 *
 * A continuation fragment of a split host draws nothing. The rule belongs to
 * the one line Word lays it out on, and that line is in the head.
 */
export const wordHorizontalRuleKey = new PluginKey<DecorationSet>("wordHorizontalRule");

export type Placement =
  | { mode: "auto"; multiplier: number }
  | { mode: "exact"; linePt: number }
  | { mode: "bottom" };

function placement(state: EditorState, block: ProseMirrorNode, position: number): Placement {
  const rule = normalizeLineHeightRule(block.attrs.lineHeightRule);
  const linePt = normalizeLineHeightPt(block.attrs.lineHeightPt);
  if (rule === "exact" && linePt !== null) return { mode: "exact", linePt };
  if (rule === "atLeast" && linePt !== null) return { mode: "bottom" };
  const multiplier = documentAutoLineMultiplier(state, block, position);
  return multiplier === null ? { mode: "bottom" } : { mode: "auto", multiplier };
}

function offsetPercent(rule: RuleValue): number {
  const free = 100 - rule.widthPercent;
  return rule.align === "left" ? 0 : rule.align === "center" ? free / 2 : free;
}

/** A host with text reserves the rule's line in the flow, above that text.
 * Also what a header, footer or shape story line hosting the rule wears
 * (`bandRichDom`), seated at its line's bottom. */
export function ruleAttrs(
  rule: RuleValue,
  where: Placement,
  ownLine: boolean,
): Record<string, string> {
  const vars = [
    `--word-hr-height: ${rule.heightPt}pt`,
    `--word-hr-width: ${rule.widthPercent}%`,
    `--word-hr-offset: ${offsetPercent(rule)}%`,
    ...(where.mode === "auto" ? [`--word-hr-multiplier: ${where.multiplier}`] : []),
    ...(where.mode === "exact" ? [`--word-hr-exact-line: ${where.linePt}pt`] : []),
    ...(rule.color ? [`--word-hr-color: ${rule.color}`] : []),
  ];
  return {
    class: "word-horizontal-rule",
    "data-word-hr-mode": where.mode,
    "data-word-hr-shade": String(rule.shade),
    ...(ownLine ? { "data-word-hr-line": "own" } : {}),
    style: vars.join("; "),
  };
}

/** Per sheet node: a key leaves every other sheet's as it was. */
const sheetsWithRuleAttr = new WeakMap<ProseMirrorNode, boolean>();

function holdsRuleAttr(sheet: ProseMirrorNode): boolean {
  const known = sheetsWithRuleAttr.get(sheet);
  if (known !== undefined) return known;
  let found = sheet.isTextblock && Boolean(sheet.attrs.wordHorizontalRule);
  sheet.descendants((block) => {
    if (found) return false;
    if (!block.isTextblock) return true;
    if (block.attrs.wordHorizontalRule) found = true;
    return false;
  });
  sheetsWithRuleAttr.set(sheet, found);
  return found;
}

export function wordHorizontalRuleDecorations(state: EditorState): DecorationSet {
  // A document with no rule (nearly all) walks no sheet's blocks on a key.
  let anyRule = false;
  for (let index = 0; index < state.doc.childCount && !anyRule; index += 1) anyRule = holdsRuleAttr(state.doc.child(index));
  if (!anyRule) return DecorationSet.empty;
  const decorations: Decoration[] = [];
  state.doc.descendants((block, position) => {
    if (!block.isTextblock) return true;
    // The rule's line is the head's. A continuation fragment carries the host's
    // attrs so the fragments merge back, and drawing a second line there would
    // both duplicate Word's single line and charge the ledger for it twice.
    if (!fragmentCarries("horizontalRule", block.attrs)) return false;
    const rule = normalizeWordHorizontalRule(block.attrs.wordHorizontalRule);
    if (rule) {
      decorations.push(Decoration.node(position, position + block.nodeSize,
        ruleAttrs(rule, placement(state, block, position), block.content.size !== 0)));
    }
    return false;
  });
  return decorations.length ? DecorationSet.create(state.doc, decorations) : DecorationSet.empty;
}

export const WordHorizontalRule = Extension.create({
  name: "wordHorizontalRule",
  addProseMirrorPlugins() {
    return [new Plugin<DecorationSet>({
      key: wordHorizontalRuleKey,
      state: {
        init: (_, state) => wordHorizontalRuleDecorations(state),
        apply: (tr, previous, _oldState, newState) =>
          tr.docChanged ? wordHorizontalRuleDecorations(newState) : previous,
      },
      props: { decorations: (state) => wordHorizontalRuleKey.getState(state) ?? DecorationSet.empty },
    })];
  },
});
