/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Node as PmNode } from "@tiptap/pm/model";

import { bulletGlyph, normalizeBulletStyle, type BulletStyleType } from "@mrnote/core/web/components/console/editor/native-document/bulletListStyle.ts";
import { computeHeadingNumbers } from "@mrnote/core/web/components/console/editor/native-document/headingNumbering.ts";
import { explicitOrderedListLevel, probeListNumbering } from "@mrnote/core/web/components/console/editor/native-document/listDefinitionMarkers.ts";
import { normalizeListDefinition } from "@mrnote/core/web/components/console/editor/native-document/listLevelDefinition.ts";
import {
  DEFAULT_LIST_STYLE,
  normalizeListStart,
  normalizeListStyleType,
  outlinePrefix,
  type ListStyleType,
} from "@mrnote/core/web/components/console/editor/native-document/listNumbering.ts";
import { fragmentCarries } from "@mrnote/core/web/components/console/editor/native-document/paged/fragmentRoles.ts";

/**
 * The list labels a document draws, as text: textblock position → the number
 * or bullet in front of it. Word's Word Count counts a list label as the text
 * it shows followed by a tab (Word 16.86, `compute statistics`): "1." is one
 * word and two characters, the tab one more with spaces; the Symbol bullet
 * is one character and no word (a bullet separates words); "o", "▪" and "○"
 * are a word each. An empty numbered paragraph still counts its label.
 *
 * Defined lists and numbered headings take the text their markers draw
 * (listDefinitionMarkers.ts); gallery lists the number their counters show,
 * in the scheme they are drawn and exported with; document-wide heading
 * numbering its "1.2" numbers.
 */

/** Word's default bullets by level: Symbol •, Courier New o, Wingdings ▪. */
const DEFAULT_BULLET_CYCLE: readonly BulletStyleType[] = ["disc", "circle", "square"];

/** Symbol's bullet (U+F0B7) is the bullet U+2022 Word counts as no word. */
function countedGlyph(glyph: string): string {
  return glyph.replace(//gu, "•");
}

interface Scope {
  /** 0-based ordinals of the ordered items this list sits in, outermost first. */
  orderedPath: readonly number[];
  /** Ordered lists directly above (ol > li > ol), the default scheme's level. */
  orderedDepth: number;
  /** Bullet lists above, the default bullet's level. */
  bulletDepth: number;
  /** The scheme an ordered list above was given, which its sublists draw in. */
  style: ListStyleType | null;
}

const labelCache = new WeakMap<PmNode, ReadonlyMap<number, string>>();

export function documentListLabels(doc: PmNode): ReadonlyMap<number, string> {
  const cached = labelCache.get(doc);
  if (cached) return cached;
  const labels = new Map<number, string>();
  if (!holdsLabels(doc)) {
    labelCache.set(doc, labels);
    return labels;
  }
  const probe = probeListNumbering(doc, labels);
  const visitList = (list: PmNode, listPos: number, scope: Scope): void => {
    const name = list.type.name;
    // A defined numbering draws (and labels) its own items and sublists.
    if (name === "orderedList" && normalizeListDefinition(list.attrs.listDefinition)) return;
    const ordered = name === "orderedList";
    const bullets = name === "bulletList";
    const ownStyle = ordered ? normalizeListStyleType(list.attrs.listStyleType) : null;
    const style = ownStyle && ownStyle !== DEFAULT_LIST_STYLE ? ownStyle : scope.style;
    const level = ordered
      ? (explicitOrderedListLevel(list) ?? scope.orderedDepth)
      : bullets
        ? // A bullet list states its level in the same `listLevel` attribute.
          (explicitOrderedListLevel(list) ?? scope.bulletDepth)
        : 0;
    let ordinal = ordered
      ? (probe.firstValue.get(listPos) ?? normalizeListStart(list.attrs.start) ?? 1)
      : 0;
    const glyph = bullets ? bulletLabel(list, level) : null;
    list.forEach((item, offset) => {
      if (item.type.name !== "listItem") return;
      const itemPos = listPos + 1 + offset;
      const continuation = item.attrs.pageSplitItemContinuation === true;
      const own = ordinal;
      if (!continuation) {
        const first = item.firstChild;
        const paragraphPos = itemPos + 1;
        if (first?.isTextblock && !labels.has(paragraphPos)) {
          if (ordered) {
            const path = [...(level > 0 ? scope.orderedPath.slice(-level) : []), Math.max(0, own - 1)];
            while (path.length < level + 1) path.unshift(0);
            labels.set(paragraphPos, outlinePrefix(style ?? DEFAULT_LIST_STYLE, path));
          } else if (glyph) {
            labels.set(paragraphPos, glyph);
          }
        }
        if (ordered) ordinal += 1;
      }
      item.forEach((child, childOffset) => {
        const childName = child.type.name;
        if (childName !== "orderedList" && childName !== "bulletList" && childName !== "taskList")
          return;
        visitList(child, itemPos + 1 + childOffset, {
          orderedPath: ordered ? [...scope.orderedPath, Math.max(0, own - 1)] : scope.orderedPath,
          orderedDepth: ordered && childName === "orderedList" ? level + 1 : 0,
          bulletDepth: scope.bulletDepth + (bullets ? 1 : 0),
          style: ordered ? style : scope.style,
        });
      });
    });
  };
  const headings: { pos: number; level: number }[] = [];
  const headingNumbering = doc.attrs?.headingNumbering === true;
  doc.descendants((node, pos) => {
    const name = node.type.name;
    if (name === "orderedList" || name === "bulletList" || name === "taskList") {
      visitList(node, pos, { orderedPath: [], orderedDepth: 0, bulletDepth: 0, style: null });
      return false;
    }
    if (name === "heading" && headingNumbering && fragmentCarries("listLabel", node.attrs)) {
      headings.push({ pos, level: typeof node.attrs.level === "number" ? node.attrs.level : 1 });
      return false;
    }
    return !node.isTextblock;
  });
  if (headings.length) {
    computeHeadingNumbers(headings).forEach((number, index) => {
      if (number) labels.set(headings[index].pos, number);
    });
  }
  for (const [pos, text] of labels) labels.set(pos, countedGlyph(text));
  labelCache.set(doc, labels);
  return labels;
}

/** The bullet a gallery bullet list draws at `level`, or null for none. */
function bulletLabel(list: PmNode, level: number): string | null {
  // A picture bullet is a picture, and a missing one draws nothing.
  if (list.attrs.bulletPicture != null) return null;
  const own = list.attrs.bulletGlyph;
  if (typeof own === "string" && own) return own;
  const style = normalizeBulletStyle(list.attrs.bulletStyle);
  return style !== "disc"
    ? bulletGlyph(style)
    : bulletGlyph(DEFAULT_BULLET_CYCLE[level % DEFAULT_BULLET_CYCLE.length]);
}

/** Cheap early exit: no list and no numbered heading, no labels. */
function holdsLabels(doc: PmNode): boolean {
  if (doc.attrs?.headingNumbering === true) return true;
  let found = false;
  doc.descendants((node) => {
    if (found) return false;
    const name = node.type.name;
    if (name === "orderedList" || name === "bulletList") found = true;
    else if (name === "heading" && node.attrs.listKind != null) found = true;
    return !found && !node.isTextblock;
  });
  return found;
}
