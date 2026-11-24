"use client";
/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {useEffect,useLayoutEffect,useMemo,useRef,useState} from "react";
import {selectionStatisticsSteps,selectionStatisticsSync,type SelectionStatisticsSource} from "../../../../lib/spreadsheet/selection-statistics";
import type {SelectionAggregates} from "../../../../lib/spreadsheet/grid-ops";
import {yieldCalculationTask} from "@mrnote/core/web/lib/spreadsheet/background-calculation-protocol.ts";

export interface SelectionStatisticsHookSource extends SelectionStatisticsSource {
  enabled:boolean; calculationPending:boolean;
  isCurrent():boolean;
}
export function useSpreadsheetSelectionStatistics(source:SelectionStatisticsHookSource){
  const live=useRef(source);useLayoutEffect(()=>{live.current=source;},[source]);
  const [attempt,setAttempt]=useState(0);
  const [outcome,setOutcome]=useState<{source:SelectionStatisticsHookSource;values:SelectionAggregates|null;failed:boolean}|null>(null);
  const large=(source.range.r2-source.range.r1+1)*(source.range.c2-source.range.c1+1)>128;
  const immediate=useMemo(()=>{
    void attempt;
    if(!source.enabled||source.calculationPending||large)return null;
    try{return {source,values:selectionStatisticsSync(source),failed:false};}
    catch{return {source,values:null,failed:true};}
  },[source,large,attempt]);
  useEffect(()=>{
    if(!source.enabled||source.calculationPending||!large)return;
    let cancelled=false;
    const current=()=>!cancelled&&live.current===source&&source.isCurrent();
    void(async()=>{
      try{
        await yieldCalculationTask();
        const steps=selectionStatisticsSteps(source);
        while(current()){
          const next=steps.next();
          if(next.done){if(current())setOutcome({source,values:next.value,failed:false});return;}
          await yieldCalculationTask();
        }
      }catch{if(current())setOutcome({source,values:null,failed:true});}
    })();
    return()=>{cancelled=true;};
  },[source,large,attempt]);
  const result=immediate??(outcome?.source===source?outcome:null);
  return {
    values:source.enabled&&!source.calculationPending?result?.values??null:null,
    pending:source.enabled&&(source.calculationPending||!result),
    failed:source.enabled&&!source.calculationPending&&result?.failed===true,
    retry:()=>{setOutcome(null);setAttempt(value=>value+1);},
  };
}
