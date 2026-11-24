/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { ptToPx } from "../../../../lib/office-units";
import {officeFontFaceFamily, type OfficeFontFace} from '../../../office-ribbon/officeFontFace';
import {measureOfficeFontLineBox} from '../../../office-ribbon/officeFontLineBox';
import {localWordLineMetricReference} from './documentLocalWordLineMetrics';
import {resolveDocumentWordLineMetricContext, resolveDocumentWordLineBox, documentWordLineBoxStyleKey, wordLineBoxMeasurementMatches, wordLineBoxFractionalCorrection,
  WORD_LINE_FRACTION_PROPERTY, type DocumentWordLineMetricInput} from './documentWordLineMetrics';
import controls from './wordMonoLineMetricControls.json';
import {documentFontScriptRanges} from '../extensions/TextStyling';
import {normalizeDocxBreakRunMarks} from './documentHardBreakRunFormat';
import type {Mark} from '@tiptap/pm/model';
import {officePrimaryFontFamily} from '../../../office-ribbon/officeTypographyCatalog';

const reference=controls.canonicalFontSha256;
const knownFace=(face:OfficeFontFace)=>face.family.toLowerCase()==='aptos mono' && !Object.keys(face.axes).length &&
  (face.asset?.files.find(file=>file.role==='regular')?.sha256===reference || localWordLineMetricReference(face)===reference);
export const monoLineBoxStyleKey=(box:{fontSizePx:number;lineHeightPx:number})=>`mono:${reference}:${box.fontSizePx}:${box.lineHeightPx}`;

/** Independently printed regular cell profiles: the 7pt/245 Mono+AUM8 mixed
 * control and the 7.5pt/269 pure Mono control (paragraphs and source hard
 * breaks). Font size, source spacing and glyph paint origins remain intact;
 * profiles never extrapolate to other sizes, multipliers or companions. */
export function resolveDocumentMonoLineBox(input:DocumentWordLineMetricInput & {
  regularFaces?:ReadonlyMap<string,OfficeFontFace>; regularLineBoxStyles?:ReadonlyMap<string,string>;
}) {
  if(input.role!=='regular'||!knownFace(input.face)||!/^[\x20-\x7e]+$/.test(input.text) ||
    input.marks.some(mark=>mark.type.name==='charSpacing') ||
    !input.marks.some(mark=>mark.type.name==='bold' && mark.attrs.value===false))return null;
  const context=resolveDocumentWordLineMetricContext(input);
  if(!context?.inTable || context.reference!==reference || context.block.attrs.source?.adapter && context.block.attrs.source.adapter!=='docx')return null;
  if(context.block.attrs.lineHeight==null)return null;
  const ownSize=input.marks.find(mark=>mark.type.name==='fontSize')?.attrs.size;
  if(typeof ownSize!=='string'||!/^\d+(?:\.\d+)?px$/.test(ownSize))return null;
  const row=controls.controls.find(row=>Math.abs(ptToPx(row.fontSizePt)-Number.parseFloat(ownSize))<.001 &&
    Math.abs(row.autoLine240ths-Number(context.block.attrs.lineHeight)*240)<.001);
  if(!row)return null;
  // The pure control has no companion font and every printed line carries
  // text. The mixed control has no hard breaks at all.
  const pureMono=row.fontSizePt===controls.pureMonoControl.fontSizePt && row.autoLine240ths===controls.pureMonoControl.autoLine240ths;
  const {state}=input,blockStart=state.doc.resolve(input.from).start(),blockEnd=blockStart+context.block.content.size;
  let plain=true;
  const breaks:{from:number;to:number;marks:readonly Mark[]}[]=[];
  context.block.forEach((node,offset)=>{
    if(node.isText)return;
    if(!pureMono || node.type.name!=='hardBreak'){plain=false;return;}
    // A hard break carries its own imported run snapshot. Read it through the
    // shared carrier validator instead of trusting marks on the atom.
    let formats:ReturnType<typeof normalizeDocxBreakRunMarks>;
    try{formats=normalizeDocxBreakRunMarks(node.attrs.docxRunMarks);}catch{plain=false;return;}
    if(!formats){plain=false;return;}
    const marks=formats.flatMap(mark=>{const type=mark.type && state.schema.marks[mark.type];return type?[type.create(mark.attrs)]:[];});
    if(marks.length!==formats.length){plain=false;return;}
    breaks.push({from:blockStart+offset,to:blockStart+offset+node.nodeSize,marks});
  });
  if(!plain)return null;
  const ranges=[...documentFontScriptRanges(state,blockStart,blockEnd).map(range=>({from:range.from,to:range.to,marks:range.node.marks,value:range.value,isBreak:false})),
    ...breaks.map(range=>({...range,value:undefined,isBreak:true}))].sort((a,b)=>a.from-b.from);
  let covered=blockStart,previousBreak=true;
  for(const range of ranges){
    const marks=range.marks,rawSize=marks.find(mark=>mark.type.name==='fontSize')?.attrs.size;
    const familyMark=marks.find(mark=>mark.type.name==='fontFamily');
    const rawFamily=range.isBreak ? familyMark?.attrs.family : range.value?.family;
    if(range.from!==covered || typeof rawFamily!=='string'||typeof rawSize!=='string'||!/^\d+(?:\.\d+)?px$/.test(rawSize))return null;
    // Only printed text lines are controlled: no leading, trailing or
    // consecutive breaks, which would render lines without any text.
    if(range.isBreak && (previousBreak || range.to===blockEnd))return null;
    previousBreak=range.isBreak;
    covered=range.to;
    const size=Number.parseFloat(rawSize),family=officePrimaryFontFamily(rawFamily)?.toLowerCase();
    const text=range.isBreak ? '' : state.doc.textBetween(range.from,range.to);
    // Use the same script routing as the display plan. An unused eastAsia
    // slot does not replace ASCII; an active eastAsia slot must prove its face.
    if(range.value?.face || marks.some(mark=>['fontFamily','fontCjkFamily'].includes(mark.type.name) &&
      (mark.attrs.face || typeof mark.attrs.family!=='string')))return null;
    if(family==='arial unicode ms' && !pureMono){
      const companion=input.regularFaces?.get('arial unicode ms\u0000regular');
      const box=companion && resolveDocumentWordLineBox({...input,face:companion,marks,text,from:range.from});
      if(!box || !input.regularLineBoxStyles?.has(documentWordLineBoxStyleKey(box,Number(context.block.attrs.lineHeight))))return null;
    }else if(family==='aptos mono'){
      const bound=input.regularFaces?.get('aptos mono\u0000regular')??input.face;
      if(!knownFace(bound))return null;
    }
    if(!marks.some(mark=>mark.type.name==='bold'&&mark.attrs.value===false) ||
      marks.some(mark=>['superscript','subscript','charScale','charSpacing','textEffects','characterStyle'].includes(mark.type.name) || mark.type.name==='italic'&&mark.attrs.value!==false) ||
      !(family==='aptos mono'&&Math.abs(size-ptToPx(row.fontSizePt))<.001&&(range.isBreak || /^[\x20-\x7e]+$/.test(text)) ||
        !pureMono&&family==='arial unicode ms'&&Math.abs(size-ptToPx(8))<.001))return null;
  }
  if(covered!==blockEnd)return null;
  const position=state.doc.resolve(input.from);
  let receipt=false;
  for(let depth=position.depth;depth>0;depth--){
    const node=position.node(depth);if(node.type.name!=='table')continue;
    const source=node.attrs.source;
    receipt=source?.adapter==='docx'&&source.cellParagraphFlow===1&&source.typographyFlow===1&&source.fontScriptFlow===1;break;
  }
  if(!receipt)return null;
  return {fontSizePx:ptToPx(row.fontSizePt),lineHeightPx:row.lineAdvancePx};
}

export function prepareDocumentMonoLineBoxStyles(doc:Document,face:OfficeFontFace):Map<string,string>{
  const result=new Map<string,string>();if(!knownFace(face))return result;
  const alias=officeFontFaceFamily(face);
  const faces=[...doc.fonts].filter(font=>font.family.replace(/^["']|["']$/g,'')===alias&&font.status==='loaded');
  if(!faces.some(font=>(font.weight==='400'||font.weight==='normal')&&font.style==='normal'))return result;
  for(const row of controls.controls){
    const box={fontSizePx:ptToPx(row.fontSizePt),lineHeightPx:row.lineAdvancePx};
    const measured=measureOfficeFontLineBox(doc,{font:`400 ${box.fontSizePx}px "${alias}"`,lineHeight:`${box.lineHeightPx}px`,measureHeight:true});
    if(!measured||!Number.isFinite(measured.baselinePx)||!wordLineBoxMeasurementMatches(measured.heightPx??NaN,box.lineHeightPx))continue;
    const fraction=wordLineBoxFractionalCorrection(measured.heightPx!,box.lineHeightPx);
    result.set(monoLineBoxStyleKey(box),`--document-word-font-size:${box.fontSizePx}px;--document-word-line-height:${box.lineHeightPx}px;--document-word-line-baseline-shift:0px${fraction===null?'':`;${WORD_LINE_FRACTION_PROPERTY}:${fraction}px`}`);
  }
  return result;
}
