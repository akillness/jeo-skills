/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { ptToPx } from "../../../../lib/office-units";
import type {EditorState} from '@tiptap/pm/state';
import type {Mark, Node as ProseMirrorNode} from '@tiptap/pm/model';
import {officeFontFaceFamily, type OfficeFontFace} from '../../../office-ribbon/officeFontFace';
import {officePrimaryFontFamily} from '../../../office-ribbon/officeTypographyCatalog';
import {measureOfficeFontLineBox} from '../../../office-ribbon/officeFontLineBox';
import {localWordLineMetricReference} from './documentLocalWordLineMetrics';
import {documentFontScriptRanges} from '../extensions/TextStyling';
import {resolveDocumentWordLineBox, resolveDocumentWordLineMetricContext, wordLineBoxMeasurementMatches, wordLineBoxFractionalCorrection,
  WORD_LINE_FRACTION_PROPERTY, type DocumentWordLineMetricInput} from './documentWordLineMetrics';
import regularObservations from "./wordLineMetricControls.json";
import observations from './wordSyntheticBoldLineMetricControls.json';

const reference = observations.canonicalRegularFontSha256;
const family = 'arial unicode ms';
const forbidden = new Set(['superscript','subscript','charScale','charSpacing','textEffects','characterStyle']);
const profileCache = new WeakMap<EditorState, WeakMap<ProseMirrorNode, boolean>>();
const mixedCache = new WeakMap<EditorState, WeakMap<ProseMirrorNode, Map<string, boolean>>>();

function knownRegularReference(face:OfficeFontFace):boolean {
  return !Object.keys(face.axes).length &&
    !face.asset?.files.some(file => file.role === 'bold' || file.role === 'boldItalic') &&
    (face.asset?.files.find(file => file.role === 'regular')?.sha256 === reference ||
      localWordLineMetricReference(face) === reference);
}

function sameDirectBoldProfile(marks:readonly Mark[], size:string):boolean {
  if (!marks.some(mark=>mark.type.name==='bold' && mark.attrs.value===true) ||
      marks.some(mark=>forbidden.has(mark.type.name) || (mark.type.name==='italic' && mark.attrs.value!==false))) return false;
  const fonts=marks.filter(mark=>['fontFamily','fontCjkFamily'].includes(mark.type.name));
  return fonts.length>0 && fonts.every(mark=>!mark.attrs.face && typeof mark.attrs.family==="string" && officePrimaryFontFamily(mark.attrs.family)?.toLowerCase()===family) &&
    marks.find(mark=>mark.type.name==='fontSize')?.attrs.size===size;
}

/** Advance-only calibration is deliberately whole-paragraph. A mixed line's
 * native regular ascent and browser bold descent must not form a larger box. */
function uniformBoldParagraph(state:EditorState, block:ProseMirrorNode, size:string):boolean {
  let cache=profileCache.get(state);
  if (!cache) {cache=new WeakMap();profileCache.set(state,cache);}
  const previous=cache.get(block);if(previous!==undefined)return previous;
  let covered=block.content.size>0 && ['paragraph','heading'].includes(block.type.name),text=false;
  block.forEach(node=>{
    // A source hard break carries paragraph-mark/empty-line semantics not
    // covered by this wrapped-text contract. Keep it on its existing path.
    if(!node.isText || !node.textContent.length){covered=false;return;}
    const marks=node.marks;
    text=true;
    if(!sameDirectBoldProfile(marks,size))covered=false;
  });
  const value=covered&&text;cache.set(block,value);return value;
}

/** Mixed admission proves every range painted in this face, not just the bold
 * leaf: each is the same-size synthetic bold profile or a regular range with
 * the native allocation box. A range painted in another face keeps its own
 * box, as each face contributes its own extent to a Word line; the controls
 * print such companions (Aptos Mono) on the same lines without a change of
 * advance. The witness per (size, line) is checked by the caller. */
function mixedBody(input:DocumentWordLineMetricInput, block:ProseMirrorNode, size:string):boolean {
  let byBlock=mixedCache.get(input.state);
  if(!byBlock){byBlock=new WeakMap();mixedCache.set(input.state,byBlock);}
  let bySize=byBlock.get(block);
  if(!bySize){bySize=new Map();byBlock.set(block,bySize);}
  const previous=bySize.get(size);if(previous!==undefined)return previous;
  const decide=()=>{
    // The profile binds a direct automatic line, never an inherited default.
    const line=block.attrs.lineHeight;
    if(block.type.name!=="paragraph" || block.attrs.source?.typographyFlow!==1 ||
      block.attrs.source?.fontScriptFlow!==1 || (typeof line!=="number" && typeof line!=="string") ||
      line==="" || !Number.isFinite(Number(line))) return false;
    // The complex-script slot (`w:rFonts@w:cs`) is a record: ISO/IEC 29500-1
    // 17.3.2.26 gives a run four font slots and draws a character from one of
    // them by that character's own Unicode value, so nothing is drawn from
    // `w:cs` unless the run holds complex-script text, and the mark renders a
    // data attribute and no style. It paints no other box or face. Left out of
    // this list, every mixed-bold paragraph the import states it on lost Word's
    // printed advance -- Word writes `w:cs` beside the ascii and East Asian
    // faces as a matter of course, so that is most of them.
    const allowed=new Set(["bold","fontSize","fontFamily","fontCjkFamily","fontComplexFamily",
      "textColor","proofingLanguage"]);
    let plain=block.content.size>0;
    block.forEach(node=>{
      if(!node.isText || !node.textContent || node.marks.some(mark=>!allowed.has(mark.type.name)))plain=false;
    });
    if(!plain)return false;
    const start=input.state.doc.resolve(input.from).start();
    let regular=false,bold=false;
    for(const range of documentFontScriptRanges(input.state,start,start+block.content.size)){
      const painted=range.value?.family;
      if(typeof painted!=="string" || !painted || range.value?.face)return false;
      if(officePrimaryFontFamily(painted).toLowerCase()!==family)continue;
      const marks=range.node.marks;
      if(marks.find(mark=>mark.type.name==="fontSize")?.attrs.size!==size)return false;
      const direct=marks.find(mark=>mark.type.name==="bold");
      if(direct?.attrs.value===true){bold=true;continue;}
      // Explicit ordinary role avoids guessing inherited style toggles here.
      if(direct?.attrs.value!==false || marks.some(mark=>["fontFamily","fontCjkFamily"].includes(mark.type.name) &&
        (mark.attrs.face || typeof mark.attrs.family!=="string")) ||
        !resolveDocumentWordLineBox({...input,from:range.from,marks,
          text:input.state.doc.textBetween(range.from,range.to,"",""),role:"regular"}))return false;
      regular=true;
    }
    return regular&&bold;
  };
  const value=decide();bySize.set(size,value);return value;
}

/** Cell paragraphs are emitted under their owning table's source receipt. Do
 * not manufacture paragraph source attrs or inherit from a distant outer table. */
function projectedTableParagraph(input:DocumentWordLineMetricInput,block:ProseMirrorNode):boolean {
  if(block.attrs.source!=null && block.attrs.source.adapter!=="docx")return false;
  // This context has direct auto spacing. An omitted line value must not be
  // guessed from document/custom/table-style inheritance for this new profile.
  const line=block.attrs.lineHeight;
  if((typeof line!=="number"&&typeof line!=="string") || !Number.isFinite(Number(line)))return false;
  const position=input.state.doc.resolve(input.from);
  let cell=false;
  for(let depth=position.depth;depth>0;depth--){
    const node=position.node(depth);
    if(node.type.name==="tableCell" || node.type.name==="tableHeader")cell=true;
    if(node.type.name!=="table")continue;
    const source=node.attrs.source;
    return cell && source?.adapter==="docx" && source.cellParagraphFlow===1 &&
      source.typographyFlow===1 && source.fontScriptFlow===1;
  }
  return false;
}

export interface SyntheticBoldLineBox {fontSizePx:number; lineHeightPx:number; autoLine240ths:number; mixed?:boolean}
export function syntheticBoldLineBoxStyleKey(box:SyntheticBoldLineBox):string {
  return `${box.mixed?"synthetic-bold-mixed":"synthetic-bold"}:${reference}:${box.fontSizePx}:${box.autoLine240ths}`;
}

export function resolveDocumentSyntheticBoldLineBox(input:DocumentWordLineMetricInput):SyntheticBoldLineBox|null {
  if(input.role!=='bold' || !knownRegularReference(input.face) || input.face.family.toLowerCase()!==family)return null;
  const context=resolveDocumentWordLineMetricContext({...input,text:input.state.doc.resolve(input.from).parent.textContent});if(!context)return null;
  const source=context.block.attrs.source;
  if(context.inTable ? !projectedTableParagraph(input,context.block) : source?.adapter!=="docx")return null;
  const size=input.marks.find(mark=>mark.type.name==='fontSize')?.attrs.size;
  if(typeof size!=='string' || !/^\d+(?:\.\d+)?px$/.test(size))return null;
  const uniform=uniformBoldParagraph(input.state,context.block,size);
  const mixed=!uniform && !context.inTable && mixedBody(input,context.block,size);
  if(!uniform && !mixed)return null;
  const pixels=Number.parseFloat(size),line=Number(context.block.attrs.lineHeight??input.state.doc.attrs.defaultLineHeight)*240;
  const row=observations.controls.find(row=>Math.abs(ptToPx(row.fontSizePt)-pixels)<.001&&Math.abs(row.autoLine240ths-line)<.001);
  if(context.inTable && (!row || !observations.tableContextControls.some(control=>
    control.fontSizePt===row.fontSizePt && control.autoLine240ths===row.autoLine240ths &&
    control.canonicalRegularFontSha256===reference &&
    row.lineAdvancePt>=control.tableLineAdvanceIntervalPt[0] && row.lineAdvancePt<=control.tableLineAdvanceIntervalPt[1])))return null;
  if(mixed && (!row || !observations.mixedContextControls.some(control=>control.fontSizePt===row.fontSizePt &&
    control.autoLine240ths===row.autoLine240ths && control.canonicalRegularFontSha256===reference &&
    row.lineAdvancePt>=control.mixedLineAdvanceIntervalPt[0] && row.lineAdvancePt<=control.mixedLineAdvanceIntervalPt[1])))return null;
  return row?{...(mixed?{mixed:true}:{}),fontSizePx:ptToPx(row.fontSizePt),lineHeightPx:ptToPx(row.lineAdvancePt),autoLine240ths:row.autoLine240ths}:null;
}

/** A distinct 700 probe and key namespace; never reuse a regular baseline or
 * a Word compressed paint origin. Only measured line-height floor loss is
 * recovered, using the existing descent-only fractional projection. */
export function prepareDocumentSyntheticBoldLineBoxStyles(doc:Document,face:OfficeFontFace):Map<string,string> {
  const result=new Map<string,string>();if(!knownRegularReference(face))return result;
  const alias=officeFontFaceFamily(face);
  const fonts=[...doc.fonts].filter(font=>font.family.replace(/^["']|["']$/g,'')===alias&&font.status==='loaded');
  if(!fonts.some(font=>(font.weight==='400'||font.weight==='normal')&&font.style==='normal') ||
      fonts.some(font=>font.weight!=='400'&&font.weight!=='normal'))return result;
  for(const row of observations.controls){
    const box={fontSizePx:ptToPx(row.fontSizePt),lineHeightPx:ptToPx(row.lineAdvancePt),autoLine240ths:row.autoLine240ths};
    const measured=measureOfficeFontLineBox(doc,{font:`700 ${box.fontSizePx}px "${alias}"`,lineHeight:`${box.lineHeightPx}px`,measureHeight:true});
    if(!measured||!Number.isFinite(measured.baselinePx)||!wordLineBoxMeasurementMatches(measured.heightPx??NaN,box.lineHeightPx))continue;
    const fraction=wordLineBoxFractionalCorrection(measured.heightPx!,box.lineHeightPx);
    result.set(syntheticBoldLineBoxStyleKey(box),`--document-word-font-size:${box.fontSizePx}px;--document-word-line-height:${box.lineHeightPx}px;--document-word-line-baseline-shift:0px${fraction===null?'':`;${WORD_LINE_FRACTION_PROPERTY}:${fraction}px`}`);
    const mixedWitness=observations.mixedContextControls.find(control=>control.fontSizePt===row.fontSizePt && control.autoLine240ths===row.autoLine240ths && control.canonicalRegularFontSha256===reference);
    const regular=regularObservations.canonicalFontSha256===reference ? regularObservations.controls.find(control=>control.fontSizePt===row.fontSizePt && control.autoLine240ths===row.autoLine240ths) : undefined;
    if(mixedWitness && regular){
      // Share allocation ascent, not paint or a regular700 measurement. The
      // relative top cancels vertical-align for ink as in the regular owner.
      const shift=ptToPx(regular.lineAscentPt)-measured.baselinePx;
      result.set(syntheticBoldLineBoxStyleKey({...box,mixed:true}),`--document-word-font-size:${box.fontSizePx}px;--document-word-line-height:${box.lineHeightPx}px;--document-word-line-baseline-shift:${shift}px${fraction===null?'':`;${WORD_LINE_FRACTION_PROPERTY}:${fraction}px`}`);
    }
  }
  return result;
}
