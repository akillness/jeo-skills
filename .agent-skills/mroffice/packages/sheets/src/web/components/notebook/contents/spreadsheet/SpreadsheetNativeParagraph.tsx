"use client";
/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { layoutNativeText, layoutNativeTextBatch, nativeTextLayoutIsKnown, nativeTextTouchedBy, resolveRelativePartFontSizes, type NativeTextLayoutRequest, nativeTextFontLead, nativeParagraphLineStyle, nativeParagraphLinePitch, measureNativeLineAdvance, nativeTextAlignmentOffset, nativeStrutBaselinePx, nativeStrutLineHeightPx, nativeLinesWithoutHangingSpaces, type NativeTextAlignmentBox, type NativeTextPart, type NativeTextLine } from "../../../../lib/spreadsheet/native-text-layout";
import { nativeTextLayoutQuantum, nativeTypographyGeneration, resolveSpreadsheetTextStyle, subscribeNativeTypography } from "@mrnote/core/web/lib/spreadsheet/native-typography.ts";
import { fontLoadReach } from "@mrnote/core/web/lib/spreadsheet/font-load-reach.ts";
import { cellWrappedBottomJustifyContent, cellWrappedMiddleJustifyContent, distributedLineUnits } from "@mrnote/core/web/lib/spreadsheet/cell-format.ts";
import { officeKeptWrappedLines, officePrintedBaselineShiftPx, officePrintedBaselineSnapPx } from "../../../../lib/spreadsheet/office-wrapped-bottom";
import { SpreadsheetNativeTextParts, spreadsheetNativeTextPaint } from "./SpreadsheetNativeText";

/** A paragraph whose lines the commit's batch has yet to lay out. */
const PENDING_LAYOUT={lines:[] as readonly NativeTextLine[],offsets:[] as readonly (number|undefined)[]};
/** The same, waiting for the layout of the text's beginning (clipRoom). */
const PENDING_PREFIX_LAYOUT={lines:[] as readonly NativeTextLine[],offsets:[] as readonly (number|undefined)[]};

// The paragraphs that mounted in one commit and are not laid out yet: their
// probes go into the document together, once the commit's layout effects are
// done, and they repaint together before the browser paints.
const batchRequests:NativeTextLayoutRequest[]=[];
const batchListeners=new Set<()=>void>();
let batchScheduled=false;
function requestNativeTextLayout(request:NativeTextLayoutRequest,done:()=>void):()=>void{
  batchRequests.push(request);batchListeners.add(done);
  if(!batchScheduled){
    batchScheduled=true;
    queueMicrotask(()=>{
      batchScheduled=false;
      const requests=batchRequests.splice(0),listeners=[...batchListeners];
      batchListeners.clear();
      layoutNativeTextBatch(requests);
      const notify=()=>{for(const listener of listeners)listener()};
      try{flushSync(notify)}catch{notify()}
    });
  }
  return()=>{batchListeners.delete(done)};
}

/** How many of a printed paragraph's lines start above its clipping box's
 * end (`room`, px), each line at least `least` px (an empty one nothing). */
function clipCount(lines:readonly NativeTextLine[],least:number,room:number):number{
  let top=0,count=0;
  for(const line of lines){
    if(top>=room)break;
    top+=line.parts.length?least:0;
    count+=1;
  }
  return count;
}

/** The first `budget` UTF-16 units of a paragraph's runs (a surrogate pair
 * kept whole), or undefined when the text is no longer. */
function textPrefix(parts:readonly NativeTextPart[],budget:number):NativeTextPart[]|undefined{
  const prefix:NativeTextPart[]=[];
  let left=budget;
  for(const part of parts){
    if(part.text.length<=left){prefix.push(part);left-=part.text.length;continue;}
    let cut=left;
    const unit=part.text.charCodeAt(cut-1);
    if(unit>=0xd800&&unit<=0xdbff)cut-=1;
    if(cut>0)prefix.push({...part,text:part.text.slice(0,cut)});
    return prefix.length?prefix:undefined;
  }
  return undefined;
}

/** A printed link's anchor: the text's own colour and no line of its own
 * (the cell's underline, where it has one, is its cell's). */
export const PRINTED_LINK_STYLE:CSSProperties={color:"inherit",textDecoration:"none",cursor:"inherit"};
const noTypographySubscription=()=>()=>{};
const noTypographyGeneration=()=>0;
export function SpreadsheetNativeParagraph({parts,style,dpi,scale=1,wrap=true,layoutWidth,alignmentBox,boxStyle,drawSingleRun=false,spread,distributed=false,officeBaseline,officePrintedPage,officeWrap,linkHref,clipRoom}: {
  parts:readonly NativeTextPart[];style:CSSProperties;dpi:number;scale?:number;wrap?:boolean;layoutWidth?:number;alignmentBox?:NativeTextAlignmentBox;
  /** Printed, the address the cell's link goes to: each line's text is an
   * anchor in its own line, which the printed PDF carries as a link over
   * that line's text (Excel's Save As PDF writes one a printed line,
   * xlsx-rounds XC-204). The anchor is an inline box in the line's own font
   * and colour: nothing moves and nothing is drawn for it. */
  linkHref?:string;
  /** Vertical Justify / Distributed: the lines spread over the paragraph's
   * box, which fills the cell (the page's text box; lookwin probe p22). Lines
   * taller than the box keep to its top, as Excel prints them. */
  spread?:"space-between"|"space-evenly";
  /** The paragraph is its own box in the cell (a box around it set these). */
  boxStyle?:CSSProperties;
  /** A single line of one plain run in the paragraph's own font draws its
   * glyph runs in the line itself rather than in a text span inside it. */
  drawSingleRun?:boolean;
  /** Horizontal Distributed (Indent): each wrapped line of one plain run
   * spreads across the layout width (the cell less its indent at both
   * sides) by its words, or by character with CJK, and a line of one unit
   * is centred (distributedLineUnits; the API's print draws the same). */
  distributed?:boolean;
  /** Where Windows Excel stands the line's baseline, px below the
   * paragraph's top edge (a Windows grid's one printed line, set by its
   * vertical alignment and its faces' automatic line, as the API's writer
   * stands it): the paragraph moves so its baseline is there, the browser's
   * own (nativeStrutBaselinePx) read for its font and line height. */
  officeBaseline?:number;
  /** Printed, the paragraph's top below the paper's top edge and a printer
   * dot (px): a line placed at Excel's baseline moves from the whole pixel
   * the browser prints it on to Excel's whole dot (officePrintedBaselineShiftPx). */
  officePrintedPage?:{top:number;dotPx:number};
  /** A Windows grid's wrapped lines placed as Excel prints them (the page's
   * px; office-wrapped-bottom): the lines a row too low keeps (printed dots,
   * `lineDots` a line, `rowDots` the row: p298-lw), the first line `ascent` below the top,
   * a block of whole lines in the middle, or the last `rise` above the bottom. */
  officeWrap?:{align:"top"|"middle"|"bottom";height:number;rise:number;ascent:number;lineDots:number;rowDots:number};
  






  clipRoom?:number;
}) {
  const ref=useRef<HTMLSpanElement>(null);
  // A paragraph standing at Excel's baseline reads the browser's again when
  // a font arrives (only those subscribe).
  const placed=officeBaseline!==undefined||officeWrap!==undefined;
  const typographyGeneration=useSyncExternalStore(placed?subscribeNativeTypography:noTypographySubscription,
    placed?nativeTypographyGeneration:noTypographyGeneration,noTypographyGeneration);
  // A part sized relative to the paragraph is laid out at its pixels.
  const signature=JSON.stringify([resolveRelativePartFontSizes(parts,style),style,dpi,scale,wrap,layoutWidth,alignmentBox]);
  const stable=useMemo(()=>JSON.parse(signature) as [NativeTextPart[],CSSProperties,number,number,boolean,number|null,NativeTextAlignmentBox|null],[signature]);
  const [layout,setLayout]=useState<{signature:string;lines:readonly NativeTextLine[];offsets:readonly (number|undefined)[]}|null>(null);
  // A paragraph whose wrap width is given (a native grid's cell) needs nothing
  // from its own box: its lines are laid out while it renders, from the
  // layout cache when the text was seen before. Laying them out in an effect
  // cost every such cell a second render, a forced layout of the grid to read
  // a width it already had, and a ResizeObserver; a sheet of wrapped cells
  // took seconds to show. Fonts still loading keep the effect's path.
  const [fontEpoch,setFontEpoch]=useState(0);
  const lineHeight=nativeParagraphLinePitch(stable[0],style,dpi);
  const base=resolveSpreadsheetTextStyle(style,stable[0][0]?nativeTextFontLead(stable[0][0]):"",dpi);
  // Printed and clipped (clipRoom), lines at the normal line height are each
  // at least the strut's line (nativeStrutLineHeightPx, a tenth less to
  // spare; an empty line counts nothing): the lines built are those whose
  // tops are above the box's end.
  const clipLeast=(()=>{
    if(clipRoom===undefined||!(clipRoom>0)||spread||distributed||officeBaseline!==undefined||officeWrap!==undefined||lineHeight!==undefined)return undefined;
    const strutLine=nativeStrutLineHeightPx({fontFamily:base.fontFamily,fontSize:typeof base.fontSize==="number"?base.fontSize*scale:base.fontSize,fontWeight:base.fontWeight,fontStyle:base.fontStyle},nativeTypographyGeneration());
    return strutLine!==undefined&&strutLine>0?strutLine*0.9:undefined;
  })();
  // Laid out only as far as it can show: a printed note of 2,910 characters
  // in a two-line row measured every character to break lines it never
  
  // beginning, enough for the lines that can show and three more at 0.4 em a
  // character (a line of prose holds fewer), is laid out; its lines stand for
  // the whole text's where at least three follow the last line built (lines
  // are filled greedily: a cut moves only the lines at its end). Else the
  // whole text is laid out, as before.
  const fontPx=typeof base.fontSize==="number"?base.fontSize:Number.parseFloat(String(base.fontSize));
  const clipBudget=clipLeast!==undefined&&clipRoom!==undefined&&stable[4]&&stable[5]!=null&&fontPx>0
    ?(Math.floor(clipRoom/clipLeast)+4)*Math.ceil(stable[5]/(fontPx*0.4)):undefined;
  const clipPrefix=useMemo(()=>clipBudget===undefined?undefined:textPrefix(stable[0],clipBudget),[stable,clipBudget]);
  const renderLayout=useMemo(()=>{
    void fontEpoch;
    if(typeof document==="undefined")return undefined;
    const align=stable[1].textAlign;
    const nativeAlignment=stable[2]===72&&stable[6]&&(align==="center"||align==="right"||align==="end");
    if(stable[4]?stable[5]==null:!nativeAlignment)return undefined;
    // While a font is loading nothing measured would last: the paragraph
    // waits for the font, then for the batch.
    if(document.fonts?.status==="loading")return PENDING_LAYOUT;
    const offsetsOf=(lines:readonly NativeTextLine[])=>lines.map(line=>nativeAlignment?nativeTextAlignmentOffset(measureNativeLineAdvance(line.parts,stable[1],stable[2]),stable[1].textAlign,stable[6]??undefined,stable[2],stable[3]):undefined);
    if(clipPrefix&&clipLeast!==undefined&&clipRoom!==undefined){
      if(!nativeTextLayoutIsKnown(clipPrefix,stable[1],stable[5]!,stable[2]))return PENDING_PREFIX_LAYOUT;
      const laid=layoutNativeText(clipPrefix,stable[1],stable[5]!,stable[2]);
      const lines=laid&&nativeLinesWithoutHangingSpaces(laid);
      if(lines&&clipCount(lines,clipLeast,clipRoom)<=lines.length-3)return {lines,offsets:offsetsOf(lines)};
    }
    // A text not laid out before waits for the commit's batch (below): one
    // layout of the page serves every paragraph that mounted with it.
    if(stable[4]&&!nativeTextLayoutIsKnown(stable[0],stable[1],stable[5]!,stable[2]))return PENDING_LAYOUT;
    const laid=stable[4]?layoutNativeText(stable[0],stable[1],stable[5]!,stable[2]):undefined;
    const lines:readonly NativeTextLine[]|undefined=stable[4]?laid&&nativeLinesWithoutHangingSpaces(laid):[{parts:stable[0],hardBreak:""}];
    if(!lines)return null;
    return {lines,offsets:offsetsOf(lines)};
  },[stable,fontEpoch,clipPrefix,clipLeast,clipRoom]);
  const laidOutInRender=renderLayout!==undefined;
  const awaitingBatch=renderLayout===PENDING_LAYOUT||renderLayout===PENDING_PREFIX_LAYOUT;
  const awaitingParts=renderLayout===PENDING_PREFIX_LAYOUT&&clipPrefix?clipPrefix:stable[0];
  useLayoutEffect(()=>{
    if(!awaitingBatch||document.fonts?.status==="loading")return;
    // Unwrapped alignment needs no line layout: the font's arrival alone
    // (the listener below) repaints it.
    if(!stable[4])return;
    return requestNativeTextLayout({parts:awaitingParts,style:stable[1],width:stable[5]!,dpi:stable[2]},()=>setFontEpoch(epoch=>epoch+1));
  },[awaitingBatch,awaitingParts,stable,fontEpoch]);
  useLayoutEffect(()=>{
    if(!laidOutInRender)return;
    // Laid out again only for a load that reaches this paragraph's text
    
    // A paragraph still waiting because some face was loading when it
    // rendered waits for the set to finish, whatever face that was: held
    // back for an unrelated face, it never laid out and printed unplaced
    // (lookwin bench R284-X24 page 2: a bottom-aligned note's last lines
    // where Excel prints its first).
    const refresh=(event:Event)=>{
      const reach=fontLoadReach(event);
      if(reach&&!nativeTextTouchedBy(reach,stable[0],stable[1],stable[2])&&!awaitingBatch)return;
      setFontEpoch(epoch=>epoch+1);
    };
    document.fonts?.addEventListener("loadingdone",refresh);
    return()=>document.fonts?.removeEventListener("loadingdone",refresh);
  },[laidOutInRender,stable,awaitingBatch]);
  useLayoutEffect(()=>{
    if(laidOutInRender)return;
    const node=ref.current;
    const align=stable[1].textAlign;
    const nativeAlignment=stable[2]===72&&stable[6]&&(align==="center"||align==="right"||align==="end");
    if(!node||(!stable[4]&&!nativeAlignment))return;
    let cancelled=false;
    const unwrappedLines:readonly NativeTextLine[]=[{parts:stable[0],hardBreak:""}];
    const update=async()=>{
      // Reading fonts.ready lays the page out; it is awaited only while a
      // font is actually loading.
      if(document.fonts?.status==="loading")await document.fonts.ready;if(cancelled)return;
      const rawWidth=parseFloat(getComputedStyle(node).width);
      const quantum=nativeTextLayoutQuantum();
      const width=quantum?Math.round(rawWidth/quantum)*quantum:rawWidth;
      const laid=stable[4]?layoutNativeText(stable[0],stable[1],stable[5]??width/stable[3],stable[2]):undefined;
      const lines=stable[4]?laid&&nativeLinesWithoutHangingSpaces(laid):unwrappedLines;
      const offsets=lines?.map(line=>nativeAlignment?nativeTextAlignmentOffset(measureNativeLineAdvance(line.parts,stable[1],stable[2]),stable[1].textAlign,stable[6]??undefined,stable[2],stable[3]):undefined)??[];
      if(!cancelled)setLayout(previous=>lines?previous?.signature===signature&&previous.lines===lines&&JSON.stringify(previous.offsets)===JSON.stringify(offsets)?previous:{signature,lines,offsets}:null);
    };
    void update();
    const observer=new ResizeObserver(()=>{void update()});observer.observe(node);
    const fontsLoaded=(event:Event)=>{
      const reach=fontLoadReach(event);
      if(reach&&!nativeTextTouchedBy(reach,stable[0],stable[1],stable[2]))return;
      void update();
    };
    document.fonts?.addEventListener("loadingdone",fontsLoaded);
    return()=>{cancelled=true;observer.disconnect();document.fonts?.removeEventListener("loadingdone",fontsLoaded)};
  },[signature,stable,laidOutInRender]);
  // Only a fixed line height needs the wrapper (its zero line height keeps
  // the runs from stretching the line box); otherwise the runs sit in the
  // line directly, one element less for every cell on screen.
  const paintParts=(lineParts:readonly NativeTextPart[])=>lineHeight===undefined
    ?<SpreadsheetNativeTextParts parts={lineParts} style={style} dpi={dpi} scale={scale}/>
    :<span style={{lineHeight:0}}><SpreadsheetNativeTextParts parts={lineParts} style={style} dpi={dpi} scale={scale}/></span>;
  const shown=laidOutInRender?(awaitingBatch?null:renderLayout):layout?.signature===signature?layout:null;
  const laidLines=shown?.lines;
  // A row too low for all the wrapped lines keeps the first ones (lookwin p122b-lw).
  const wrapLineDots=officeWrap?.lineDots;
  const keptLines=officeWrap&&wrapLineDots!==undefined&&laidLines&&lineHeight!==undefined&&!(Boolean(spread)&&laidLines.length>1)
    ?Math.max(1,officeKeptWrappedLines(laidLines.map(()=>wrapLineDots),officeWrap.rowDots)):undefined;
  const lines=keptLines!==undefined&&laidLines?laidLines.slice(0,keptLines):laidLines;
  const spreading=Boolean(spread)&&lines!==undefined&&lines.length>1;
  const fixedLines=lineHeight!==undefined&&lines!==undefined&&!spreading;
  // The lines that can show in the clipping box (clipRoom): a line whose top
  // is at or below its end is not built. Fixed lines stand a pitch apart and
  // the paragraph keeps their whole height. Lines at the normal line height
  // are each at least the strut's line (nativeStrutLineHeightPx, a tenth
  // less to spare; an empty line counts nothing), and what is not built is
  // held by a block that keeps the paragraph taller than the box, so a
  // safely aligned paragraph still stands at its top: the lines built stand
  // exactly where they stood among all of them.
  const built=(()=>{
    if(clipRoom===undefined||!(clipRoom>0)||!lines||lines.length<2||spread||distributed||officeBaseline!==undefined||officeWrap!==undefined)return undefined;
    if(fixedLines&&lineHeight!==undefined){
      const count=Math.floor(clipRoom/(lineHeight*scale))+1;
      return count<lines.length?{count,rest:0}:undefined;
    }
    const least=clipLeast;
    if(least===undefined)return undefined;
    // Laid out from the text's beginning (clipPrefix), the lines not built
    // are those of the beginning: the block still keeps the paragraph taller
    // than the box.
    const count=clipCount(lines,least,clipRoom);
    if(count>=lines.length)return undefined;
    const rest=lines.slice(count).reduce((sum,line)=>sum+(line.parts.length?least:0),0);
    return {count,rest:Math.max(1,rest)};
  })();
  // One line stood at Excel's baseline: the browser's own, read for this
  // font and line height, and the difference taken up above the paragraph.
  // Where nothing lays out a probe, a line box's usual split stands in.
  const strutSize=typeof base.fontSize==="number"?base.fontSize*scale:undefined;
  // Wrapped lines placed as Excel prints them: the first line's baseline.
  const pitch=lineHeight!==undefined?lineHeight*scale:undefined;
  const firstBaseline=officeBaseline!==undefined?officeBaseline:officeWrap&&keptLines!==undefined&&pitch!==undefined&&!spreading
    ?officeWrap.align==="top"?officeWrap.ascent
      :officeWrap.align==="middle"?(officeWrap.height-keptLines*pitch)/2+officeWrap.ascent
      :officeWrap.height-officeWrap.rise-(keptLines-1)*pitch
    :undefined;
  const strut=firstBaseline!==undefined&&lineHeight!==undefined&&(officeBaseline===undefined||lines===undefined||lines.length===1)&&!spreading
    ?nativeStrutBaselinePx({fontFamily:base.fontFamily,fontSize:strutSize??base.fontSize,fontWeight:base.fontWeight,fontStyle:base.fontStyle},lineHeight*scale,typographyGeneration)
      ??(strutSize!==undefined?(lineHeight*scale-1.12*strutSize)/2+0.9*strutSize:undefined):undefined;
  // Printed, each placed line moves onto Excel's whole printer dot.
  const lineShift=(index:number)=>officePrintedPage&&strut!==undefined&&firstBaseline!==undefined&&(index===0||pitch!==undefined)
    ?officePrintedBaselineShiftPx(officePrintedPage.top+firstBaseline+index*(pitch??0),officePrintedPage.dotPx):undefined;
  // Printed, each placed line stands on the whole pixel its shift counts from
  // (officePrintedBaselineSnapPx): the first by the paragraph's place, the
  // others by their own tops.
  const lineSnap=(index:number)=>lineShift(index)!==undefined&&officePrintedPage&&firstBaseline!==undefined
    ?officePrintedBaselineSnapPx(officePrintedPage.top+firstBaseline+index*(pitch??0)):0;
  const paragraphStyle:CSSProperties={...boxStyle,display:"block",width:"100%",minWidth:0,...(fixedLines?{position:"relative",height:lineHeight*scale*lines.length}:{}),
    ...(strut!==undefined&&firstBaseline!==undefined?{marginTop:firstBaseline-strut+lineSnap(0),flex:"none",
      ...(!fixedLines&&lines?.length===1&&lineShift(0)!==undefined?{transform:`translateY(${lineShift(0)}px)`}:{})}:{}),
    ...(spreading?{display:"flex",flexDirection:"column",justifyContent:spread,height:"100%"}:{}),
    // Wrapped lines not placed yet (their layout still pending, or no fixed
    // line pitch to place them by) stand where the cell's vertical alignment
    // puts them, not at the top the placed box starts from (lookwin bench
    // R31-X04: middle-aligned wrapped values printed at their cells' tops),
    // safely: lines more than the row holds keep the first ones, as Excel
    // keeps them, not the last (lookwin bench R284-X24 page 2: a note of four
    // lines in a 58 px row printed its last three).
    ...(officeWrap&&officeBaseline===undefined&&firstBaseline===undefined&&!spreading
      ?{alignSelf:officeWrap.align==="middle"?cellWrappedMiddleJustifyContent():officeWrap.align==="bottom"?cellWrappedBottomJustifyContent():"flex-start"}:{}),
    lineHeight:lineHeight===undefined?"normal":`${lineHeight*scale}px`,fontFamily:base.fontFamily,fontSize:typeof base.fontSize==="number"?base.fontSize*scale:base.fontSize,fontWeight:base.fontWeight,fontStyle:base.fontStyle,textAlign:base.textAlign};
  // One line that sits where the paragraph does (no fixed line box, no
  // alignment offset, no line break to carry): the paragraph and its line are
  // two blocks of the same box, so one element draws both. Most cells on a
  // sheet are this, and the grid mounts one node less for each.
  const linked=(node:ReactNode)=>linkHref?<a href={linkHref} data-spreadsheet-printed-link="" tabIndex={-1} style={PRINTED_LINK_STYLE}>{node}</a>:node;
  const only=lines?.length===1&&!fixedLines&&shown?.offsets[0]===undefined&&!lines[0].hardBreak&&!distributed?lines[0]:undefined;
  if(only){
    const lineStyle={...paragraphStyle,...nativeParagraphLineStyle(only,style,scale,dpi,lineHeight)};
    const run=drawSingleRun&&lineHeight===undefined&&only.parts.length===1&&!Object.keys(only.parts[0].style??{}).length?resolveRelativePartFontSizes(only.parts,style)[0]:undefined;
    if(run){
      // Exactly what the text span would draw (SpreadsheetNativeTextParts'
      // arguments): in the same font as the line, the line's strut and the
      // span's box are one, so the line can carry the runs itself.
      const lead=nativeTextFontLead(run);
      const paint=spreadsheetNativeTextPaint({text:run.text,style:resolveSpreadsheetTextStyle({...style,...run.style},lead,dpi),dpi,scale,advanceOffset:0,fontLeadingText:lead,partStyle:run.style});
      if(paint.style.fontFamily===lineStyle.fontFamily&&paint.style.fontSize===lineStyle.fontSize&&paint.style.fontStyle===lineStyle.fontStyle&&paint.style.fontWeight===undefined)
        return <span ref={ref} data-spreadsheet-native-paragraph="" data-native-text-line="" data-spreadsheet-native-text="" style={{...lineStyle,...paint.style}}>{linked(paint.children)}</span>;
    }
    return <span ref={ref} data-spreadsheet-native-paragraph="" data-native-text-line="" style={lineStyle}>{linked(paintParts(only.parts))}</span>;
  }
  // Distributed: each line's units at their places, the gaps between them
  // equal (or the line centred, or at the start where it overfills).
  const distributedRoom=distributed&&wrap&&stable[5]!=null&&parts.length===1&&!Object.keys(parts[0]?.style??{}).length?stable[5]:undefined;
  const distributedLine=(line:NativeTextLine)=>{
    if(distributedRoom===undefined)return null;
    const text=line.parts.map(part=>part.text).join("");
    if(!text.trim()||line.parts.some(part=>Object.keys(part.style??{}).length))return null;
    const {mode,units}=distributedLineUnits(text);
    const widths=units.map(unit=>measureNativeLineAdvance([{text:unit}],style,dpi));
    if(widths.some(width=>width===undefined))return null;
    const total=widths.reduce<number>((sum,width)=>sum+(width??0),0);
    if(mode==="center"||total>=distributedRoom){
      const trimmed=text.trim();
      const advance=measureNativeLineAdvance([{text:trimmed}],style,dpi);
      const start=mode==="center"&&advance!==undefined?(distributedRoom-advance)/2:0;
      return <span style={{marginLeft:start*scale}}>{paintParts([{text:trimmed}])}</span>;
    }
    const gap=(distributedRoom-total)/(units.length-1);
    return units.map((unit,index)=><span key={index} style={index?{marginLeft:gap*scale}:undefined}>{paintParts([{text:unit}])}</span>);
  };
  return <span ref={ref} data-spreadsheet-native-paragraph="" style={paragraphStyle}>
    {lines?(built?lines.slice(0,built.count):lines).map((line,index)=>{
      const terminal=resolveSpreadsheetTextStyle({...style,...line.breakStyle},"",dpi);
      const offset=shown?.offsets[index];
      const shift=fixedLines?lineShift(index):undefined;
      return <span key={index} data-native-text-line="" style={{...(shift!==undefined?{transform:`translateY(${shift}px)`}:{}),...nativeParagraphLineStyle(line,style,scale,dpi,lineHeight),...(fixedLines?{position:"absolute",top:index*lineHeight*scale+(index?lineSnap(index)-lineSnap(0):0),left:offset??0,width:"100%",...(offset!==undefined?{textAlign:"left"}:{})}:offset!==undefined?{textAlign:"left",position:"relative",left:offset}:{}),
        ...(spreading?{flex:"none",...(lineHeight!==undefined?{height:lineHeight*scale}:{})}:{}),
        ...(distributedRoom!==undefined?{textAlign:"left"}:{})}}>
        {linked(distributedLine(line)??paintParts(line.parts))}
        {line.hardBreak?<><span style={{fontFamily:terminal.fontFamily,fontWeight:terminal.fontWeight,fontStyle:terminal.fontStyle,fontSize:typeof terminal.fontSize==="number"?terminal.fontSize*scale:terminal.fontSize,lineHeight:lineHeight===undefined?undefined:0}}/><span style={{display:"none"}}>{line.hardBreak}</span></>:null}
      </span>;
    }):linked(paintParts(parts))}
    {built&&!fixedLines?<span aria-hidden data-native-text-unbuilt-lines={lines!.length-built.count} style={{display:"block",height:built.rest}}/>:null}
  </span>;
}
