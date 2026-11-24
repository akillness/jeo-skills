/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { layoutProbeParent } from "../../lib/layout-probe-root";

/**
 * Where the probes are laid out: the page's shared probe root, a shadow root
 * under one persistent, hidden host on the body (lib/layout-probe-root). A
 * probe appended to the body itself changed the body's children, and WebKit
 * restyled the whole document for each one -- with four windows open about
 * 650 ms a probe, one per face the document draws with. Inside the shadow
 * root a probe restyles only its own tree. The host inherits from the body
 * as a probe did, and @font-face reaches a shadow tree, so every number is
 * the one the body probe read (189 face, weight and line-height pairs
 * compared in Chromium and WebKit).
 */
const probeParent = layoutProbeParent;

/** Synchronous, non-interactive CSS line-box measurement. Font identity and
 * native compatibility policy belong to the caller, not this shared probe. */
export function measureOfficeFontLineBox(doc: Document, options: {
  font: string;
  lineHeight: string;
  measureHeight: boolean;
}): {baselinePx: number; heightPx?: number} | undefined {
  if (!doc.body) return undefined;
  const probe = doc.createElement("div"), marker = doc.createElement("span");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText = "position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;contain:layout style paint;white-space:nowrap;width:1000px;padding:0;margin:0;border:0;";
  probe.style.font = options.font;
  probe.style.lineHeight = options.lineHeight;
  marker.style.cssText = "display:inline-block;width:0;height:0;padding:0;margin:0;border:0;vertical-align:baseline";
  probe.append(doc.createTextNode("Hg"), marker);
  probeParent(doc).append(probe);
  try {
    const baselinePx = marker.getBoundingClientRect().y - probe.getBoundingClientRect().y;
    return {baselinePx, ...(options.measureHeight ? {heightPx: probe.getBoundingClientRect().height} : {})};
  } finally {
    probe.remove();
  }
}

export interface OfficeGlyphBaselineOptions {font:string;character:string;lineHeight?:string}
export interface OfficeGlyphBaselineMeasurement {glyphBaselineOffsetPx:number;baselinePx:number;heightPx:number}

function glyphProbe(doc:Document,options:OfficeGlyphBaselineOptions){
  if(Array.from(options.character).length!==1 || /\s/u.test(options.character))return undefined;
  const probe=doc.createElement("span"),marker=doc.createElement("span"),text=doc.createTextNode(options.character);
  probe.setAttribute("aria-hidden","true");
  probe.style.cssText="position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;display:inline-block;white-space:nowrap;padding:0;margin:0;border:0;";
  probe.style.font=options.font;probe.style.lineHeight=options.lineHeight??"normal";
  marker.style.cssText="display:inline-block;width:0;height:0;padding:0;margin:0;border:0;vertical-align:baseline";
  probe.append(text,marker);return {probe,marker,text};
}
function readGlyphProbe(doc:Document,item:NonNullable<ReturnType<typeof glyphProbe>>):OfficeGlyphBaselineMeasurement|undefined{
  const {probe,marker,text}=item,range=doc.createRange();range.setStart(text,0);range.setEnd(text,text.length);
  const glyph=Array.from(range.getClientRects()).find(rect=>rect.width>0&&rect.height>0);
  if(!glyph)return undefined;
  const box=probe.getBoundingClientRect(),baseline=marker.getBoundingClientRect().top;
  const result={glyphBaselineOffsetPx:baseline-glyph.top,baselinePx:baseline-box.top,heightPx:box.height};
  return Object.values(result).every(Number.isFinite)?result:undefined;
}

/** Attach before reading: interleaved append/read/remove forces WebKit to
 * relayout the containing document for every glyph. Nothing is cached here;
 * the caller retains font-generation authority and exact measurement keys.
 * Temporary probes are outside the editor and removed even on exceptions. */
export function measureOfficeGlyphBaselineOffsets(doc:Document,options:readonly OfficeGlyphBaselineOptions[]):Array<OfficeGlyphBaselineMeasurement|undefined>{
  const results:Array<OfficeGlyphBaselineMeasurement|undefined>=options.map(()=>undefined);
  if(!doc.body)return results;
  for(let start=0;start<options.length;start+=128){
    const probes=options.slice(start,start+128).map(option=>glyphProbe(doc,option));
    const fragment=doc.createDocumentFragment();
    try{
      for(const item of probes)if(item)fragment.append(item.probe);
      probeParent(doc).append(fragment);
      probes.forEach((item,index)=>{if(item)results[start+index]=readGlyphProbe(doc,item);});
    }finally{for(const item of probes)item?.probe.remove();}
  }
  return results;
}

/** Measure one painted character without inserting nodes into editor content. */
export function measureOfficeGlyphBaselineOffset(doc:Document,options:OfficeGlyphBaselineOptions):OfficeGlyphBaselineMeasurement|undefined{
  return measureOfficeGlyphBaselineOffsets(doc,[options])[0];
}

/**
 * The face's own font bounding box, i.e. hhea `ascender - descender` WITHOUT
 * hhea `lineGap`. The CSS `normal` line box measured above is the same quantity
 * WITH lineGap; the two differ only for a face that declares one (Times New
 * Roman among the ten measured control faces, SimSun and Hiragino Sans GB being
 * the discriminating East Asian points).
 *
 * Read from an inline box's content area, which is its first available face's
 * ascent plus descent whatever the line-height. Canvas `fontBoundingBox` is
 * the same number in Chromium, but WebKit's canvas does not resolve faces the
 * user installed (Office's DengXian, Aptos): it measured the next family in
 * the stack instead, and a Word document set in DengXian paginated with
 * PingFang SC's pitch. The DOM resolves the face exactly as the page paints
 * it. Returns undefined when the font shorthand is rejected or nothing lays
 * out, so the caller falls back rather than invents a metric.
 */
export function measureOfficeFontBoundingBox(
  doc: Document,
  font: string,
): number | undefined {
  if (!doc.body) return undefined;
  const probe = doc.createElement("div");
  const inline = doc.createElement("span");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText =
    "position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;contain:layout style paint;white-space:nowrap;line-height:0";
  inline.style.font = font;
  // A rejected shorthand leaves the declaration empty; the span would then
  // inherit an unrelated face.
  if (!inline.style.fontFamily) return undefined;
  // The shorthand resets line-height; the content area does not depend on it,
  // but a zero strut keeps the probe's own line box from mattering at all.
  inline.style.lineHeight = "0";
  inline.textContent = "Hg";
  probe.append(inline);
  probeParent(doc).append(probe);
  try {
    const height = inline.getBoundingClientRect().height;
    return Number.isFinite(height) && height > 0 ? height : undefined;
  } finally {
    probe.remove();
  }
}

export interface OfficeGlyphAdvanceOptions {
  font: string;
  character: string;
}

/**
 * The advance of each character in a computed face, as the page lays it out.
 *
 * A canvas given the same font string can resolve a different face: WebKit's
 * does not see faces the user installed (SimSun, DengXian), and measured
 * Songti SC's proportional Latin where the page paints SimSun's half-width
 * letters. Each character sits alone on its own line, so no neighbour shapes,
 * kerns or trims it, which is what a canvas measures of one character. An
 * inline box's width is the run's advance (WebKit keeps it unrounded;
 * Chromium rounds it up to 1/64px). Undefined where nothing lays out or the
 * shorthand is rejected. One attachment for the whole batch.
 */
export function measureOfficeGlyphAdvances(
  doc: Document,
  options: readonly OfficeGlyphAdvanceOptions[],
): Array<number | undefined> {
  const results: Array<number | undefined> = options.map(() => undefined);
  if (!doc.body || options.length === 0) return results;
  const probe = doc.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText =
    "position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;contain:layout style paint;" +
    "white-space:pre;width:max-content;letter-spacing:normal;word-spacing:normal;" +
    "text-spacing-trim:space-all;text-autospace:no-autospace";
  const lines = options.map((option) => {
    const line = doc.createElement("div");
    const inline = doc.createElement("span");
    inline.style.font = option.font;
    if (!inline.style.fontFamily) return null;
    inline.textContent = option.character;
    line.append(inline);
    probe.append(line);
    return { line, inline };
  });
  probeParent(doc).append(probe);
  try {
    lines.forEach((item, index) => {
      // A laid-out line has its strut's height even around a zero advance.
      if (!item || !(item.line.getBoundingClientRect().height > 0)) return;
      const width = item.inline.getBoundingClientRect().width;
      if (Number.isFinite(width) && width >= 0) results[index] = width;
    });
  } finally {
    probe.remove();
  }
  return results;
}
