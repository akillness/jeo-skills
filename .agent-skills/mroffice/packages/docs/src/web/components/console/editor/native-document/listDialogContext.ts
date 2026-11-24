/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * What Word's list dialogs open on: the list (or listed heading) at the
 * selection, read once when a dialog opens. PURE over the editor state.
 */

import type { EditorState } from "@tiptap/pm/state";

import { normalizeBulletStyle } from "@mrnote/core/web/components/console/editor/native-document/bulletListStyle.ts";
import { normalizeBulletAlign } from "./bulletListExtension";
import type { DocumentListDialogContext } from "./DocumentListDefinitionDialogs";
import {
  headingListAtSelection,
  headingListDefinition,
  normalizeListLevel,
  probeListNumbering,
} from "@mrnote/core/web/components/console/editor/native-document/listDefinitionMarkers.ts";
import {
  normalizeDocumentListStyles,
  normalizeListDefinition,
  presetListDefinition,
} from "@mrnote/core/web/components/console/editor/native-document/listLevelDefinition.ts";
import { normalizeListStart, normalizeListStyleType } from "@mrnote/core/web/components/console/editor/native-document/listNumbering.ts";
import {
  orderedListItemAtSelection,
  outermostOrderedList,
} from "./orderedListExtension";

export function documentListDialogContext(
  state: EditorState,
): DocumentListDialogContext {
  const $from = state.selection.$from;
  let bullet: Record<string, unknown> | null = null;
  let level = -1;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    const name = node.type.name;
    if (name === "tableCell" || name === "tableHeader") break;
    if (name === "listItem" || name === "taskItem") level += 1;
    if (name === "bulletList" && !bullet) bullet = node.attrs;
  }
  const heading = headingListAtSelection(state);
  const root = outermostOrderedList(state);
  const item = orderedListItemAtSelection(state);
  const probe = probeListNumbering(state.doc);
  const listStyles = normalizeDocumentListStyles(state.doc.attrs.listStyles);

  const orderedStyle = normalizeListStyleType(
    heading?.node.attrs.listKind === "ordered"
      ? heading.node.attrs.listStyle
      : root?.node.attrs.listStyleType,
  );
  const definition =
    (heading && headingListDefinition(heading.node.attrs)) ??
    normalizeListDefinition(root?.node.attrs.listDefinition) ??
    presetListDefinition(orderedStyle);

  let numbering: DocumentListDialogContext["numbering"] = {
    value: 1,
    first: true,
    continueValue: null,
    continuing: false,
  };
  if (heading && heading.node.attrs.listKind === "ordered") {
    numbering = {
      value: probe.values.get(heading.pos) ?? 1,
      first: true,
      continueValue: null,
      continuing: heading.node.attrs.listContinue === true,
    };
  } else if (item) {
    const paragraphPos = $from.before($from.depth);
    const firstValue =
      probe.firstValue.get(item.listPos) ??
      normalizeListStart(item.list.attrs.start) ??
      1;
    numbering = {
      value:
        probe.values.get(paragraphPos) ??
        (item.root ? firstValue + item.index : item.index + 1),
      first: item.index === 0,
      continueValue: item.root
        ? (probe.continueValue.get(item.listPos) ?? null)
        : null,
      continuing: item.list.attrs.listContinue === true,
    };
  }
  // A bulleted heading holds its bullet itself (its listStyle, or a custom
  // glyph in its own definition); it has no bulletList ancestor, and the
  
  const headingBullet =
    heading && heading.node.attrs.listKind === "bullet"
      ? {
          bulletStyle: heading.node.attrs.listStyle,
          bulletGlyph: normalizeListDefinition(heading.node.attrs.listDefinition)?.levels[0]?.text ?? null,
          bulletFont: normalizeListDefinition(heading.node.attrs.listDefinition)?.levels[0]?.font ?? null,
          bulletAlign: normalizeListDefinition(heading.node.attrs.listDefinition)?.levels[0]?.align ?? null,
        }
      : null;
  if (headingBullet) bullet = headingBullet;
  const bulletAlign = normalizeBulletAlign(bullet?.bulletAlign) ?? "left";
  return {
    bulletStyle: normalizeBulletStyle(bullet?.bulletStyle),
    bulletGlyph:
      typeof bullet?.bulletGlyph === "string" && bullet.bulletGlyph
        ? bullet.bulletGlyph
        : null,
    bulletFont:
      typeof bullet?.bulletFont === "string" && bullet.bulletFont
        ? bullet.bulletFont
        : null,
    bulletAlign,
    orderedStyle,
    definition,
    // The level a definition draws the item at is Word's `w:ilvl`; an
    // imported list can start below level 1 or skip one, so nesting depth
    // is only the fallback.
    level: heading
      ? normalizeListLevel(heading.node.attrs.listLevel)
      : (probe.levels.get($from.before($from.depth)) ??
        Math.min(Math.max(level, 0), 8)),
    start:
      (heading
        ? normalizeListStart(heading.node.attrs.listStart)
        : normalizeListStart(root?.node.attrs.start)) ??
      definition.levels[0].start,
    numbering,
    listStyles,
  };
}
