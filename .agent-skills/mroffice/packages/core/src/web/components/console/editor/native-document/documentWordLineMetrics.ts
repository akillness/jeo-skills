/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { ptToPx } from "../../../../lib/office-units";
import {localWordLineMetricReference} from "./documentLocalWordLineMetrics";
import type { Mark } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";
import type { OfficeFontFace } from "../../../office-ribbon/officeFontFace";
import { officeFontFaceFamily } from "../../../office-ribbon/officeFontFace";
import { measureOfficeFontLineBox } from "../../../office-ribbon/officeFontLineBox";
import { normalizeSectionLayouts } from "./sectionLayouts";
import controls from "./wordLineMetricControls.json";
import monoControls from "./wordMonoLineMetricControls.json";
import { inheritedBoldValue } from "./boldExtension";

/** Explicit native preservation target, not a claim about unknown Word/Web
 * releases or the app used by the document's previous author. */
export const WORD_LINE_METRICS_TARGET = "word-macos-16.86.24060916-installed-print" as const;
export type WordLineMetricsTarget = typeof WORD_LINE_METRICS_TARGET;
export interface WordFontSourceContext {
  documentId: string;
  resourceVersionId: string;
  context: {
    schemaVersion: 1;
    fontActivation: "external-only" | "embedded-or-mixed";
    fontTableSha256: string;
    settingsSha256: string;
    compatibilityMode: number | null;
    sectionCount: number;
    gridMode: "none" | "present";
    charsets: {family: string; charset: string | null}[];
  };
}
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const exactKeys = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).sort().join() === keys.sort().join();
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function readWordFontSourceContext(value: unknown): WordFontSourceContext | null {
  const raw=object(value), context=object(raw?.context);
  if (!raw || !context || !exactKeys(raw,["documentId","resourceVersionId","context"]) ||
      typeof raw.documentId!=="string" || !uuid.test(raw.documentId) || typeof raw.resourceVersionId!=="string" || !uuid.test(raw.resourceVersionId) ||
      !exactKeys(context,["schemaVersion","fontActivation","fontTableSha256","settingsSha256","compatibilityMode","sectionCount","gridMode","charsets"]) ||
      context.schemaVersion!==1 || typeof context.fontActivation!=="string" || !["external-only","embedded-or-mixed"].includes(context.fontActivation) ||
      typeof context.gridMode!=="string" || !["none","present"].includes(context.gridMode) || !Number.isInteger(context.sectionCount) || Number(context.sectionCount)<1 || Number(context.sectionCount)>256 ||
      (context.compatibilityMode!==null && (!Number.isInteger(context.compatibilityMode) || Number(context.compatibilityMode)<1 || Number(context.compatibilityMode)>99)) ||
      ![context.fontTableSha256,context.settingsSha256].every(v=>typeof v==="string" && /^[a-f0-9]{64}$/.test(v)) ||
      !Array.isArray(context.charsets) || context.charsets.length>256) return null;
  const seen=new Set<string>();
  for (const entry of context.charsets) {
    const row=object(entry);
    if (!row || !exactKeys(row,["family","charset"]) || typeof row.family!=="string" || !row.family.trim() || row.family.length>256 ||
        /[\x00-\x1f\x7f]/.test(row.family) || seen.has(row.family.toLowerCase()) ||
        (row.charset!==null && (typeof row.charset!=="string" || !/^[a-f0-9]{2}$/.test(row.charset)))) return null;
    seen.add(row.family.toLowerCase());
  }
  return raw as unknown as WordFontSourceContext;
}

// Actual regular face, prepared by the existing canonical font validator.
// Original SHA876af2cd...; glyf/hmtx/hhea/maxp/cmap unchanged. Hash is necessary
// but not sufficient: the source activation and target profile are also gated.
const REGULAR_FONT_SHA = controls.canonicalFontSha256;
// Native origins from independent controls, never from guide page boundaries.
// Independent 12/18/25-line controls; measured Print grid 0.24pt (300dpi).
// No interpolation/extrapolation to other sizes or auto line multipliers.
const OBSERVATIONS = controls.controls.map(row=>({sizePt:row.fontSizePt,line:row.autoLine240ths,
  advancePt:row.lineAdvancePt,ascentPt:row.lineAscentPt}));
function coveredText(text:string):boolean {
  // These horizontal controls do not establish complex-script shaping or
  // bidi line boxes, even when the face contains those glyphs.
  if (/[\u0590-\u109f\u1780-\u17ff\u200c-\u200f\u202a-\u202e\u2066-\u2069]/u.test(text)) return false;
  return [...text].every(char=>{
    const code=char.codePointAt(0)!;
    if (code===9 || code===10 || code===13) return true;
    let low=0,high=controls.glyphCoverageRanges.length-1;
    while(low<=high){const middle=(low+high)>>1,range=controls.glyphCoverageRanges[middle];
      if(code<range[0])high=middle-1;else if(code>range[1])low=middle+1;else return true;}
    return false;
  });
}
export interface WordLineBox {fontSizePx:number; lineHeightPx:number; ascentPx:number; descentPx:number; referenceFontSha256:string}
const horizontalDocumentCache=new WeakMap<object,boolean>();
const uprightStyleCache=new WeakMap<object,WeakMap<object,boolean>>();
function knownUprightStyle(state:EditorState,block:EditorState['doc']):boolean {
  const cache=uprightStyleCache.get(state.doc.attrs) ?? new WeakMap<object,boolean>();
  uprightStyleCache.set(state.doc.attrs,cache);
  const cached=cache.get(block.attrs);if(cached!==undefined)return cached;
  const decide=()=>{
    const definitions=object(state.doc.attrs.styleDefinitions);
    if (!definitions || definitions.version!==1 || !Array.isArray(definitions.styles) || definitions.styles.length>512 || block.attrs.customStyleName) return false;
    const rows=definitions.styles.map(object),styles=new Map(rows.filter(row=>typeof row?.styleId==='string').map(row=>[row!.styleId,row!]));
    if (styles.size!==rows.length) return false;
    const defaults=rows.filter(row=>row?.type==='paragraph' && row.default===true);
    const id=block.attrs.docxStyleId ?? block.attrs.customStyleId ??
      (block.type.name==='heading' ? `Heading${block.attrs.level ?? 1}` : defaults.length===1 ? defaults[0]?.styleId : null);
    if (typeof id!=='string' || !id) return false;
    const seen=new Set<string>();let current:unknown=id;
    while(current){
      if(typeof current!=='string' || seen.has(current))return false;
      seen.add(current);const row=styles.get(current);
      if(!row || row.type!=='paragraph')return false;
      const italic=object(row.rPr)?.italic;
      if(italic!=null && typeof italic!=='boolean')return false;
      if(row.basedOn!=null && (typeof row.basedOn!=='string' || !row.basedOn))return false;
      current=row.basedOn;
    }
    // Reuse the existing Word toggle resolver by projecting the italic toggle
    // into its bold slot. No style values or precedence are reimplemented.
    const mapRun=(rPr:unknown)=>({...object(rPr),bold:object(rPr)?.italic});
    const base=object(definitions.docDefaults),baseRun=object(base?.rPr);
    if(baseRun?.italic!=null && typeof baseRun.italic!=='boolean')return false;
    const attrs={...state.doc.attrs,styleDefinitions:{...definitions,
      styles:rows.map(row=>({...row,rPr:mapRun(row?.rPr)})),
      docDefaults:{...base,rPr:{...mapRun(baseRun),bold:baseRun?.italic ?? false}}},
      namedStyles:Array.isArray(state.doc.attrs.namedStyles) ? state.doc.attrs.namedStyles.map(value=>({...object(value),bold:object(value)?.italic})) : []};
    return inheritedBoldValue(attrs,{type:block.type,attrs:{...block.attrs,docxStyleId:id}},[],false)===false;
  };
  const value=decide();cache.set(block.attrs,value);return value;
}
function horizontalDocument(state:EditorState):boolean {
  const attrs=state.doc.attrs;
  const cached=horizontalDocumentCache.get(attrs);if(cached!==undefined)return cached;
  const sections=normalizeSectionLayouts(attrs.sectionLayouts);
  const allowed=Boolean(sections && sections.length===1 && (!sections[0].textDirection || sections[0].textDirection==="lrTb") &&
    (!sections[0].docGrid?.type || sections[0].docGrid.type==="default") && attrs.manuscriptGrid==="off" &&
    (attrs.writingMode==null || attrs.writingMode==="horizontal-tb") && (attrs.textDirection==null || attrs.textDirection==="ltr"));
  horizontalDocumentCache.set(attrs,allowed);return allowed;
}
export type DocumentWordLineMetricInput = {
  state:EditorState; from:number; marks:readonly Mark[]; face:OfficeFontFace; text:string;
  sourceContext:WordFontSourceContext | null; target?:WordLineMetricsTarget; role:string;
};

/** Shared source/font eligibility. Each role still owns its own observations. */
export function resolveDocumentWordLineMetricContext(input: DocumentWordLineMetricInput) {
  const {state,face,sourceContext,target,marks}=input, context=sourceContext?.context;
  const file=face.asset?.files.find(file=>file.role==="regular");
  const reference = file && [REGULAR_FONT_SHA, monoControls.canonicalFontSha256].includes(file.sha256) ? file.sha256 : localWordLineMetricReference(face);
  if (target!==WORD_LINE_METRICS_TARGET || !reference || !coveredText(input.text) ||
      Object.keys(face.axes).length || !context || context.fontActivation!=="external-only" || context.compatibilityMode!==14 || context.sectionCount!==1 || context.gridMode!=="none") return null;
  const charset=context.charsets.find(row=>row.family.toLowerCase()===face.family.toLowerCase())?.charset;
  if (charset!==undefined && charset!==null && charset!=="00" && charset!=="86") return null;
  if (!horizontalDocument(state)) return null;
  const $pos=state.doc.resolve(input.from),block=$pos.parent;
  if (!block.isTextblock || block.attrs.dir==="rtl" || block.attrs.lineHeightPt!=null || block.attrs.lineHeightRule!=null) return null;
  if (!knownUprightStyle(state,block)) return null;
  let inTable=false;
  for(let depth=$pos.depth;depth>0;depth--) {
    const attrs=$pos.node(depth).attrs;
    inTable ||= ["tableCell","tableHeader"].includes($pos.node(depth).type.name);
    if (attrs.textDirection && attrs.textDirection!=="lrTb") return null;
  }
  if (marks.some(mark=>["superscript","subscript","charScale","textEffects","characterStyle"].includes(mark.type.name) ||
      (mark.type.name==="italic" && mark.attrs.value!==false))) return null;
  return {reference, block, inTable};
}

export function resolveDocumentWordLineBox(input: DocumentWordLineMetricInput):WordLineBox | null {
  if (input.role!=="regular") return null;
  const context=resolveDocumentWordLineMetricContext(input);
  if (!context || context.reference!==REGULAR_FONT_SHA) return null;
  const {reference,block,inTable}=context, {state,marks}=input;
  // The current bounded data covers explicit ordinary runs. Inherited table
  // style/synthetic bold is not independent proof of a regular native face.
  const directRegular=marks.some(mark=>mark.type.name==="bold" && mark.attrs.value===false);
  if (!directRegular) {
    const definitions=object(state.doc.attrs.styleDefinitions),defaults=object(object(definitions?.docDefaults)?.rPr);
    const styles=Array.isArray(definitions?.styles) ? definitions.styles.map(object).filter(style=>style?.type==="paragraph" && style.default===true) : [];
    const normal=styles.length===1 ? styles[0] : null;
    const normalProperties=object(normal?.rPr),styleId=block.attrs.docxStyleId ?? block.attrs.customStyleId;
    if (inTable || block.type.name!=="paragraph" || !normal || normal.basedOn ||
        (styleId && styleId!==normal.styleId) || block.attrs.customStyleName ||
        (defaults?.bold!==undefined && defaults.bold!==false) || (normalProperties?.bold!==undefined && normalProperties.bold!==false)) return null;
  }
  const size=marks.find(mark=>mark.type.name==="fontSize")?.attrs.size;
  if (typeof size!=="string" || !/^\d+(?:\.\d+)?px$/.test(size)) return null;
  const sizePx=Number.parseFloat(size),line=Number(block.attrs.lineHeight ?? state.doc.attrs.defaultLineHeight)*240;
  const row=OBSERVATIONS.find(row=>Math.abs(ptToPx(row.sizePt)-sizePx)<0.001 && Math.abs(row.line-line)<0.001);
  return row ? {fontSizePx:sizePx,lineHeightPx:ptToPx(row.advancePt),ascentPx:ptToPx(row.ascentPt),
    descentPx:ptToPx((row.advancePt-row.ascentPt)),referenceFontSha256:reference} : null;
}

export function wordLineBoxMeasurementMatches(actual:number, requested:number):boolean {
  if (!Number.isFinite(actual) || !Number.isFinite(requested)) return false;
  return Math.abs(actual-requested)<=.1 ||
    (Math.abs(actual-Math.floor(requested))<=.1 && requested-actual>=0 && requested-actual<1);
}

export const WORD_LINE_FRACTION_PROPERTY = "--document-word-line-fraction";

/** Recover only measured integer-floor loss; fractional engines need no
 * wrapper. The correction belongs to the line descent, never the source size. */
export function wordLineBoxFractionalCorrection(actual:number, requested:number):number | null {
  const remainder=requested-actual;
  return wordLineBoxMeasurementMatches(actual,requested) && remainder>.1 && remainder<1 &&
    Math.abs(actual-Math.floor(requested))<=.1 ? remainder : null;
}

/** Bind the native ascent/descent to the real CSS baseline. Relative paint
 * restores the shared glyph baseline; vertical-align allocates the native
 * ascent/descent in inline layout. Both offsets are font-local, not page-local. */
export function prepareDocumentWordLineBoxStyles(doc:Document,face:OfficeFontFace):Map<string,string> {
  const result=new Map<string,string>(),file=face.asset?.files.find(file=>file.role==="regular");
  if ((file?.sha256!==REGULAR_FONT_SHA && localWordLineMetricReference(face)!==REGULAR_FONT_SHA) || Object.keys(face.axes).length) return result;
  const family=officeFontFaceFamily(face);
  if (![...doc.fonts].some(font=>font.family.replace(/^["']|["']$/g,"")===family && font.status==="loaded" && (font.weight==="400" || font.weight==="normal") && font.style==="normal")) return result;
  for(const row of OBSERVATIONS) {
    const lineHeightPx=ptToPx(row.advancePt);
    const measured=measureOfficeFontLineBox(doc,{font:`400 ${ptToPx(row.sizePt)}px "${family}"`,lineHeight:`${lineHeightPx}px`,measureHeight:true});
    if (!measured || !Number.isFinite(measured.baselinePx) || !Number.isFinite(measured.heightPx)) continue;
    // WebKit uses integer CSS-pixel line boxes even when the requested height
    // is fractional. Keep the native requested value, accepting only that
    // independently measured floor quantization (not arbitrary height drift).
    const actual=measured.heightPx!;
    if (!wordLineBoxMeasurementMatches(actual,lineHeightPx)) continue;
    const shift=ptToPx(row.ascentPt)-measured.baselinePx;
    const fraction=wordLineBoxFractionalCorrection(actual,lineHeightPx);
    result.set(`${REGULAR_FONT_SHA}:${row.sizePt}:${row.line}`,`--document-word-font-size:${ptToPx(row.sizePt)}px;--document-word-line-height:${lineHeightPx}px;--document-word-line-baseline-shift:${shift}px${fraction===null ? "" : `;${WORD_LINE_FRACTION_PROPERTY}:${fraction}px`}`);
  }
  return result;
}
export function documentWordLineBoxStyleKey(box:WordLineBox,line:number):string {
  return `${box.referenceFontSha256}:${Math.round(box.fontSizePx*.75*2)/2}:${Math.round(line*240)}`;
}
