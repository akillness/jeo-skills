/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type {EditorState} from '@tiptap/pm/state';
import {Decoration} from '@tiptap/pm/view';
import {resolveDocumentSyntheticBoldAdvance,withSyntheticBoldAdvanceMeasurementScope} from './documentSyntheticBoldAdvance';
import type {DocumentDisplayFontPlan} from './documentDisplayFonts';
import {officeData} from '../../../../lib/office-data/store';

type Observation = {rangePx:number[];samples:readonly {px:number}[]};
/** Choose an actually observed order statistic, not a fitted document width
 * or an invented midpoint. The full observed range remains part of the proof. */
function observedAdvance(key:string,classKey?:string):number|null {
  // Word's measured advances, served (`lib/office-data/store.ts`); a residual
  // was only planned when they are here.
  const controls=officeData('word-synthetic-bold-advance') as {targets?:Record<string,Observation>;compatibleHanClasses?:Record<string,Observation>}|undefined;
  if(!controls?.targets)return null;
  const direct=controls.targets[key];
  const witness=direct ?? (classKey?controls.compatibleHanClasses?.[classKey]:null);
  if(!witness?.samples.length)return null;
  const values=witness.samples.map(sample=>sample.px).filter(Number.isFinite).sort((a,b)=>a-b);
  const value=values[Math.floor((values.length-1)/2)];
  return Number.isFinite(value)&&value>=witness.rangePx[0]&&value<=witness.rangePx[1]?value:null;
}

export function documentSyntheticBoldAdvanceDecorations(state:EditorState,plan:DocumentDisplayFontPlan):Decoration[] {
  // One pass over the document: whether the reference measurement is still
  // current is asked for every bold run and answered from the font set once.
  return withSyntheticBoldAdvanceMeasurementScope(()=>syntheticBoldAdvanceDecorations(state,plan));
}

function syntheticBoldAdvanceDecorations(state:EditorState,plan:DocumentDisplayFontPlan):Decoration[] {
  if(state.doc.attrs.characterSpacingControl!=="doNotCompress")return [];
  const face=plan.byNameRole.get('arial unicode ms\0regular');
  const measurement=face?plan.syntheticBoldAdvanceMeasurements?.get(face):null;
  if(!face||!measurement||plan.byNameRole.has('arial unicode ms\0bold'))return [];
  const ranges:{from:number;to:number}[]=[];
  state.doc.descendants((block,pos)=>{
    if(!block.isTextblock)return;
    let active:{from:number;to:number}|null=null;
    block.forEach((node,offset)=>{
      if(node.isText&&node.marks.some(mark=>mark.type.name==='bold'&&mark.attrs.value===true)){
        const from=pos+1+offset,to=from+node.nodeSize;
        if(active&&active.to===from)active.to=to;
        else{active={from,to};ranges.push(active);}
      }else active=null;
    });
    return false;
  });
  const decorations:Decoration[]=[];
  for(const range of ranges){
    const node=state.doc.nodeAt(range.from);if(!node?.isText)continue;
    const result=resolveDocumentSyntheticBoldAdvance({state,...range,marks:node.marks,text:state.doc.textBetween(range.from,range.to,'',''),face,role:'bold',target:plan.lineMetricsTarget,sourceContext:plan.sourceContext??null,measurement,kerning:'none',allowUnprojectedTerminalFullStop:true});
    if(!result.ok)continue;
    const pieces:{from:number;to:number;residual:number;target:number;browser:number;run:unknown}[]=[];
    let rejected=false;
    for(const glyph of result.residuals){
      const target=observedAdvance(glyph.boundaryKey,glyph.classWitness?.classKey);
      if(target===null){rejected=true;break;}
      const residual=target-glyph.browserAdvancePx;
      const previous=pieces[pieces.length-1];
      const run=state.doc.nodeAt(glyph.from);
      if(previous&&previous.to===glyph.from&&previous.residual===residual&&previous.run===run){previous.to=glyph.to;previous.target+=target;previous.browser+=glyph.browserAdvancePx;}
      else pieces.push({from:glyph.from,to:glyph.to,residual,target,browser:glyph.browserAdvancePx,run});
    }
    if(rejected)continue;
    let ideal=0,allocated=0;
    for(const piece of pieces){
      const quantum=measurement.inlineBoxQuantumPx;
      let correction=0;
      if(quantum){
        ideal+=piece.target;
        const next=Math.round(ideal/quantum)*quantum;
        const boxed=Math.ceil((piece.browser+piece.residual*(piece.to-piece.from))/quantum)*quantum;
        correction=next-allocated-boxed;allocated=next;
      }
      decorations.push(Decoration.inline(piece.from,piece.to,{
      class:'document-display-font-leaf document-synthetic-bold-advance',
      'data-document-synthetic-bold-advance':'independent-control',
      ...(correction?{'data-document-bold-box-allocation':'true'}:{}),
      style:`--document-display-font-family:"${measurement.referenceFamily}";--document-synthetic-bold-letter-spacing:${piece.residual}px${correction?`;--document-bold-box-correction:${correction}px`:''}`,
    },{inclusiveStart:false,inclusiveEnd:false,syntheticBoldAdvance:true}));
    }
  }
  return decorations;
}
