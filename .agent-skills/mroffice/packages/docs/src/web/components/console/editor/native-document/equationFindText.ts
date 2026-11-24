/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { latexToOmml } from "@mrnote/core/web/lib/document-export/latex-omml.ts";
import { mathTextReplaced } from "@mrnote/core/web/lib/office-math-text-replace.ts";

/**
 * An equation's characters as Find reads them: the text of its math runs,
 * the characters Word stores in the equation (`m:t`) and finds there, in the
 * order the equation is written ("Dose=weight×15mg/kg" for
 * `Dose=weight\times 15 mg/kg`; math-mode spaces draw nothing). Characters
 * of one run of text read together; a structure between them (a fraction's
 * bar, a script, a radical) is a boundary, U+FFFC, so "152" is never found
 * across the numerator `a+15` and the denominator `2`.
 */
export const EQUATION_FIND_BOUNDARY = "￼";

const XML_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function unescapeXml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (full, name: string) => {
    if (name[0] === "#") {
      const code = name[1] === "x" || name[1] === "X" ? Number.parseInt(name.slice(2), 16) : Number(name.slice(1));
      return Number.isFinite(code) ? String.fromCodePoint(code) : full;
    }
    return XML_ENTITIES[name.toLowerCase()] ?? full;
  });
}

/** What may stand between two `m:t` of one run of text: run wrappers only. */
const SAME_RUN_GAP = /^(?:<\/m:t>|<\/m:r>|<m:r>|<m:rPr>(?:(?!<\/m:rPr>).)*<\/m:rPr>|<w:rPr>(?:(?!<\/w:rPr>).)*<\/w:rPr>|<m:t(?:\s[^>]*)?>)*$/s;

const findTextCache = new Map<string, string>();
const FIND_TEXT_CACHE_LIMIT = 512;

/** The characters Find reads in the equation `latex` (see above). */
export function documentEquationFindText(latex: string): string {
  const cached = findTextCache.get(latex);
  if (cached !== undefined) return cached;
  let omml = "";
  try {
    omml = latexToOmml(latex);
  } catch {
    omml = "";
  }
  let text = "";
  let previousEnd = -1;
  for (const match of omml.matchAll(/<m:t(?:\s[^>]*)?>([^<]*)<\/m:t>/g)) {
    const at = match.index ?? 0;
    const value = unescapeXml(match[1] ?? "");
    if (previousEnd >= 0 && text && !SAME_RUN_GAP.test(omml.slice(previousEnd, at))) {
      if (!text.endsWith(EQUATION_FIND_BOUNDARY)) text += EQUATION_FIND_BOUNDARY;
    }
    text += value;
    previousEnd = at + match[0].length;
  }
  if (text.endsWith(EQUATION_FIND_BOUNDARY)) text = text.slice(0, -1);
  if (findTextCache.size >= FIND_TEXT_CACHE_LIMIT) {
    const oldest = findTextCache.keys().next().value;
    if (oldest !== undefined) findTextCache.delete(oldest);
  }
  findTextCache.set(latex, text);
  return text;
}

/**
 * The equation `latex` with its found characters `[start, end)` replaced by
 * `replacement`, written in its LaTeX (`mathTextReplaced`, the rule PowerPoint
 * Find & Replace and the AI's equation edits use); null when the LaTeX cannot
 * follow, or when the edited equation would not read exactly the characters
 * the replacement makes (a reordered script, a character LaTeX spells as
 * structure). The caller then leaves the equation as it is: it is never
 * written as plain text in its place.
 */
export function documentEquationTextReplaced(
  latex: string,
  start: number,
  end: number,
  replacement: string,
): string | null {
  const text = documentEquationFindText(latex);
  if (start < 0 || end > text.length || end <= start) return null;
  const edited = mathTextReplaced(text, latex, start, end, replacement, { spacesInsignificant: true });
  if (!edited || edited.latex === latex) return null;
  // A space the replacement holds draws nothing in math mode, as one in the
  // LaTeX does not: the characters compare without spaces.
  const unspaced = (value: string) => value.replace(/ /g, "");
  return unspaced(documentEquationFindText(edited.latex)) === unspaced(edited.text) ? edited.latex : null;
}
