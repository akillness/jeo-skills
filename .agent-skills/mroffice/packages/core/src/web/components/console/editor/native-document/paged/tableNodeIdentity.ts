/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {Fragment, type Node as PmNode} from '@tiptap/pm/model';
import {TableMap} from '@tiptap/pm/tables';
import {TABLE_REPEATED_HEADER_ATTR,TABLE_SOURCE_ROW_ATTR,TABLE_SOURCE_CELL_COL_ATTR,
  TABLE_VERTICAL_CONTINUATION_ATTR} from './tablePagination';

const ordinal=(value:unknown,fallback:number)=>typeof value==='number'&&Number.isInteger(value)&&value>=0?value:fallback;

/** Coordinates come from the fragmentation contract, or the original grid.
 * Repeated headers and synthetic vertical continuation cells have no reusable
 * original layout identity. They remain new even if their text is identical. */
function cells(table:PmNode,visit:(cell:PmNode,key:string)=>PmNode):PmNode {
  if(table.type.name!=='table')return table;
  const map=TableMap.get(table),rows:PmNode[]=[];let changed=false;
  table.forEach((row,rowOffset,rowIndex)=>{
    if(row.attrs[TABLE_REPEATED_HEADER_ATTR]===true){rows.push(row);return;}
    const sourceRow=ordinal(row.attrs[TABLE_SOURCE_ROW_ATTR],rowIndex),next:PmNode[]=[];let rowChanged=false;
    row.forEach((cell,cellOffset)=>{
      const col=ordinal(cell.attrs[TABLE_SOURCE_CELL_COL_ATTR],map.findCell(rowOffset+cellOffset+1).left);
      const resolved=cell.attrs[TABLE_VERTICAL_CONTINUATION_ATTR]===true?cell:visit(cell,`${sourceRow}:${col}`);
      next.push(resolved);rowChanged ||= resolved!==cell;
    });
    rows.push(rowChanged?row.copy(Fragment.fromArray(next)):row);changed ||= rowChanged;
  });
  return changed?table.copy(Fragment.fromArray(rows)):table;
}

/** JSON fragmentation remains authoritative. Restore only uniquely equal,
 * unchanged block subtrees in the same semantic row/cell, in source order.
 * This keeps measured typography caches alive during pure page transfers.
 * New attrs, split blocks and ambiguous duplicates retain their new identity.
 * Callers still check the resulting schema and restore semantic selections. */
export function reconcileTableNodeIdentities(candidates:readonly PmNode[],sources:readonly PmNode[]):PmNode[] {
  const blocks=new Map<string,PmNode[]>();
  for(const source of sources)cells(source,(cell,key)=>{
    const list=blocks.get(key)??[];cell.forEach(block=>list.push(block));blocks.set(key,list);return cell;
  });
  const cursor=new Map<string,number>(),claimed=new Set<PmNode>();
  return candidates.map(candidate=>cells(candidate,(cell,key)=>{
    const originals=blocks.get(key);if(!originals)return cell;
    const next:PmNode[]=[];let changed=false;
    cell.forEach(block=>{
      let match=-1;
      for(let i=cursor.get(key)??0;i<originals.length;i++){
        if(claimed.has(originals[i])||!block.eq(originals[i]))continue;
        if(match!==-1){match=-2;break;}match=i;
      }
      const resolved=match>=0?originals[match]:block;
      if(match>=0){cursor.set(key,match+1);claimed.add(resolved);}
      next.push(resolved);changed ||= resolved!==block;
    });
    return changed?cell.copy(Fragment.fromArray(next)):cell;
  }));
}
