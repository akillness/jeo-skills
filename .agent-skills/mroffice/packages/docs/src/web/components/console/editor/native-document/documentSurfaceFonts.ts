/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/** A document paginates against the faces its own font stack resolves to, and
 * a web font changes those metrics: the same page measures one line box before
 * the face arrives and a taller one after. `document.fonts.status` cannot close
 * that window on its own — it stays "loaded" until some layout first asks for a
 * face, and an `@import`ed font stylesheet can still be in flight, so a surface
 * can look perfectly settled while the text on screen is painted in a fallback.
 * Measuring there sends a page break somewhere else and saves a projection no
 * later reader reproduces. Ask the font set for this surface's own stack and
 * text instead, request what is missing, and never wait forever for a face that
 * is not coming. */

/** `@import` is discovered only after its parent sheet loads; until the
 * imported sheet arrives its faces do not exist and `check` cannot see them. */
const CSS_IMPORT_RULE = 3;
const MAX_SHEETS = 64;
const MAX_SHEET_RULES = 32;
const MAX_STACKS = 8;
const MAX_SAMPLE_CHARACTERS = 20_000;
const MAX_SAMPLE_GLYPHS = 1_000;
/** Word's auto line rule multiplies a measured "Hg" line box, so the Latin
 * face decides the spacing of an all-CJK page as much as the CJK face does. */
const LINE_BOX_SAMPLE = "Hg";
/** A face that never arrives (offline, a blocked CDN) must not freeze a page:
 * past this the surface measures with whatever it has. */
export const SURFACE_FONT_WAIT_MS = 6_000;

export type DocumentSurfaceFontStatus = "ready" | "loading";

//: The wait belongs to the document, not to the element that happened to ask.
//: An editor that remounts — a re-render, a reopened window — would otherwise
//: start the grace period again and never reach its end, which is the one way
//: this bounded wait could become an unbounded one.
const waiting = new WeakMap<Document, number>();
const verified = new WeakMap<HTMLElement, number>();
const requested = new WeakMap<Document, Map<string, { settled: boolean }>>();

function sampleText(root: HTMLElement): string {
  const glyphs = new Set<string>(LINE_BOX_SAMPLE);
  for (const character of (root.textContent ?? "").slice(
    0,
    MAX_SAMPLE_CHARACTERS,
  )) {
    if (character.trim() === "") continue;
    glyphs.add(character);
    if (glyphs.size >= MAX_SAMPLE_GLYPHS) break;
  }
  return [...glyphs].join("");
}

/** The surface's own stack, plus the families its content declares inline.
 * Bold is asked for unconditionally: a heading's face is a separate download
 * whose metrics move the same page breaks as the body face. */
function fontStacks(root: HTMLElement): string[] {
  const style = root.ownerDocument.defaultView?.getComputedStyle(root);
  const family = style?.fontFamily;
  if (!style || !family) return [];
  const size = style.fontSize || "16px";
  const shorthand = (fontFamily: string, weight: string, fontStyle: string) =>
    `${fontStyle === "normal" ? "" : `${fontStyle} `}${weight} ${size} ${fontFamily}`;
  const stacks = new Set([
    shorthand(family, style.fontWeight || "400", style.fontStyle || "normal"),
    shorthand(family, "700", "normal"),
  ]);
  for (const element of root.querySelectorAll<HTMLElement>("[style*='font-']")) {
    const declared = element.style.fontFamily;
    if (!declared) continue;
    stacks.add(
      shorthand(
        declared,
        element.style.fontWeight || style.fontWeight || "400",
        element.style.fontStyle || "normal",
      ),
    );
    if (stacks.size >= MAX_STACKS) break;
  }
  return [...stacks];
}

/** Only while the document is still loading. A sheet that failed — offline, a
 * blocked origin — keeps an unresolved import forever, and `complete` is the
 * browser saying every stylesheet has either arrived or given up. */
function stylesheetsPending(doc: Document): boolean {
  if (doc.readyState === "complete") return false;
  const sheets = doc.styleSheets;
  for (let index = 0; index < sheets.length && index < MAX_SHEETS; index += 1) {
    let rules: CSSRuleList | null = null;
    // A cross-origin sheet refuses its rules, which it can only do once loaded.
    try {
      rules = sheets[index]?.cssRules ?? null;
    } catch {
      continue;
    }
    if (!rules) continue;
    for (let rule = 0; rule < rules.length && rule < MAX_SHEET_RULES; rule += 1) {
      const imported = rules[rule];
      if (
        imported?.type === CSS_IMPORT_RULE &&
        !(imported as CSSImportRule).styleSheet
      )
        return true;
    }
  }
  return false;
}

function requestKey(font: string, text: string): string {
  return `${font} @@ ${text.length}:${text.slice(0, 64)}`;
}

/** Whether this exact request was made and has been answered. */
function answered(doc: Document, font: string, text: string): boolean {
  return requested.get(doc)?.get(requestKey(font, text))?.settled === true;
}

/** True while this exact request is still outstanding. A face that answered —
 * arrived, or refused — is answered: a document whose font host is blocked or
 * offline measures on what it has instead of waiting for something better. */
function outstanding(
  doc: Document,
  fonts: FontFaceSet,
  font: string,
  text: string,
): boolean {
  let sent = requested.get(doc);
  if (!sent) requested.set(doc, (sent = new Map()));
  const key = requestKey(font, text);
  const known = sent.get(key);
  if (known) return !known.settled;
  const state = { settled: false };
  sent.set(key, state);
  // The surface paints this text, so the browser does request the face — but
  // it can start that request after the first measurement has already run.
  // Asking here makes the answer, and its `loadingdone`, the settling event.
  void fonts
    .load(font, text)
    .catch(() => undefined)
    .finally(() => {
      state.settled = true;
    });
  return true;
}

/** "loading" while a face this surface needs is missing or still on its way. */
export function documentSurfaceFontStatus(
  root: HTMLElement | null,
): DocumentSurfaceFontStatus {
  if (!root) return "ready";
  const doc = root.ownerDocument as Document | null;
  const fonts = doc?.fonts;
  if (!doc || !fonts || typeof fonts.check !== "function") return "ready";
  const since = waiting.get(doc);
  if (since !== undefined && Date.now() - since >= SURFACE_FONT_WAIT_MS)
    return "ready";
  // Pagination reads this every frame it measures. A verdict only changes when
  // the font set itself does — a stylesheet parsed, a face registered — so one
  // O(1) set size keeps the settled surface off the text and stack scan.
  const generation = typeof fonts.size === "number" ? fonts.size : -1;
  if (verified.get(root) === generation) return "ready";
  let ready = !stylesheetsPending(doc);
  if (ready) {
    const text = sampleText(root);
    for (const font of fontStacks(root)) {
      // A request that has been answered decides nothing more, whatever the
      // check would say (`outstanding` is false for it), and the check is
      // the cost of this function: it matches every face the page holds
      // against the sample. The set grows face by face while a document
      // opens, and each growth checked every stack again (0.44 s of the
      // stress document's open in Chromium).
      if (answered(doc, font, text)) continue;
      let loaded = true;
      // An unparsable shorthand is not a face anyone can wait for.
      try {
        loaded = fonts.check(font, text);
      } catch {
        loaded = true;
      }
      if (loaded) continue;
      if (outstanding(doc, fonts, font, text)) ready = false;
    }
  }
  if (ready) {
    waiting.delete(doc);
    verified.set(root, generation);
    return "ready";
  }
  if (since === undefined) waiting.set(doc, Date.now());
  return "loading";
}

export function documentSurfaceFontsLoaded(root: HTMLElement | null): boolean {
  return documentSurfaceFontStatus(root) === "ready";
}
