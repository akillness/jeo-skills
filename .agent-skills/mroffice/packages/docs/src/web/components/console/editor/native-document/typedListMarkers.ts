/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Transaction } from "@tiptap/pm/state";

export type TypedListMarkerKind =
  | "decimal"
  | "lower-alpha"
  | "upper-alpha"
  | "lower-roman"
  | "upper-roman"
  | "bullet";

export interface TypedListMarkerPlan {
  readonly kind: TypedListMarkerKind;
  /** The punctuation after the number: ".", "．" or "、" (null for bullets). */
  readonly suffix: "." | "．" | "、" | null;
  /** Per paragraph, how many leading characters are the marker (0: none). */
  readonly lengths: readonly number[];
}

interface Marker {
  readonly value: string;
  readonly suffix: "." | "．" | "、" | null;
  readonly length: number;
  readonly bullet: boolean;
}

const NUMBERED = /^([0-9]{1,3}|[A-Za-z]{1,4})([.．、])[ \t　]*/u;
const BULLET = /^(?:[•·●○■□◆◇▪▫][ \t　]*|[-*–—][ \t　]+)/u;

function readMarker(text: string): Marker | null {
  const bullet = BULLET.exec(text);
  if (bullet) return { value: "", suffix: null, length: bullet[0].length, bullet: true };
  const numbered = NUMBERED.exec(text);
  if (!numbered) return null;
  const value = numbered[1]!;
  const next = text.charAt(numbered[1]!.length + 1);
  // "1.5 kg", "a.m." and "e.g." are text, not markers: a number mark is not
  // followed by a digit, a letter mark not by another Latin letter or dot.
  if (/[0-9]/.test(value) ? /[0-9]/.test(next) : /[A-Za-z0-9.]/.test(next)) return null;
  return {
    value,
    suffix: numbered[2] as "." | "．" | "、",
    length: numbered[0].length,
    bullet: false,
  };
}

const ROMAN = /^(?:i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii|xiii|xiv|xv|xvi|xvii|xviii|xix|xx)$/;

function kindOf(first: Marker, second: Marker | undefined): TypedListMarkerKind | null {
  if (first.bullet) return "bullet";
  const value = first.value;
  if (value === "1") return "decimal";
  // "i." starts a roman list unless the next marker is "j." (then lettered).
  if (value === "i" || value === "I") {
    const letters = second && !second.bullet && second.value.toLowerCase() === "j";
    if (letters) return value === "i" ? "lower-alpha" : "upper-alpha";
    return value === "i" ? "lower-roman" : "upper-roman";
  }
  if (value === "a") return "lower-alpha";
  if (value === "A") return "upper-alpha";
  return null;
}

function sameKind(kind: TypedListMarkerKind, suffix: Marker["suffix"], marker: Marker): boolean {
  if (kind === "bullet") return marker.bullet;
  if (marker.bullet || marker.suffix !== suffix) return false;
  const value = marker.value;
  switch (kind) {
    case "decimal":
      return /^[0-9]+$/.test(value);
    case "lower-alpha":
      return /^[a-z]$/.test(value);
    case "upper-alpha":
      return /^[A-Z]$/.test(value);
    case "lower-roman":
      return ROMAN.test(value);
    case "upper-roman":
      return ROMAN.test(value.toLowerCase()) && value === value.toUpperCase();
  }
}

/**
 * The typed markers of the paragraphs a list command is about to number, or
 * null when Word would recognise none (the texts are then left alone).
 */
export function typedListMarkerPlan(texts: readonly string[]): TypedListMarkerPlan | null {
  const markers = texts.map(readMarker);
  const firstIndex = markers.findIndex((marker) => marker !== null);
  if (firstIndex < 0) return null;
  const first = markers[firstIndex]!;
  const second = markers.slice(firstIndex + 1).find((marker) => marker !== null) ?? undefined;
  const kind = kindOf(first, second);
  if (!kind) return null;
  const suffix = first.suffix;
  const lengths = markers.map((marker) =>
    marker && sameKind(kind, suffix, marker) ? marker.length : 0,
  );
  return { kind, suffix, lengths };
}

// ---------------------------------------------------------------------------
// Applying the plan to a transaction (the list command's own, so the markers'
// removal and the numbering are one Undo step).










export function stripTypedListMarkers(tr: Transaction): TypedListMarkerPlan | null {
  const paragraphs: Array<{ pos: number; text: string }> = [];
  // Each selected range: the cells of a cell selection, not the whole run of
  // the table from its first cell to its last.
  for (const { $from, $to } of tr.selection.ranges) {
    tr.doc.nodesBetween($from.pos, $to.pos, (node, pos) => {
      if (!node.isTextblock) return true;
      if (node.type.name === "paragraph") {
        const $pos = tr.doc.resolve(pos);
        let listed = false;
        for (let depth = $pos.depth; depth > 0; depth -= 1) {
          const name = $pos.node(depth).type.name;
          if (name === "listItem" || name === "taskItem") listed = true;
        }
        let leading = "";
        for (let index = 0; index < node.childCount; index += 1) {
          const child = node.child(index);
          if (!child.isText) break;
          leading += child.text ?? "";
          if (leading.length > 16) break;
        }
        if (!listed) paragraphs.push({ pos, text: leading });
      }
      return false;
    });
  }
  const plan = typedListMarkerPlan(paragraphs.map((paragraph) => paragraph.text));
  if (!plan) return null;
  // Last first, so the earlier positions stay valid.
  for (let index = paragraphs.length - 1; index >= 0; index -= 1) {
    const length = plan.lengths[index] ?? 0;
    if (length <= 0) continue;
    const start = paragraphs[index]!.pos + 1;
    tr.delete(start, start + length);
  }
  return plan.lengths.some((length) => length > 0) ? plan : null;
}
