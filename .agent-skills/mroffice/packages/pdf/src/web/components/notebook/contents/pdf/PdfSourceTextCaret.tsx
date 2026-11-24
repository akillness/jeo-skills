"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { forwardRef, useCallback, useImperativeHandle, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { pdfSourceCaretEdge, pdfSourceCaretOffset, type PdfTextSourceAppearance } from "../../../../lib/pdf/source-text-appearance";
import { pdfNativeTextInputCanonicalOffset, pdfNativeTextInputDisplayOffset, type PdfNativeTextInputLayout } from "../../../../lib/pdf/native-text-input-layout";
import type { PdfTextCaretPoint } from "../../../../lib/pdf/text-caret";
import { watchOfficeInactiveSelection } from "@mrnote/core/web/lib/office-inactive-selection.ts";
import { PDF_NATIVE_TEXT_CARET_SETTLED_EVENT } from "../../../../lib/pdf/native-text-continuation";

export interface PdfSourceTextCaretHandle {
  offsetAtPoint: (point: PdfTextCaretPoint | undefined) => number | null;
  




  showGeometry: (geometry: PdfTextSourceAppearance | null) => void;
}

/** The native textarea still owns editing, IME, clipboard and keyboard
 * selection. Only pointer mapping and selection paint use source glyph quads. */
const PdfSourceTextCaret = forwardRef<PdfSourceTextCaretHandle, {
  geometry: PdfTextSourceAppearance | null;
  /** New with each render of the editor: a geometry shown through the
   * handle holds only until the next one. */
  renderToken?: object;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  pageHost: HTMLElement | null;
  pageWidth: number;
  pageHeight: number;
  inputLayout: PdfNativeTextInputLayout | null;
  initialPoint?: PdfTextCaretPoint;
  hidden: boolean;
  /** The text is selected as a block (WPS's single click): a press on it
   * places no caret -- the editor moves the block -- until the caret is in. */
  selectsBlock?: boolean;
  /** The selected characters are drawn elsewhere for now (Live Preview
   * sets them in the font under the pointer, with their own band). */
  selectionHidden?: boolean;
}>(function PdfSourceTextCaret({geometry:givenGeometry,renderToken,inputRef,pageHost,pageWidth,pageHeight,inputLayout,initialPoint,hidden,selectsBlock=false,selectionHidden=false},ref) {
  const [shownByHandle,setShownByHandle]=useState<{geometry:PdfTextSourceAppearance|null;token:object|undefined}|null>(null);
  const tokenRef=useRef(renderToken);
  useLayoutEffect(()=>{tokenRef.current=renderToken;},[renderToken]);
  const geometry=shownByHandle&&shownByHandle.token===renderToken?shownByHandle.geometry:givenGeometry;
  const [selection,setSelection]=useState({start:0,end:0,focused:false,current:false});
  // The selection stays painted while the focus is in the ribbon, a font
  // list or another application (Word, WPS): the band is this component's,
  // drawn on the page's glyphs, so the shared ghost leaves this box alone.
  const [held,setHeld]=useState(false);
  const pendingPoint=useRef(initialPoint);
  const latest=useRef({geometry,inputLayout,pageWidth,pageHeight,selectsBlock});
  useLayoutEffect(()=>{latest.current={geometry,inputLayout,pageWidth,pageHeight,selectsBlock};},[geometry,inputLayout,pageWidth,pageHeight,selectsBlock]);
  const displayOffset=useCallback((offset:number)=>latest.current.inputLayout?
    pdfNativeTextInputDisplayOffset(latest.current.inputLayout,offset):offset,[]);
  const canonicalOffset=useCallback((offset:number)=>latest.current.inputLayout?
    pdfNativeTextInputCanonicalOffset(latest.current.inputLayout,offset):offset,[]);
  const offsetAtPoint=useCallback((point:PdfTextCaretPoint|undefined)=>{
    if(!point)return null;
    const current=latest.current;
    if(!current.geometry){pendingPoint.current=point;return null;}
    pendingPoint.current=undefined;
    return displayOffset(pdfSourceCaretOffset(current.geometry,point.x*current.pageWidth,point.y*current.pageHeight));
  },[displayOffset]);
  const showGeometry=useCallback((next:PdfTextSourceAppearance|null)=>{
    const token=tokenRef.current;
    setShownByHandle(previous=>previous&&previous.token===token&&previous.geometry===next?previous:{geometry:next,token});
  },[]);
  useImperativeHandle(ref,()=>({offsetAtPoint,showGeometry}),[offsetAtPoint,showGeometry]);

  useLayoutEffect(()=>{
    const input=inputRef.current;
    if(!input||!pageHost)return;
    let drag:{id:number;anchor:number}|null=null;
    let lastPointer={time:-Infinity,x:0,y:0,count:0};
    const update=()=>{
      const current=latest.current;
      const matches=input.value===(current.inputLayout?.value??current.geometry?.text);
      const next={start:canonicalOffset(input.selectionStart),end:canonicalOffset(input.selectionEnd),
        focused:document.activeElement===input&&matches,current:matches};
      setSelection(previous=>previous.start===next.start&&previous.end===next.end&&previous.focused===next.focused&&
        previous.current===next.current?previous:next);
    };
    const select=(anchor:number,end:number)=>{
      input.focus({preventScroll:true});
      input.setSelectionRange(displayOffset(Math.min(anchor,end)),displayOffset(Math.max(anchor,end)),end<anchor?"backward":"forward");
      update();
    };
    const point=(event:PointerEvent)=>{
      const bounds=pageHost.getBoundingClientRect();
      return bounds.width>0&&bounds.height>0?{x:(event.clientX-bounds.left)/bounds.width,y:(event.clientY-bounds.top)/bounds.height}:null;
    };
    const down=(event:PointerEvent)=>{
      if(event.button!==0||latest.current.selectsBlock)return;
      const at=point(event);if(!at)return;
      const repeated=event.timeStamp-lastPointer.time<500&&Math.hypot(event.clientX-lastPointer.x,event.clientY-lastPointer.y)<4;
      const clickCount=event.detail|| (repeated?Math.min(3,lastPointer.count+1):1);
      lastPointer={time:event.timeStamp,x:event.clientX,y:event.clientY,count:clickCount};
      pendingPoint.current=at;
      const current=latest.current;
      if(!current.geometry||input.disabled)return;
      const offset=pdfSourceCaretOffset(current.geometry,at.x*current.pageWidth,at.y*current.pageHeight);
      pendingPoint.current=undefined;
      event.preventDefault();
      if(clickCount>=3){
        const shown=displayOffset(offset),start=input.value.lastIndexOf("\n",Math.max(0,shown-1))+1;
        const found=input.value.indexOf("\n",shown),end=found<0?input.value.length:found;
        select(canonicalOffset(start),canonicalOffset(end));return;
      }
      if(clickCount===2&&typeof Intl.Segmenter==="function"){
        const segments=[...new Intl.Segmenter(undefined,{granularity:"word"}).segment(current.geometry.text)];
        let word=segments.find(segment=>segment.index<=offset&&offset<segment.index+segment.segment.length);
        if(!word?.isWordLike)word=segments.find(segment=>segment.isWordLike&&segment.index+segment.segment.length===offset)??word;
        if(word){select(word.index,word.index+word.segment.length);return;}
      }
      const anchor=event.shiftKey?canonicalOffset(input.selectionDirection==="backward"?input.selectionEnd:input.selectionStart):offset;
      select(anchor,offset);drag={id:event.pointerId,anchor};
      try{input.setPointerCapture?.(event.pointerId);}catch{/* The source may be changing after this gesture. */}
    };
    const move=(event:PointerEvent)=>{
      const current=latest.current;if(!drag||drag.id!==event.pointerId||!current.geometry)return;
      const at=point(event);if(!at)return;
      event.preventDefault();select(drag.anchor,pdfSourceCaretOffset(current.geometry,at.x*current.pageWidth,at.y*current.pageHeight));
    };
    const up=()=>{drag=null;};
    input.addEventListener("pointerdown",down);
    input.addEventListener("input",update);
    input.addEventListener("select",update);
    input.addEventListener("focus",update);
    input.addEventListener("blur",update);
    document.addEventListener("selectionchange",update);
    document.addEventListener("pointermove",move);
    document.addEventListener("pointerup",up);
    document.addEventListener("pointercancel",up);
    // Attached with the rest: the input is portaled in after the first
    // render, so an effect of its own would find no input to watch.
    const stopHolding=watchOfficeInactiveSelection(input,setHeld);
    update();
    return()=>{
      stopHolding();setHeld(false);
      input.removeEventListener("pointerdown",down);
      input.removeEventListener("input",update);input.removeEventListener("select",update);
      input.removeEventListener("focus",update);input.removeEventListener("blur",update);
      document.removeEventListener("selectionchange",update);document.removeEventListener("pointermove",move);
      document.removeEventListener("pointerup",up);document.removeEventListener("pointercancel",up);
    };
  },[inputRef,pageHost,canonicalOffset,displayOffset]);
  // A key or a typed word in the input settles where its caret is: the press
  // that opened the line no longer places it once the glyphs are read. Heard
  // on the document from the first render: the input is portaled in, and its
  // page host set, a few renders later, and an End pressed meanwhile (the
  // keys typed ahead with it) was undone by the press's point when the glyphs
  // came, the words typed into the middle of a word (rapid re-edit probe,
  
  useLayoutEffect(()=>{
    const settle=(event:Event)=>{if(event.target===inputRef.current)pendingPoint.current=undefined;};
    const events=["keydown","input",PDF_NATIVE_TEXT_CARET_SETTLED_EVENT];
    for(const name of events)document.addEventListener(name,settle,true);
    return()=>{for(const name of events)document.removeEventListener(name,settle,true);};
  },[inputRef]);
  useLayoutEffect(()=>{
    const input=inputRef.current;
    if(!geometry||!input)return;
    const offset=offsetAtPoint(pendingPoint.current);
    if(offset!==null)input.setSelectionRange(offset,offset);
    const matches=input.value===(latest.current.inputLayout?.value??geometry.text);
    setSelection({start:canonicalOffset(input.selectionStart),end:canonicalOffset(input.selectionEnd),
      focused:document.activeElement===input,current:matches});
  },[geometry,inputRef,offsetAtPoint,canonicalOffset]);

  const inactive=!selection.focused&&held&&selection.current&&selection.start<selection.end;
  // A format previewed draws the selection's band at the previewed width: this
  // one under it as well, the words read twice as dark as pressed.
  if(!geometry||!pageHost||hidden||!(selection.focused||inactive)||(selectionHidden&&selection.start<selection.end))return null;
  const edge=selection.focused&&selection.start===selection.end?pdfSourceCaretEdge(geometry,selection.start):null;
  return createPortal(<svg aria-hidden="true" data-pdf-native-source-caret="true"
    data-pdf-native-source-selection={inactive?"inactive":undefined} viewBox={`0 0 ${pageWidth} ${pageHeight}`}
    style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none",zIndex:100,overflow:"visible"}}>
    {/* The shared drawn-caret blink; keyed on the offset so a moved caret
        shows solid first, as the system caret does. */}
    {edge?<line key={selection.start} className="office-caret-blink"
      x1={edge[0]} y1={edge[1]} x2={edge[2]} y2={edge[3]} stroke="var(--console-accent-strong, #0f766e)" strokeWidth={1} vectorEffect="non-scaling-stroke"/>:
      geometry.characters.filter(character=>character.start<selection.end&&character.end>selection.start).map(character=>
        <polygon key={`${character.start}:${character.end}`} points={[0,2,6,4].map(offset=>`${character.quad[offset]},${character.quad[offset+1]}`).join(" ")} fill="var(--console-accent-strong, #0f766e)" fillOpacity={.22}/>)}
  </svg>,pageHost);
});

export default PdfSourceTextCaret;
