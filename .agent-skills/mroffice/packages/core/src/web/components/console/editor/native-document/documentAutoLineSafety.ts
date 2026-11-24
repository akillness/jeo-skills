/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type {EditorState} from '@tiptap/pm/state';
import {DecorationSet, type Decoration} from '@tiptap/pm/view';

type Provider = {read:(state:EditorState)=>unknown;nativeLineOwner?:boolean};
const forbiddenTags=new Set(['img','svg','canvas','math','sup','sub','input','button','video','audio']);

function unsafe(decoration:Decoration,nativeLineOwner:boolean):boolean {
  // A formatting mark (the paragraph mark, a cell end, an object anchor) is
  // a zero-width, zero-height, zero-line-height inline box by construction
  // (formattingMarksExtension ZERO_LAYOUT_WIDGET_STYLE): it cannot change a
  // line box. Treating it as a foreign layout owner kept the paragraph's
  // own line strut whenever marks were shown, so every line of text smaller
  // than the paragraph's font kept the larger line height (an 8pt line was
  // 15.3pt tall, Word 10.6pt).
  if(decoration.spec?.zeroLayoutFormattingMark===true)return false;
  // A list level's own number (listDefinitionMarkers) is drawn at line
  // height 0 inside a measured paragraph, and the custom-marker strut raises
  // the first line when the number is the larger: it owns no line box. As a
  // foreign widget it kept every numbered line at the paragraph's Normal
  // strut (a 12pt list under 14pt Normal 17.8pt a line, Word 13.7pt; R02-D16).
  if(decoration.spec?.listDefinitionMarker===true)return false;
  // A numbered heading's number (headingNumberingExtension) likewise: as a
  // foreign widget it kept the heading's style-size strut over its smaller
  // runs (R167-D03: 9pt headings under 11pt Normal, 10.97pt a line where
  // Word's is 10.23pt, 22 numbers a page for Word's 23).
  if(decoration.spec?.headingListNumber===true)return false;
  // A drop-down's or date's button stands in a zero-size anchor drawn over
  // the line (contentControlExtension zeroLayoutAnchor): it owns no line box.
  if(decoration.spec?.zeroLayoutContentControl===true)return false;
  // Zero-width decorations are widgets whose DOM is deliberately opaque.
  if(decoration.from===decoration.to)return true;
  const attrs=(decoration as unknown as {type?:{attrs?:Record<string,unknown>}}).type?.attrs;
  if(!attrs)return true;
  const tag=typeof attrs.nodeName==='string'?attrs.nodeName.toLowerCase():'';
  if(forbiddenTags.has(tag)||tag&&tag!=='span'&&tag!=='div')return true;
  if(String(attrs.contenteditable).toLowerCase()==='false' ||
    typeof attrs.class==='string'&&attrs.class.split(/\s/).includes('ProseMirror-widget'))return true;
  if(attrs.style!=null){
    if(typeof attrs.style!=='string')return true;
    // Only the actual font owner may publish its independently measured line
    // boxes. A similarly named class from another plugin grants no authority.
    if(/line-height/i.test(attrs.style) && !(nativeLineOwner&&decoration.spec.documentWordLineBox===true))return true;
  }
  return false;
}

/** An unsafe decoration of a provider, at its position in the document. */
type Unsafe={from:number;to:number;decoration:Decoration};
type SetInternals={local?:readonly Decoration[];children?:readonly (number|DecorationSet)[]};

// A provider's unsafe decorations per decoration (sub)set, relative to that
// set, by whether the provider owns native lines. Mapping a set through an
// edit rebuilds only the path to the edit and keeps every other child set,
// so a keystroke re-reads one branch instead of every decoration of the
// document (a 296-page book: every paragraph's, on every view update).
const unsafeBySet=[new WeakMap<DecorationSet,readonly Unsafe[]>(),new WeakMap<DecorationSet,readonly Unsafe[]>()];

function unsafeWithin(set:DecorationSet,nativeLineOwner:boolean):readonly Unsafe[] {
  const cache=unsafeBySet[nativeLineOwner?1:0];
  const known=cache.get(set);
  if(known)return known;
  const {local,children}=set as unknown as SetInternals;
  let found:Unsafe[];
  if(!Array.isArray(local)||!Array.isArray(children)){
    // Not the set shape this walk knows: read it the public way.
    found=set.find().filter(decoration=>unsafe(decoration,nativeLineOwner)).map(decoration=>({from:decoration.from,to:decoration.to,decoration}));
  }else{
    found=[];
    for(const decoration of local)if(unsafe(decoration,nativeLineOwner))found.push({from:decoration.from,to:decoration.to,decoration});
    for(let index=0;index+2<children.length;index+=3){
      const child=children[index+2];
      if(!(child instanceof DecorationSet))continue;
      const inner=unsafeWithin(child,nativeLineOwner);
      if(!inner.length)continue;
      const offset=(children[index] as number)+1;
      for(const item of inner)found.push({from:item.from+offset,to:item.to+offset,decoration:item.decoration});
    }
  }
  cache.set(set,found);
  return found;
}

const isAutoLineMarker=(spec:{autoLineIntermediates?:unknown})=>spec.autoLineIntermediates===true;

/** Run from decorations props, after every plugin has its complete next state
 * but before any new widget/style is written to DOM. Source/DOM eligibility is
 * still owned by Auto's measured projection. This only revokes that witness
 * where a current foreign decoration introduces an unsupported layout owner.
 * No source transaction, delayed marker toggling, or geometry read is needed. */
export function guardAutoLineIntermediates(state:EditorState,current:DecorationSet,providers:readonly Provider[]):DecorationSet {
  if(current===DecorationSet.empty)return current;
  const unsafeDecorations:{item:Unsafe;nativeLineOwner:boolean}[]=[];
  for(const provider of providers){
    let source:unknown;
    try{source=provider.read(state);}catch{return current.remove(current.find(undefined,undefined,isAutoLineMarker));}
    if(source==null)continue;
    if(!(source instanceof DecorationSet))return current.remove(current.find(undefined,undefined,isAutoLineMarker));
    const nativeLineOwner=provider.nativeLineOwner===true;
    for(const item of unsafeWithin(source,nativeLineOwner))unsafeDecorations.push({item,nativeLineOwner});
  }
  if(!unsafeDecorations.length)return current;
  const blocked:Decoration[]=[];
  for(const {item:{from,to,decoration}} of unsafeDecorations){
    // Only the markers whose content this decoration can reach: each covers
    // one text block, so they are found by range instead of comparing every
    // unsafe decoration with every marker of the document.
    for(const marker of current.find(Math.max(0,from-1),to+1,isAutoLineMarker)){
      const start=marker.from+1,end=marker.to-1;
      // A node decoration on the paragraph itself or a readonly table row
      // is an ancestor, not an unsupported descendant. Match the old guard's
      // scope; inline decorations still wrap text inside intersected blocks.
      const kind=decoration as Decoration & {inline:boolean;widget:boolean};
      if(!kind.inline&&!kind.widget && (from<start||to>end))continue;
      if(from<=end && to>=start)blocked.push(marker);
    }
  }
  return blocked.length?current.remove(blocked):current;
}
