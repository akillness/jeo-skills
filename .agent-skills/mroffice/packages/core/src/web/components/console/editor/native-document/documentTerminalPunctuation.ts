/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { documentStyleFontSizePx } from "./documentStyleFontSize";
import type { EditorView } from "@tiptap/pm/view";
import type { Node as PmNode } from "@tiptap/pm/model";
import { documentDisplayFontPluginKey } from "./documentDisplayFonts";
import { inheritedBoldValue } from "./boldExtension";
import { readDocumentNumberingLayout } from "./documentNumberingLayout";
import { listContinuationTypography } from "./listContinuationTypography";
import { officePrimaryFontFamily } from "../../../office-ribbon/officeTypographyCatalog";
import {
  resolveDocumentOverflowPunctuation,
  resolveEffectiveDocumentWordWrap,
} from "./documentOverflowPunctuation";
import {
  paginationTransformScale,
  clientRectInPaginationLayout,
} from "./paged/paginationGeometry";
import { measurementRange } from "./paged/measurementRange";

export const TERMINAL_PUNCTUATION_ATTR = "data-docs-terminal-punctuation";
export const PATH_PUNCTUATION_ATTR = "data-docs-path-punctuation-boundary";
export const TERMINAL_PUNCTUATION_BASE_ATTR =
  "data-docs-terminal-punctuation-base-spacing";
const TRAILING_SPACE_ATTR = "data-docs-word-trailing-space";
const ascii = /^[A-Za-z0-9_/.:+\-]$/;
const punctuation = /^[、。，]$/;
// Word overflowPunct also hangs fullwidth colons and semicolons. CSS
// allow-end only covers commas/stops, even where that property is supported.
const bodyPunctuation = /^[、。，：；]$/;
const pathPunctuation = /^[、，：；]$/;
const maxCandidates = 32,
  maxTokenLength = 256;
const epsilon = 1 / 64;
export interface TerminalPunctuationGlyph {
  from: number;
  to: number;
  character: string;
  widthPx: number;
  fontSizePx: number;
  baseLetterSpacingPx: number;
  autoSpaceBeforePx?: number;
  autoSpaceAfterPx?: number;
  fontAdvanceCorrectionPx?: number;
  /** Distance from the glyph's box top down to its baseline, in unscaled CSS
   * pixels, as the engine lays out the glyph's own face and size. */
  baselineOffsetPx: number;
}
export interface TerminalPunctuationSpec {
  from: number;
  to: number;
  baseLetterSpacingPx: number;
  advancePx: number;
  letterSpacingPx: number;
  attributes: Readonly<Record<string, string>>;
}
export interface TerminalPunctuationResult {
  specs: readonly TerminalPunctuationSpec[];
  signature: string;
  complete: boolean;
  /** False when this measurement changed the paragraph: every candidate is
   * decided again on the layout the change produces, after publishing. */
  settled: boolean;
}
const empty = (): TerminalPunctuationResult => ({
  specs: [],
  signature: "none",
  complete: true,
  settled: true,
});

/** A fit decision in unscaled CSS pixels. No source text/expected line ends. */
export function terminalPunctuationFit(input: {
  remainingPx: number;
  tokenAdvancePx: number;
  punctuationAdvancePx: number;
  nextTokenAdvancePx: number;
}): boolean {
  const {
    remainingPx: remaining,
    tokenAdvancePx: token,
    punctuationAdvancePx: mark,
    nextTokenAdvancePx: next,
  } = input;
  return (
    [remaining, token, mark, next].every(Number.isFinite) &&
    token > 0 &&
    mark > 0 &&
    next > 0 &&
    token <= remaining + epsilon &&
    token + mark > remaining + epsilon &&
    next > remaining - token + epsilon
  );
}

/** Existing zero-advance punctuation is retained only while it really hangs.
 * This avoids alternating apply/remove when the token is no longer line-first. */
export function terminalPunctuationStillHangs(
  left: number,
  right: number,
  advance: number,
  nextIsOnLaterLine: boolean,
): boolean {
  return (
    nextIsOnLaterLine &&
    [left, right, advance].every(Number.isFinite) &&
    advance > 0 &&
    left <= right + epsilon &&
    left + advance > right + epsilon
  );
}

/** Never union fragmented Range rects; a hanging mark may have zero advance. */
export function firstTerminalPunctuationRect(
  rects: Iterable<DOMRect>,
): DOMRect | null {
  const entries = Array.from(rects);
  return (
    entries.find((rect) => rect.width > 0 && rect.height > 0) ??
    entries.find((rect) => rect.width === 0 && rect.height > 0) ??
    null
  );
}
export interface TerminalGlyphBox {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
  baseline: number;
}

/** Glyphs on one line sit on its baseline, and a glyph box always contains its
 * own baseline. Box tops are no line identity: a smaller or different face on
 * the same line has a lower top. Each baseline must fall inside the other
 * glyph's box; distinct lines are at least a line pitch apart. */
export function sameTerminalLine(a: TerminalGlyphBox, b: TerminalGlyphBox): boolean {
  return (
    a.baseline >= b.top &&
    a.baseline <= b.bottom &&
    b.baseline >= a.top &&
    b.baseline <= a.bottom
  );
}
const earlierLine = (a: TerminalGlyphBox, b: TerminalGlyphBox) =>
  !sameTerminalLine(a, b) && a.baseline < b.baseline;
const laterLine = (a: TerminalGlyphBox, b: TerminalGlyphBox) =>
  !sameTerminalLine(a, b) && a.baseline > b.baseline;

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

function sourceStyleKnown(
  docAttrs: Record<string, unknown>,
  block: PmNode,
): boolean {
  const defs = record(docAttrs.styleDefinitions),
    id = block.attrs.docxStyleId ?? record(block.attrs.source)?.styleId;
  if (!defs) return id == null;
  if (
    defs.version !== 1 ||
    !Array.isArray(defs.styles) ||
    defs.styles.length > 512
  )
    return false;
  const styles = new Map<string, Record<string, unknown>>();
  for (const raw of defs.styles) {
    const style = record(raw);
    if (
      !style ||
      typeof style.styleId !== "string" ||
      styles.has(style.styleId)
    )
      return false;
    styles.set(style.styleId, style);
  }
  const safe = (raw: unknown) => {
    const rPr = record(raw);
    return (
      raw == null ||
      (!!rPr &&
        [
          "spacingTwips",
          "scalePercent",
          "kernHalfPoints",
          "caps",
          "smallCaps",
          "rtl",
          "vertAlign",
          // A style's `w:kern w:val="0"` states that kerning is off: the
          // advances are the ones this proof assumes (style extractor 2).
        ].every((key) => rPr[key] == null || (key === "kernHalfPoints" && rPr[key] === 0)))
    );
  };
  if (!safe(record(defs.docDefaults)?.rPr)) return false;
  const defaults = [...styles.values()].filter(
    (style) => style.type === "paragraph" && style.default === true,
  );
  let current: unknown =
    id ?? (defaults.length === 1 ? defaults[0].styleId : null);
  if (typeof current !== "string") return false;
  const seen = new Set<string>();
  while (current) {
    if (typeof current !== "string" || seen.has(current)) return false;
    seen.add(current);
    const style = styles.get(current);
    if (!style || style.type !== "paragraph" || !safe(style.rPr)) return false;
    current = style.basedOn;
  }
  return true;
}
const defaultParagraphStyles = new WeakMap<object, string | null>();
/** The paragraph as Word styles it: without a style of its own, the single
 * default paragraph style (the same fallback `sourceStyleKnown` proves). */
function styledParagraph(docAttrs: Record<string, unknown>, block: PmNode) {
  if (block.attrs.docxStyleId != null || block.attrs.customStyleId != null ||
      block.attrs.customStyleName || block.type.name !== "paragraph") return block;
  const defs = record(docAttrs.styleDefinitions);
  if (!defs) return block;
  let styleId = defaultParagraphStyles.get(defs);
  if (styleId === undefined) {
    const defaults = Array.isArray(defs.styles)
      ? defs.styles.map(record).filter((style) => style?.type === "paragraph" && style.default === true)
      : [];
    styleId = defaults.length === 1 && typeof defaults[0]?.styleId === "string" ? defaults[0].styleId : null;
    defaultParagraphStyles.set(defs, styleId);
  }
  return styleId === null ? block : { type: block.type, attrs: { ...block.attrs, docxStyleId: styleId } };
}
function elementAt(view: EditorView, pos: number): HTMLElement | null {
  const at = view.domAtPos(pos, 1);
  let node: Node | undefined = at.node;
  if (node.nodeType !== 3) node = node.childNodes[at.offset];
  while (node && node.nodeType !== 3) node = node.firstChild ?? undefined;
  return node?.parentElement ?? null;
}
function regularSourceProfile(
  view: EditorView,
  glyph: TerminalPunctuationGlyph,
  asciiPath = false,
  eastAsianGlyph = false,
  bold = false,
): string | null {
  if (
    glyph.to !== glyph.from + 1 ||
    !Number.isFinite(glyph.widthPx) ||
    !(glyph.fontSizePx > 0) ||
    glyph.autoSpaceBeforePx ||
    glyph.autoSpaceAfterPx ||
    glyph.fontAdvanceCorrectionPx
  )
    return null;
  const node = view.state.doc.nodeAt(glyph.from);
  if (
    !node?.isText ||
    view.state.doc.textBetween(glyph.from, glyph.to, "", "") !== glyph.character
  )
    return null;
  // A hyperlink is a run with a character style's colour and underline; an
  // unclassed link paints no other box or face.
  const allowed = new Set([
    "bold",
    "italic",
    "fontFamily",
    "fontCjkFamily",
    // The complex-script slot (`w:rFonts@w:cs`) is a record: the mark renders a
    // data attribute and no style, so it paints no other box or face. Left out
    // of this list, every run the import states it on (Word writes it beside
    // the ascii and East Asian faces as a matter of course) lost its terminal
    // punctuation and its path boundary, and the paragraph wrapped a line more
    // than Word (the three MR guide documents: 13 -> 7 page starts matching).
    "fontComplexFamily",
    "fontSize",
    "textColor",
    "proofingLanguage",
    "underline",
    "strike",
    "highlight",
    "link",
  ]);
  if (
    node.marks.some(
      (mark) =>
        !allowed.has(mark.type.name) ||
        (mark.type.name === "italic" && mark.attrs.value !== false) ||
        (mark.type.name === "link" && mark.attrs.class),
    )
  )
    return null;
  // The face role is the direct toggle, else the style chain Word resolves (a
  // hyperlink run carries none). An unresolved role is not a known face.
  const direct = node.marks.find((mark) => mark.type.name === "bold");
  const role = direct
    ? direct.attrs.value
    : inheritedBoldValue(
        view.state.doc.attrs,
        styledParagraph(view.state.doc.attrs, view.state.doc.resolve(glyph.from).parent),
        node.marks,
      );
  if (role !== bold) return null;
  // A run that states no size of its own has its paragraph style's, and the
  // page must paint that size.
  const sizeMark = node.marks.find((mark) => mark.type.name === "fontSize");
  const sizePx = !sizeMark
    ? documentStyleFontSizePx(
        view.state.doc.attrs,
        styledParagraph(view.state.doc.attrs, view.state.doc.resolve(glyph.from).parent),
      )
    : typeof sizeMark.attrs.size === "string" && /^\d+(?:\.\d+)?px$/.test(sizeMark.attrs.size)
      ? Number.parseFloat(sizeMark.attrs.size)
      : null;
  if (sizePx === null || Math.abs(sizePx - glyph.fontSizePx) > 0.001) return null;
  const font = node.marks.find((mark) => mark.type.name === "fontFamily");
  const cjk = node.marks.find((mark) => mark.type.name === "fontCjkFamily");
  const sourceFont =
    eastAsianGlyph && /^[\u4e00-\u9fff、。，：；]$/.test(glyph.character) && cjk
      ? cjk
      : font;
  const family = typeof sourceFont?.attrs.family==='string' && officePrimaryFontFamily(sourceFont.attrs.family);
  if (
    !family ||
    ["serif", "sans-serif", "monospace", "system-ui"].includes(family) ||
    sourceFont?.attrs.face ||
    (font?.attrs.hintCharset && !["00", "86"].includes(font.attrs.hintCharset))
  )
    return null;
  if (
    !(asciiPath && (ascii.test(glyph.character) || glyph.character === " ")) &&
    cjk &&
    (cjk.attrs.face || typeof cjk.attrs.family!=='string' || officePrimaryFontFamily(cjk.attrs.family) !== family)
  )
    return null;
  return `${family}:${sizePx.toFixed(3)}:${bold ? "bold" : "regular"}`;
}

/** Everything the rules require of a paragraph before any glyph geometry. */
function terminalPunctuationContext(view: EditorView, element: HTMLElement) {
  const win = element.ownerDocument.defaultView;
  if (
    !win?.CSS?.supports ||
    element.tagName !== "P" ||
    element.closest("td,th")
  )
    return null;
  if (
    element.querySelector(
      "br,img,svg,canvas,math,video,audio,input,button,[contenteditable=false],.ProseMirror-widget",
    )
  )
    return null;
  const style = win.getComputedStyle(element);
  if (
    style.direction !== "ltr" ||
    (style.writingMode && style.writingMode !== "horizontal-tb") ||
    !["left", "start"].includes(style.textAlign)
  )
    return null;
  let block: PmNode, contentFrom: number;
  try {
    contentFrom = view.posAtDOM(element, 0);
    block = view.state.doc.resolve(contentFrom).parent;
  } catch {
    return null;
  }
  if (
    block.type.name !== "paragraph" ||
    block.textContent !== element.textContent ||
    !sourceStyleKnown(view.state.doc.attrs, block)
  )
    return null;
  const displayAttrs =
    listContinuationTypography(view.state.doc).get(block) ?? block.attrs;
  const textIndent = Number.parseFloat(style.textIndent);
  if (
    textIndent !== 0 &&
    !(
      Number.isFinite(textIndent) &&
      textIndent > 0 &&
      element.hasAttribute("data-docs-numbering-marker") &&
      readDocumentNumberingLayout(displayAttrs)
    )
  )
    return null;
  const source = record(displayAttrs.source);
  // A paragraph pasted or duplicated into an imported Word document has no
  // source of its own; Word sets it as every other paragraph of the document.
  const adapter =
    source?.adapter ?? (view.state.doc.attrs.styleDefinitions != null ? "docx" : undefined);
  const kinsoku = displayAttrs.kinsoku ?? view.state.doc.attrs.defaultKinsoku;
  if (
    (kinsoku != null && kinsoku !== true) ||
    adapter !== "docx" ||
    view.state.doc.attrs.characterSpacingControl !== "doNotCompress" ||
    resolveEffectiveDocumentWordWrap(
      view.state.doc.attrs,
      displayAttrs,
      adapter,
    ) !== true
  )
    return null;
  let plain = true;
  block.forEach((child) => {
    if (!child.isText) plain = false;
  });
  if (!plain) return null;
  const overflowPunctuation = resolveDocumentOverflowPunctuation(
    view.state.doc.attrs, displayAttrs, adapter,
  ) === true;
  return { win, style, block, contentFrom, overflowPunctuation };
}

/** Whether a paragraph can receive any projection at all. The owner measures
 * glyph baselines only for these paragraphs. */
export function documentTerminalPunctuationApplies(
  view: EditorView,
  element: HTMLElement,
): boolean {
  return terminalPunctuationContext(view, element) !== null;
}

/** Called synchronously by the existing CJK projection owner after font/layout
 * readiness. Owns no listeners, cache, scheduling, glyph shaping or pagination. */
export function documentTerminalPunctuation(input: {
  view: EditorView;
  element: HTMLElement;
  glyphs: readonly TerminalPunctuationGlyph[];
}): TerminalPunctuationResult {
  const { view, element, glyphs } = input,
    doc = element.ownerDocument;
  const context = terminalPunctuationContext(view, element);
  if (!context) return empty();
  const { win, style, block, contentFrom, overflowPunctuation } = context;
  if (
    !glyphs.length ||
    glyphs[0].from !== contentFrom ||
    glyphs[glyphs.length - 1].to !== contentFrom + block.content.size ||
    glyphs.some(
      (glyph, index) => index > 0 && glyph.from !== glyphs[index - 1].to,
    ) ||
    glyphs.map((glyph) => glyph.character).join("") !== block.textContent ||
    // A face whose baseline could not be measured has no line identity.
    glyphs.some((glyph) => !Number.isFinite(glyph.baselineOffsetPx))
  )
    return empty();
  const scale = paginationTransformScale(element);
  if (!scale) return { ...empty(), complete: false };
  const boxes = Array.from(element.getClientRects()).filter(
    (rect) => rect.width > 0 && rect.height > 0,
  );
  // A missing layout fragment is transient; multiple fragments are an
  // unsupported layout. Only the latter is a reusable empty conclusion.
  if (boxes.length === 0) return { ...empty(), complete: false };
  if (boxes.length !== 1) return empty();
  const box = clientRectInPaginationLayout(boxes[0], scale);
  const right =
    box.right -
    (Number.parseFloat(style.paddingRight) || 0) -
    (Number.parseFloat(style.borderRightWidth) || 0);
  const specs: TerminalPunctuationSpec[] = [];
  let candidates = 0,
    complete = true;
  const cache = new Map<number, TerminalGlyphBox | null>();
  const rect = (index: number): TerminalGlyphBox | null => {
    if (cache.has(index)) return cache.get(index)!;
    const glyph = glyphs[index];
    if (!glyph) return null;
    try {
      const start = view.domAtPos(glyph.from, 1),
        end = view.domAtPos(glyph.to, -1),
        range = measurementRange(doc, "terminalPunctuation");
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      const client = firstTerminalPunctuationRect(range.getClientRects());
      const layout = client
        ? clientRectInPaginationLayout(client, scale)
        : null;
      const result = layout
        ? { ...layout, baseline: layout.top + glyph.baselineOffsetPx }
        : null;
      cache.set(index, result);
      return result;
    } catch {
      cache.set(index, null);
      return null;
    }
  };
  const nativeAdvance=(glyph:TerminalPunctuationGlyph):number|null=>{
    const decorations=documentDisplayFontPluginKey.getState(view.state)?.decorations;
    const matched=decorations?.find(glyph.from,glyph.to,spec=>spec.syntheticBoldAdvance===true)
      .find(item=>item.from<=glyph.from&&item.to>=glyph.to);
    const attrs=(matched as unknown as {type?:{attrs?:Record<string,unknown>}}|undefined)?.type?.attrs;
    const css=typeof attrs?.style==='string'?attrs.style:'';
    const raw=/(?:^|;)\s*--document-synthetic-bold-letter-spacing\s*:\s*([-+\d.eE]+)px(?:;|$)/.exec(css)?.[1];
    const value=raw===undefined?NaN:Number(raw);
    return Number.isFinite(value)?value:null;
  };
  // A body line can end in punctuation before more source text. Word's
  // overflow rule is not limited to paragraph EOF or a path delimiter.
  const bodyHanging=(index:number):TerminalPunctuationSpec[]|null=>{
    const mark=glyphs[index];
    if(index===glyphs.length-1||!bodyPunctuation.test(mark.character))return null;
    const regular=regularSourceProfile(view,mark,false,true);
    const bold=!regular&&mark.character==='。'&&!!regularSourceProfile(view,mark,false,true,true);
    if(!regular&&!bold)return null;
    // Native WebKit already handles ordinary text. Its nonzero derived bold
    // advance can still keep an internal full stop on the next line; the
    // independent mixed control and actual geometry cover only that case.
    if(!bold&&punctuation.test(mark.character)&&win.CSS.supports('hanging-punctuation','allow-end'))return null;
    const target=elementAt(view,mark.from),own=target?.closest<HTMLElement>(`[${TERMINAL_PUNCTUATION_ATTR}]`);
    if(target?.closest(`[${PATH_PUNCTUATION_ATTR}]`))return null;
    const saved=own?.getAttribute(TERMINAL_PUNCTUATION_BASE_ATTR);
    if(own&&(saved==null||saved.trim()===''))return null;
    const base=own?Number(saved):mark.baseLetterSpacingPx,expected=bold?nativeAdvance(mark):0;
    if(!Number.isFinite(base)||expected===null||Math.abs(base-expected)>0.00001)return null;
    const css=target&&win.getComputedStyle(target);
    if(!css||!(bold?css.fontWeight==='700':['normal','400'].includes(css.fontWeight))||css.fontStyle!=='normal'||
      css.wordSpacing!=='normal'&&Number.parseFloat(css.wordSpacing)!==0)return null;
    const word=/^[A-Za-z0-9_]$/,han=/^[\u4e00-\u9fff]$/;
    const tokenCharacter=bold?word:ascii;
    let start=index-1;
    if(tokenCharacter.test(glyphs[start].character))while(start>0&&tokenCharacter.test(glyphs[start-1].character)&&index-start<maxTokenLength)start--;
    else if(!han.test(glyphs[start].character))return null;
    if(index-start>=maxTokenLength)return null;
    const profile=regularSourceProfile(view,glyphs[start],true,true,bold);
    if(!profile||glyphs.slice(start,index).some(glyph=>regularSourceProfile(view,glyph,true,true,bold)!==profile||
      (bold?nativeAdvance(glyph)===null||Math.abs(glyph.baseLetterSpacingPx-nativeAdvance(glyph)!)>0.00001:glyph.baseLetterSpacingPx!==0)))return null;
    let nextIndex=index+1;
    while(nextIndex<glyphs.length&&glyphs[nextIndex].character===' '&&nextIndex-index<16){
      if(!regularSourceProfile(view,glyphs[nextIndex],true,false)||glyphs[nextIndex].baseLetterSpacingPx!==0)return null;
      nextIndex++;
    }
    const following=glyphs[nextIndex];
    if(!following||!word.test(following.character)&&!han.test(following.character))return null;
    const nextRegular=regularSourceProfile(view,following,true,true),nextBold=regularSourceProfile(view,following,true,true,true);
    // The next glyph is never rewritten. Its actual advance only proves that
    // it cannot follow the hanging mark on the preceding line.
    if(!nextRegular&&!nextBold||following.baseLetterSpacingPx!==0&&
      (!nextBold||nativeAdvance(following)===null||Math.abs(following.baseLetterSpacingPx-nativeAdvance(following)!)>0.00001))return null;
    const punct=rect(index),next=rect(nextIndex),last=rect(index-1);
    if(!punct||!next||!last){complete=false;return null;}
    const advance=mark.widthPx-mark.baseLetterSpacingPx+base;
    if(!(advance>0)||!Number.isFinite(advance))return null;
    let eligible=false;
    if(own){
      eligible=sameTerminalLine(last,punct)&&punct.left+base<=right+epsilon&&terminalPunctuationStillHangs(punct.left,right,advance,laterLine(next,punct))&&following.widthPx>right-punct.left+epsilon;
    }else if(earlierLine(last,punct)){
      // Only the punctuation wrapped, so there is no carried token to charge.
      eligible=last.right<=right+epsilon&&last.right+advance>right+epsilon&&following.widthPx>right-last.right+epsilon;
    }else if(sameTerminalLine(last,punct)){
      let first=rect(start);if(!first){complete=false;return null;}
      // A long word may already wrap legally; charge only its visible suffix.
      while(start<index-1&&earlierLine(first,punct)){start++;first=rect(start);if(!first){complete=false;return null;}}
      if(!sameTerminalLine(first,punct))return null;
      let before=start-1,spacing=0;
      if(before>=0&&glyphs[before].character===' '){
        if(!regularSourceProfile(view,glyphs[before],true,false)||glyphs[before].baseLetterSpacingPx!==0)return null;
        spacing=glyphs[before].widthPx;before--;
      }
      if(before<0)return null;
      const previous=rect(before);if(!previous){complete=false;return null;}
      if(!earlierLine(previous,first))return null;
      const tokenAdvance=punct.left-first.left+spacing,remaining=right-previous.right;
      eligible=terminalPunctuationFit({remainingPx:remaining,tokenAdvancePx:tokenAdvance,punctuationAdvancePx:advance,nextTokenAdvancePx:following.widthPx});
    }
    if(!eligible)return null;
    const result:TerminalPunctuationSpec[]=[{from:mark.from,to:mark.to,baseLetterSpacingPx:base,advancePx:advance,letterSpacingPx:base-advance,attributes:{
      [TERMINAL_PUNCTUATION_ATTR]:'true',[TERMINAL_PUNCTUATION_BASE_ATTR]:String(base),
      'data-docs-word-cjk-spacing':'terminal','data-docs-word-cjk-base-letter-spacing':String(base),
      // Remove the whole logical advance, including its proven residual.
      // The font owner's base remains intact and is restored on removal.
      style:`letter-spacing:${base-advance}px${bold?' !important':''}`,
    }}];
    for(let cursor=index+1;cursor<nextIndex;cursor++){
      const space=glyphs[cursor],node=view.state.doc.nodeAt(space.from);
      if(node?.marks.some(mark=>['underline','strike','highlight'].includes(mark.type.name)))continue;
      // A following ordinary space stays at the hanging line edge rather
      // than consuming indentation on the next visual line. Source is intact.
      result.push({from:space.from,to:space.to,baseLetterSpacingPx:0,advancePx:space.widthPx,letterSpacingPx:-space.widthPx,attributes:{
        'data-docs-word-cjk-spacing':'hanging-space','data-docs-word-cjk-base-letter-spacing':'0',
        style:`letter-spacing:${-space.widthPx}px !important`,
      }});
    }
    return result;
  };
  // Word does not charge an ordinary space after a Latin word to the line
  // it ends. Keep break-spaces elsewhere: changing the whole paragraph to
  // pre-wrap also changes the break before a spaced Han/path boundary.
  // Admit only a measured word that fits without its one trailing space.
  // Word never charges a line-end space, after a Han character either (each
  // Han character is its own token there), nor before one ("被 Web 对齐"
  // keeps "Web" where it fits). A Han ideograph is never a no-start
  // character, so the line can always break after the space before it.
  const hanCharacter = /^[\u4e00-\u9fff]$/;
  for (let index = 1; index + 1 < glyphs.length; index++) {
    const space = glyphs[index], following = glyphs[index + 1];
    const afterHan = hanCharacter.test(glyphs[index - 1].character);
    if (space.character !== " " || (!ascii.test(glyphs[index - 1].character) && !afterHan) ||
        (!ascii.test(following.character) && !hanCharacter.test(following.character))) continue;
    const node = view.state.doc.nodeAt(space.from);
    if (node?.marks.some(mark => ["underline", "strike", "highlight"].includes(mark.type.name))) continue;
    const profile = regularSourceProfile(view, space, true);
    if (!profile) continue;
    const target = elementAt(view, space.from), own = target?.closest(`[${TRAILING_SPACE_ATTR}]`);
    // The glyph reader reports the base under this projection (its data
    // attribute: 0), never the applied zero advance; either way it is 0.
    if (space.baseLetterSpacingPx !== 0) continue;
    const advance = space.widthPx;
    if (!(advance > 0) || advance >= space.fontSizePx) continue;
    let start = index - 1;
    while (!afterHan && start > 0 && ascii.test(glyphs[start - 1].character) && index - start < maxTokenLength) start--;
    if (index - start >= maxTokenLength || glyphs.slice(start, index).some(glyph =>
      regularSourceProfile(view, glyph, true, afterHan) !== profile || glyph.baseLetterSpacingPx !== 0)) continue;
    const blank = rect(index), next = rect(index + 1), first = rect(start), last = rect(index - 1);
    if (!blank || !next || !first || !last) { complete = false; continue; }
    let eligible = false;
    if (own) {
      eligible = sameTerminalLine(last, blank) &&
        terminalPunctuationStillHangs(blank.left, right, advance, laterLine(next, blank));
    } else {
      let before = start - 1, separator = 0;
      if (before >= 0 && glyphs[before].character === " ") {
        if (!regularSourceProfile(view, glyphs[before], true) || glyphs[before].baseLetterSpacingPx !== 0) continue;
        separator = glyphs[before].widthPx;
        before--;
      }
      if (before < 0) continue;
      const previous = rect(before);
      if (!previous) { complete = false; continue; }
      if (!earlierLine(previous, first) || !sameTerminalLine(first, last)) continue;
      const remaining = right - previous.right, wordAdvance = last.right - first.left + separator;
      eligible = wordAdvance > 0 && wordAdvance <= remaining + epsilon &&
        wordAdvance + advance > remaining + epsilon;
    }
    if (!eligible) continue;
    if (++candidates > maxCandidates) return empty();
    specs.push({ from: space.from, to: space.to, baseLetterSpacingPx: 0,
      advancePx: advance, letterSpacingPx: -advance, attributes: {
        [TRAILING_SPACE_ATTR]: "true", "data-docs-word-cjk-spacing": "trailing-space",
        "data-docs-word-cjk-base-letter-spacing": "0", style: `letter-spacing:${-advance}px`,
      } });
  }
  for (let index = 1; overflowPunctuation && index < glyphs.length; index++) {
    const mark = glyphs[index];
    if (
      !punctuation.test(mark.character) &&
      !pathPunctuation.test(mark.character)
    )
      continue;
    const body=bodyHanging(index);
    if(body){if(++candidates>maxCandidates)return empty();specs.push(...body);continue;}
    // A line break ends its line as the paragraph end does; the rule below
    // reads only the stop's own line.
    if (index === glyphs.length - 1 || glyphs[index + 1].character === "\n") {
      if (!punctuation.test(mark.character)) continue;
      if (win.CSS.supports("hanging-punctuation", "allow-end")) continue;
      const markerElement = elementAt(view, mark.from);
      const own = markerElement?.closest<HTMLElement>(
        `[${TERMINAL_PUNCTUATION_ATTR}]`,
      );
      const markProfile = regularSourceProfile(view, mark, false, true);
      const boldMarkProfile =
        !markProfile && mark.character === "。"
          ? regularSourceProfile(view, mark, false, true, true)
          : null;
      const bold = boldMarkProfile !== null;
      // Only the display-font owner's admitted residuals prove a derived
      // prefix advance. A DOM class or an unrelated decoration is not proof.
      const displayDecorations = bold
        ? documentDisplayFontPluginKey.getState(view.state)?.decorations
        : null;
      const hasProvenAdvance = (glyph: TerminalPunctuationGlyph) =>
        !!displayDecorations
          ?.find(
            glyph.from,
            glyph.to,
            (spec) => spec.syntheticBoldAdvance === true,
          )
          .some(
            (decoration) =>
              decoration.from <= glyph.from && decoration.to >= glyph.to,
          );
      if (bold && (!displayDecorations || hasProvenAdvance(mark))) continue;
      const saved = own?.getAttribute(TERMINAL_PUNCTUATION_BASE_ATTR);
      const base =
        saved != null && saved.trim() !== ""
          ? Number(saved)
          : mark.baseLetterSpacingPx;
      if (
        (!markProfile && !boldMarkProfile) ||
        base !== 0 ||
        (own && saved == null)
      )
        continue;
      const wordChar = /^[A-Za-z0-9_]$/;
      const han = /^[\u4e00-\u9fff]$/;
      // A path or dotted name before the stop is one token, as in the body
      // rule; bold keeps the word its advance controls cover.
      const tokenCharacter = bold ? wordChar : ascii;
      let start = index - 1;
      if (tokenCharacter.test(glyphs[start].character)) {
        while (
          start > 0 &&
          tokenCharacter.test(glyphs[start - 1].character) &&
          index - start < maxTokenLength
        )
          start--;
      } else if (!han.test(glyphs[start].character)) continue;
      if (index - start >= maxTokenLength) continue;
      const tokenProfile = regularSourceProfile(
        view,
        glyphs[start],
        true,
        true,
        bold,
      );
      if (
        !tokenProfile ||
        glyphs
          .slice(start, index)
          .some(
            (glyph) =>
              regularSourceProfile(view, glyph, true, true, bold) !==
                tokenProfile ||
              !Number.isFinite(glyph.baseLetterSpacingPx) ||
              (bold
                ? !hasProvenAdvance(glyph)
                : glyph.baseLetterSpacingPx !== 0),
          )
      )
        continue;
      if (bold) {
        const markCss = markerElement && win.getComputedStyle(markerElement);
        if (
          !markCss ||
          markCss.fontWeight !== "700" ||
          markCss.fontStyle !== "normal" ||
          (markCss.wordSpacing !== "normal" &&
            Number.parseFloat(markCss.wordSpacing) !== 0)
        )
          continue;
      }
      let token = rect(start);
      const punct = rect(index),
        lastTokenGlyph = rect(index - 1);
      if (!token || !punct || !lastTokenGlyph) {
        complete = false;
        continue;
      }
      // A token that already wraps legally inside (after a hyphen) carries
      // only its suffix on the stop's line; the rest stays where it is.
      let suffix = false;
      if (!bold && earlierLine(token, punct)) {
        let low = start,
          high = index - 1,
          missing = false;
        while (low < high) {
          const middle = Math.floor((low + high) / 2),
            current = rect(middle);
          if (!current) {
            missing = true;
            break;
          }
          if (earlierLine(current, punct)) low = middle + 1;
          else high = middle;
        }
        const first = missing ? null : rect(low);
        if (!first) {
          complete = false;
          continue;
        }
        start = low;
        token = first;
        suffix = true;
      }
      const advance = mark.widthPx - mark.baseLetterSpacingPx;
      if (
        !(advance > 0) ||
        !Number.isFinite(advance) ||
        (!bold && !sameTerminalLine(token, punct))
      )
        continue;
      let eligible = false;
      if (own) {
        eligible =
          terminalPunctuationStillHangs(punct.left, right, advance, true) &&
          punct.left > token.left;
      } else if (bold && earlierLine(lastTokenGlyph, punct)) {
        // The prefix can already end on the previous line while only the
        // full stop wraps. There is no carried suffix to charge again.
        eligible =
          lastTokenGlyph.right <= right + epsilon &&
          lastTokenGlyph.right + advance > right + epsilon;
      } else {
        if (!sameTerminalLine(token, punct)) continue;
        let before = start - 1;
        const hasSpace = !suffix && before >= 0 && glyphs[before].character === " ";
        if (hasSpace) before--;
        if (before < 0 || glyphs[before].character === " ") continue;
        const space = hasSpace ? glyphs[start - 1] : null;
        if (
          space &&
          (regularSourceProfile(view, space, true, false, bold) !==
            tokenProfile ||
            (bold ? !hasProvenAdvance(space) : space.baseLetterSpacingPx !== 0))
        )
          continue;
        const previous = rect(before);
        if (!previous) {
          complete = false;
          continue;
        }
        if (!earlierLine(previous, token)) continue;
        const spacing = space?.widthPx ?? 0;
        const tokenAdvance = punct.left - token.left + spacing;
        const remaining = right - previous.right;
        eligible =
          Number.isFinite(spacing) &&
          spacing >= 0 &&
          tokenAdvance > 0 &&
          tokenAdvance <= remaining + epsilon &&
          tokenAdvance + advance > remaining + epsilon;
      }
      if (eligible)
        specs.push({
          from: mark.from,
          to: mark.to,
          baseLetterSpacingPx: base,
          advancePx: advance,
          letterSpacingPx: base - advance,
          attributes: {
            [TERMINAL_PUNCTUATION_ATTR]: "true",
            [TERMINAL_PUNCTUATION_BASE_ATTR]: String(base),
            "data-docs-word-cjk-spacing": "terminal",
            "data-docs-word-cjk-base-letter-spacing": String(base),
            style: `letter-spacing:${base - advance}px`,
          },
        });
      continue;
    }
    let start = index;
    while (
      start > 0 &&
      ascii.test(glyphs[start - 1].character) &&
      index - start < maxTokenLength
    )
      start--;
    if (
      start === index &&
      /^[\u4e00-\u9fff]$/.test(glyphs[index - 1].character)
    )
      start--;
    if (
      start === index ||
      index - start >= maxTokenLength ||
      (!ascii.test(glyphs[index + 1].character) &&
        !/^[\u4e00-\u9fff]$/.test(glyphs[index + 1].character))
    )
      continue;
    let end = index + 1;
    while (
      end + 1 < glyphs.length &&
      ascii.test(glyphs[end + 1].character) &&
      end - index < maxTokenLength
    )
      end++;
    if (end - index >= maxTokenLength) continue;
    if (++candidates > maxCandidates) return empty();
    // A closing comma before a source path has an independent boundary rule.
    // It is not terminal hanging and is needed even with native hanging CSS.
    if (
      start > 0 &&
      pathPunctuation.test(mark.character) &&
      glyphs[index + 1].character === "/" &&
      /^[A-Za-z]$/.test(glyphs[index + 2]?.character ?? "")
    ) {
      const markerElement = elementAt(view, mark.from);
      const ownPath = markerElement?.closest<HTMLElement>(
        `[${PATH_PUNCTUATION_ATTR}]`,
      );
      const markProfile = regularSourceProfile(view, mark, false, true);
      const tokenProfile = regularSourceProfile(
        view,
        glyphs[start],
        true,
        true,
      );
      const pathProfile = regularSourceProfile(view, glyphs[index + 1], true);
      const leading = glyphs.slice(start, index),
        path = glyphs.slice(index + 1, end + 1);
      let before = start - 1;
      const hasSpace = glyphs[before].character === " ";
      if (hasSpace) before--;
      const safeGlyphs = (
        items: readonly TerminalPunctuationGlyph[],
        profile: string | null,
        asciiPath = false,
      ) =>
        profile !== null &&
        items.every(
          (glyph) =>
            regularSourceProfile(view, glyph, asciiPath, true) === profile &&
            glyph.baseLetterSpacingPx === 0,
        );
      const spaceSafe =
        !hasSpace ||
        (glyphs[start - 1].widthPx > 0 &&
          glyphs[start - 1].widthPx < mark.fontSizePx &&
          regularSourceProfile(view, glyphs[start - 1], true) !== null &&
          glyphs[start - 1].baseLetterSpacingPx === 0);
      if (
        before >= 0 &&
        glyphs[before].character !== " " &&
        markProfile &&
        mark.baseLetterSpacingPx === 0 &&
        safeGlyphs(leading, tokenProfile, true) &&
        safeGlyphs(path, pathProfile, true)
      ) {
        const comma = rect(index),
          slash = rect(index + 1),
          first = rect(start);
        if (!comma || !slash || !first) {
          complete = false;
          continue;
        }
        // Only the current visual suffix of an already-wrapped ASCII path
        // travels with the delimiter. Binary search bounds DOM reads.
        let fragmentStart = start;
        if (earlierLine(first, comma)) {
          let low = start,
            high = index - 1,
            missing = false;
          while (low < high) {
            const middle = Math.floor((low + high) / 2),
              current = rect(middle);
            if (!current) {
              missing = true;
              break;
            }
            if (earlierLine(current, comma)) low = middle + 1;
            else high = middle;
          }
          if (missing) {
            complete = false;
            continue;
          }
          fragmentStart = low;
          before = low - 1;
        }
        const token = rect(fragmentStart),
          prior = rect(before);
        if (!token || !prior) {
          complete = false;
          continue;
        }
        const pathWidth = path.reduce((sum, glyph) => sum + glyph.widthPx, 0);
        const spacing =
          hasSpace && fragmentStart === start ? glyphs[start - 1].widthPx : 0;
        const tokenCommaWidth = comma.right - token.left;
        const remaining = right - prior.right;
        const sourceStylesMatch = (position: number, size: number) => {
          const el = elementAt(view, position);
          if (!el) return false;
          const css = win.getComputedStyle(el);
          return (
            ["normal", "400"].includes(css.fontWeight) &&
            css.fontStyle === "normal" &&
            Math.abs(Number.parseFloat(css.fontSize) - size) < 0.001 &&
            (css.wordSpacing === "normal" ||
              Number.parseFloat(css.wordSpacing) === 0)
          );
        };
        // The path may be longer than a line: Word still breaks after the
        // delimiter and wraps the path on its own ("证据：" ends its line,
        // the 100-character source path takes the next two), so the boundary
        // is released whenever the token and delimiter fit the line before.
        const eligible =
          (fragmentStart > start || spaceSafe) &&
          sameTerminalLine(token, comma) &&
          tokenCommaWidth > 0 &&
          pathWidth > 0 &&
          sourceStylesMatch(
            glyphs[fragmentStart].from,
            glyphs[fragmentStart].fontSizePx,
          ) &&
          sourceStylesMatch(mark.from, mark.fontSizePx) &&
          sourceStylesMatch(
            glyphs[index + 1].from,
            glyphs[index + 1].fontSizePx,
          ) &&
          (ownPath
            ? comma.right <= right + epsilon &&
              comma.left > token.left &&
              laterLine(slash, comma) &&
              pathWidth > right - comma.right + epsilon
            : earlierLine(prior, token) &&
              sameTerminalLine(comma, slash) &&
              spacing + tokenCommaWidth <= remaining + epsilon &&
              spacing + tokenCommaWidth + pathWidth > remaining + epsilon);
        if (eligible) {
          specs.push({
            from: mark.from,
            to: mark.to,
            baseLetterSpacingPx: 0,
            advancePx: mark.widthPx,
            letterSpacingPx: 0,
            attributes: {
              [PATH_PUNCTUATION_ATTR]: "true",
              style: "line-break:anywhere",
            },
          });
          continue;
        }
      }
      // A stale path projection must be withdrawn, never reinterpreted as a
      // terminal zero-advance projection in the same pass.
      if (ownPath) continue;
    }
    if (
      !punctuation.test(mark.character) ||
      !ascii.test(glyphs[index - 1].character)
    )
      continue;
    if (win.CSS.supports("hanging-punctuation", "allow-end")) continue;
    const markerElement = elementAt(view, mark.from),
      own = markerElement?.closest<HTMLElement>(
        `[${TERMINAL_PUNCTUATION_ATTR}]`,
      );
    const savedValue = own?.getAttribute(TERMINAL_PUNCTUATION_BASE_ATTR);
    const saved =
      savedValue != null && savedValue.trim() !== "" ? Number(savedValue) : NaN;
    if (own && !Number.isFinite(saved)) continue;
    const base = Number.isFinite(saved) ? saved : mark.baseLetterSpacingPx;
    if (!Number.isFinite(base) || base !== 0) continue;
    const profile = regularSourceProfile(view, mark);
    if (!profile) continue;
    // A long ASCII path may already have a legal split (for example at a
    // hyphen). Only its trailing visual fragment is moved with a closing mark.
    // Do not charge the whole path against the previous line's remaining width.
    if (
      /^[\u4e00-\u9fff]$/.test(glyphs[index + 1].character) &&
      glyphs[start].character === "/" &&
      /^[A-Za-z]$/.test(glyphs[start + 1]?.character ?? "")
    ) {
      const pathProfile = regularSourceProfile(view, glyphs[start], true);
      const path = glyphs.slice(start, index),
        following = glyphs[index + 1];
      if (
        !pathProfile ||
        path.some(
          (glyph) =>
            regularSourceProfile(view, glyph, true) !== pathProfile ||
            glyph.baseLetterSpacingPx !== 0,
        ) ||
        regularSourceProfile(view, following) !== profile ||
        following.baseLetterSpacingPx !== 0
      )
        continue;
      const punct = rect(index),
        next = rect(index + 1),
        pathFirst = rect(start);
      if (!punct || !next || !pathFirst) {
        complete = false;
        continue;
      }
      const advance = mark.widthPx - mark.baseLetterSpacingPx;
      if (!Number.isFinite(advance) || advance <= 0) continue;
      let eligible = false;
      if (own) {
        eligible =
          terminalPunctuationStillHangs(
            punct.left,
            right,
            advance,
            laterLine(next, punct),
          ) && following.widthPx > right - punct.left + epsilon;
      } else if (
        earlierLine(pathFirst, punct) &&
        sameTerminalLine(next, punct)
      ) {
        let low = start,
          high = index - 1,
          missing = false;
        while (low < high) {
          const middle = Math.floor((low + high) / 2),
            current = rect(middle);
          if (!current) {
            missing = true;
            break;
          }
          if (earlierLine(current, punct)) low = middle + 1;
          else high = middle;
        }
        if (missing) {
          complete = false;
          continue;
        }
        const first = rect(low),
          previous = rect(low - 1);
        if (!first || !previous) {
          complete = false;
          continue;
        }
        if (
          low > start &&
          sameTerminalLine(first, punct) &&
          earlierLine(previous, first)
        ) {
          eligible = terminalPunctuationFit({
            remainingPx: right - previous.right,
            tokenAdvancePx: punct.left - first.left,
            punctuationAdvancePx: advance,
            nextTokenAdvancePx: following.widthPx,
          });
        }
      }
      if (eligible)
        specs.push({
          from: mark.from,
          to: mark.to,
          baseLetterSpacingPx: base,
          advancePx: advance,
          letterSpacingPx: base - advance,
          attributes: {
            [TERMINAL_PUNCTUATION_ATTR]: "true",
            [TERMINAL_PUNCTUATION_BASE_ATTR]: String(base),
            "data-docs-word-cjk-spacing": "terminal",
            "data-docs-word-cjk-base-letter-spacing": String(base),
            style: `letter-spacing:${base - advance}px`,
          },
        });
      continue;
    }
    if (start === 0 || !ascii.test(glyphs[index + 1].character)) continue;
    const interval = glyphs.slice(start, end + 1);
    if (
      interval.some(
        (glyph, offset) =>
          glyph.from !==
            (offset === 0 ? glyph.from : interval[offset - 1].to) ||
          regularSourceProfile(view, glyph) !== profile ||
          (glyph !== mark && glyph.baseLetterSpacingPx !== 0),
      )
    )
      continue;
    const markStyle = markerElement && win.getComputedStyle(markerElement);
    if (
      !markStyle ||
      !["normal", "400"].includes(markStyle.fontWeight) ||
      markStyle.fontStyle !== "normal" ||
      (markStyle.wordSpacing !== "normal" &&
        Number.parseFloat(markStyle.wordSpacing) !== 0)
    )
      continue;
    const advance = mark.widthPx - mark.baseLetterSpacingPx;
    if (!(advance > 0) || !Number.isFinite(advance)) continue;
    const token = rect(start),
      punct = rect(index),
      next = rect(index + 1),
      last = rect(end);
    if (!token || !punct || !next || !last) {
      complete = false;
      continue;
    }
    if (!sameTerminalLine(token, punct) || !sameTerminalLine(next, last)) continue;
    let eligible = false;
    if (own) {
      eligible = terminalPunctuationStillHangs(
        punct.left,
        right,
        advance,
        laterLine(next, punct),
      );
    } else {
      const previous = rect(start - 1);
      if (!previous) {
        complete = false;
        continue;
      }
      // First token on a later line, immediately after a non-space source glyph.
      // Space-before-token rules need their own evidence and are not guessed.
      if (
        glyphs[start - 1].character === " " ||
        !earlierLine(previous, token)
      )
        continue;
      eligible = terminalPunctuationFit({
        remainingPx: right - previous.right,
        tokenAdvancePx: punct.left - token.left,
        punctuationAdvancePx: advance,
        nextTokenAdvancePx: last.right - next.left,
      });
    }
    if (!eligible) continue;
    const letterSpacing = base - advance;
    specs.push({
      from: mark.from,
      to: mark.to,
      baseLetterSpacingPx: base,
      advancePx: advance,
      letterSpacingPx: letterSpacing,
      attributes: {
        [TERMINAL_PUNCTUATION_ATTR]: "true",
        [TERMINAL_PUNCTUATION_BASE_ATTR]: String(base),
        "data-docs-word-cjk-spacing": "terminal",
        "data-docs-word-cjk-base-letter-spacing": String(base),
        style: `letter-spacing:${letterSpacing}px`,
      },
    });
  }
  // Every decision above reads the current layout, but a change on one line
  // moves every later line: an internal mark that starts hanging pulls its
  // token back, and a later path that looked carried is not. Apply the first
  // change in reading order (a withdrawal or a new projection) and let later
  // new projections wait for the layout it produces; retained ones stay.
  // A candidate that projected nothing was judged on that same layout (a
  // full stop after a path whose break before it only moved with the change),
  // so a paragraph that changes at all is measured again.
  const definingAttribute = (spec: TerminalPunctuationSpec) =>
    [TERMINAL_PUNCTUATION_ATTR, PATH_PUNCTUATION_ATTR, TRAILING_SPACE_ATTR].find(
      (name) => spec.attributes[name] !== undefined,
    ) ?? null;
  const groups: { at: number; fresh: boolean; specs: TerminalPunctuationSpec[] }[] = [];
  for (const spec of specs) {
    const name = definingAttribute(spec);
    // A hanging space is emitted right after the mark it belongs to.
    if (name === null && groups.length > 0) {
      groups[groups.length - 1].specs.push(spec);
      continue;
    }
    const owned = name !== null && Boolean(elementAt(view, spec.from)?.closest(`[${name}]`));
    groups.push({ at: spec.from, fresh: !owned, specs: [spec] });
  }
  const emitted = new Set(groups.map((group) => group.at));
  let firstChange = Number.POSITIVE_INFINITY;
  for (const projected of element.querySelectorAll<HTMLElement>(
    `[${TERMINAL_PUNCTUATION_ATTR}],[${PATH_PUNCTUATION_ATTR}],[${TRAILING_SPACE_ATTR}]`,
  )) {
    let at: number;
    try {
      at = view.posAtDOM(projected, 0);
    } catch {
      continue;
    }
    if (!emitted.has(at)) firstChange = Math.min(firstChange, at);
  }
  for (const group of groups) if (group.fresh) firstChange = Math.min(firstChange, group.at);
  const kept = groups
    .filter((group) => !group.fresh || group.at <= firstChange)
    .flatMap((group) => group.specs);
  return {
    specs: kept,
    complete,
    settled: firstChange === Number.POSITIVE_INFINITY,
    signature:
      kept
        .map(
          (spec) =>
            `${spec.from}:${spec.to}:${spec.baseLetterSpacingPx}:${spec.advancePx}:${spec.attributes.style}`,
        )
        .join("|") || "none",
  };
}
