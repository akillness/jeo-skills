/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Two paragraphs joined keep the field marks the second one's tail holds.
 *
 * A field whose result spans paragraphs is no atom of the page: its first
 * and last paragraphs carry its begin and end (`source.nativeFieldSpan`),
 * and the save writes the field characters from the package. A join
 * (Backspace at a paragraph's start, Delete at its end, a selection deleted
 * from inside one paragraph into the next) keeps the first paragraph's node
 * and drops the second's attributes, so a field's end that stood at the end
 * of the second paragraph -- and a next field's begin right after it -- left
 * the page while the file kept both (corpus R492-D36 E6: one list of figures
 * ends after its last row's page number and the next opens in the same
 * paragraph; the rows joined, the page held one field end too few). Word
 * keeps the end of the second paragraph, field characters included, in the
 * merged one; so does the page now, when the merged paragraph states no span
 * of its own.
 */
import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode, Slice } from "@tiptap/pm/model";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { ReplaceStep } from "@tiptap/pm/transform";

type FieldSpan = { role?: unknown; at?: unknown; then?: unknown; thenAt?: unknown };

function fieldSpanOf(node: ProseMirrorNode): FieldSpan | null {
  const source = node.attrs?.source as { nativeFieldSpan?: unknown } | null | undefined;
  const span = source?.nativeFieldSpan;
  return span && typeof span === "object" && !Array.isArray(span) ? (span as FieldSpan) : null;
}

/**
 * The span marks of a paragraph that stand at its END, where a join keeps
 * them: a field's end after its words (and the next field's begin right after
 * it), or a field that opens at the paragraph's end. An end at the
 * paragraph's start, or a begin before its words, went with the words a join
 * deleted, or stands inside the merged line now: neither is carried.
 */
export function fieldSpanAtParagraphEnd(span: FieldSpan | null): FieldSpan | null {
  if (!span) return null;
  if (span.role === "end" && (span.at === null || span.at === undefined || span.at === "end")) return span;
  if (span.role === "begin" && span.at === "end") return span;
  return null;
}

const joinedFieldSpansKey = new PluginKey("joinedParagraphFieldSpans");

export const JoinedParagraphFieldSpans = Extension.create({
  name: "joinedParagraphFieldSpans",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: joinedFieldSpansKey,
        appendTransaction(transactions, _oldState, newState) {
          // Another client's change (the room) and Undo/Redo already hold the attributes as written.
          if (
            !transactions.some((tr) => tr.docChanged) ||
            transactions.some(
              (tr) =>
                tr.getMeta("y-sync$") !== undefined ||
                tr.getMeta("history$") !== undefined ||
                tr.getMeta(joinedFieldSpansKey) !== undefined,
            )
          ) {
            return null;
          }
          const maps = transactions.flatMap((tr) => tr.mapping.maps);
          const carried: Array<{ at: number; span: FieldSpan }> = [];
          let index = 0;
          for (const tr of transactions) {
            tr.steps.forEach((step, own) => {
              if (!(step instanceof ReplaceStep)) return;
              const { from, to, slice } = step as unknown as { from: number; to: number; slice: Slice };
              const doc = tr.docs[own];
              if (from >= to || !doc || to > doc.content.size) return;
              // A join puts no text block of its own between the two.
              let block = false;
              slice.content.descendants((node) => {
                if (node.isTextblock) block = true;
                return !block;
              });
              if (block) return;
              const $from = doc.resolve(from);
              const $to = doc.resolve(to);
              if ($from.parent === $to.parent || !$from.parent.isTextblock || !$to.parent.isTextblock) return;
              const span = fieldSpanAtParagraphEnd(fieldSpanOf($to.parent));
              if (!span) return;
              let at = from;
              for (const map of maps.slice(index + own)) at = map.map(at, -1);
              carried.push({ at, span });
            });
            index += tr.steps.length;
          }
          if (!carried.length) return null;
          const tr: Transaction = newState.tr;
          for (const { at, span } of carried) {
            const $at = tr.doc.resolve(Math.min(at, tr.doc.content.size));
            let depth = $at.depth;
            while (depth > 0 && !$at.node(depth).isTextblock) depth -= 1;
            if (depth < 1) continue;
            const merged = $at.node(depth);
            // The merged paragraph's own span (the first one's begin) stays:
            // one mark a paragraph.
            if (fieldSpanOf(merged)) continue;
            const source = merged.attrs.source as Record<string, unknown> | null | undefined;
            if (!source || typeof source !== "object") continue;
            tr.setNodeMarkup($at.before(depth), undefined, { ...merged.attrs, source: { ...source, nativeFieldSpan: span } }, merged.marks);
          }
          if (!tr.docChanged) return null;
          tr.setMeta(joinedFieldSpansKey, true);
          return tr;
        },
      }),
    ];
  },
});
