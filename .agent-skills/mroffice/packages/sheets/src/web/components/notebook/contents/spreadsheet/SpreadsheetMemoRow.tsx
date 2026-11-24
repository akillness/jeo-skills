"use client";
/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {useInsertionEffect,useState,useRef,type ReactNode} from "react";
import type { RestingCanvasCell } from "./SpreadsheetCanvasRunRow";

type LiteralCell = {readonly value?: string;readonly formula?:unknown};
export function sameRowSourceMetadata(a:object,b:object,except:string|readonly string[]){
  const left=a as Record<string,unknown>,right=b as Record<string,unknown>;
  const included=(key:string)=>typeof except==="string"?key!==except:!except.includes(key);
  const keys=Object.keys(left).filter(included);
  const other=Object.keys(right).filter(included);
  return keys.length===other.length&&keys.every(key=>Object.prototype.hasOwnProperty.call(right,key)&&Object.is(left[key],right[key]));
}
export function literalRowChanges(before:Readonly<Record<string,LiteralCell>>,after:Readonly<Record<string,LiteralCell>>,keys:readonly string[]){
  return keys.every(key=>{
    const a=before[key],b=after[key];
    const literal=(cell:LiteralCell|undefined)=>!cell?.formula&&(cell?.value===undefined||typeof cell.value==="string"&&!cell.value.trimStart().startsWith("="));
    return literal(a)&&literal(b)&&sameRowSourceMetadata(a??{},b??{},["value","kind"]);
  });
}

/** What of a cell's look shows in its own row alone. A border shows on the next
 * row's edge too, and a font's size or wrapping can move the rows below. */
const OWN_ROW_LOOK = new Set(["bold", "italic", "underline", "underlineStyle", "strikethrough", "cellFontBold", "cellFontItalic", "cellFontUnderline"]);
/** Whether `keys` changed only that: bold on one cell rendered all sixty rows of the band. */
export function ownRowLookChanges(before:Readonly<Record<string,LiteralCell&{style?:Record<string,unknown>}>>,after:Readonly<Record<string,LiteralCell&{style?:Record<string,unknown>}>>,keys:readonly string[]){
  return keys.every(key=>{
    const a=before[key],b=after[key];
    if(!b) return false;
    // A blank cell the look is put on comes into being with it, holding nothing else.
    if(a?!sameRowSourceMetadata(a,b,"style"):(b.formula||b.value||!sameRowSourceMetadata({},b,["style","value","kind"]))) return false;
    // A style patch makes its borders and theme colours anew, with the same content.
    const left=a?.style??{},right=b.style??{};
    for(const name of new Set([...Object.keys(left),...Object.keys(right)])) if(!OWN_ROW_LOOK.has(name)&&!Object.is(left[name],right[name])&&JSON.stringify(left[name])!==JSON.stringify(right[name])) return false;
    return true;
  });
}

/** A bounded derived-key cache, not a published model or a version history.
 * Abandoned renders can only cause another conservative invalidation. */
export class SpreadsheetRowContext {
  #values: readonly unknown[] = [];
  #token: object = {};
  key(sheet: object, sheets: readonly object[]): object {
    const values: unknown[] = [];
    // Drawings and native charts paint in the object layer outside the rows,
    // so moving or restyling one does not change any row's paint.
    for (const [key,value] of Object.entries(sheet)) if (key !== "cells" && key !== "objects" && key !== "charts") values.push(key,value);
    values.push(...sheets.map(candidate=>candidate===sheet?null:candidate));
    if(values.length!==this.#values.length || values.some((value,index)=>!Object.is(value,this.#values[index]))){
      this.#values=values;this.#token={};
    }
    return this.#token;
  }
}

/** A row's cells as last rendered, each under the signature of what the row's
 * interaction state (the active, edited and fill-handle cell, the selection)
 * makes of it. Valid only while the row's epoch and revision hold: a row
 * rendered again for its interaction alone hands each unchanged cell back its
 * element, and React leaves that cell alone. */
export type SpreadsheetRowCellCache = Map<number, { sig: string; node: ReactNode | RestingCanvasCell }>;

/** The adapter receives fresh props on every host render, so it never pins an
 * old full-model render closure. Only its rendered node and visual dependencies
 * are cached. A guarded render-phase state adjustment keeps the snapshot in
 * the same React transaction, including interrupted/Suspense renders. The host
 * supplies row-local event factories for content-revision reuse. */
export function SpreadsheetMemoRow({render,epoch,interaction,revision}:{render:(cells?:SpreadsheetRowCellCache)=>ReactNode;epoch:readonly unknown[];interaction:readonly unknown[];revision?:number}){
  const [snapshot,setSnapshot]=useState(()=>{const cells:SpreadsheetRowCellCache=new Map();return {epoch,interaction,revision,cells,node:render(cells)};});
  const same=(a:readonly unknown[],b:readonly unknown[])=>a.length===b.length&&a.every((value,index)=>Object.is(value,b[index]));
  if(snapshot.revision!==revision || !same(snapshot.epoch,epoch) || !same(snapshot.interaction,interaction)){
    // Only an interaction change keeps the cells: anything in the epoch or a
    // new revision may change any cell.
    const cells:SpreadsheetRowCellCache=snapshot.revision===revision&&same(snapshot.epoch,epoch)?snapshot.cells:new Map();
    const next={epoch,interaction,revision,cells,node:render(cells)};
    setSnapshot(next);
    return next.node;
  }
  return snapshot.node;
}

/** Publish only during commit, before any parent/child layout effect can
 * focus or blur a grid input. No DOM reads or state updates belong here. */
export function useCommittedGridEventScope<T>(scope:T) {
  const bridge=useRef(scope);
  useInsertionEffect(()=>{bridge.current=scope;});
  return bridge;
}
