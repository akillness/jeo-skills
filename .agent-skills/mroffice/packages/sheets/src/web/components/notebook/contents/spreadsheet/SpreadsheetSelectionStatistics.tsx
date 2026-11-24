"use client";
/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {memo,useCallback,useEffect,useRef,useState,useSyncExternalStore} from "react";
import {useLocale,useTranslations} from "@mrnote/core/host/next-intl.tsx";
import {PointerContextMenu,type PointerContextMenuEntry} from "@mrnote/core/web/components/ui/PointerContextMenu.tsx";
import {copyRunOutputText as copyPlainText} from "@mrnote/code/web/lib/code-runner/run-output-workbench.ts";
import {formatCellValue} from "@mrnote/core/web/lib/spreadsheet/formula-engine.ts";
import {applyNumberFormat,formatGeneralNumberWith,isNumberFormat,numberFormatFamily} from "@mrnote/core/web/lib/spreadsheet/number-format.ts";
import {viewerNumberSeparators} from "@mrnote/core/web/lib/spreadsheet/locale-number-separators.ts";
import {regionalSystemDateDisplayCode} from "@mrnote/core/web/lib/spreadsheet/number-format-gallery.ts";
import {DEFAULT_STATUS_BAR_STATISTICS,STATUS_BAR_STATISTICS,isStatusBarCountStatistic,readStatusBarStatisticsPreference,statusBarStatisticValue,subscribeStatusBarStatisticsPreference,writeStatusBarStatisticsPreference,type StatusBarStatistic} from "../../../../lib/spreadsheet/status-bar-statistics";
import {useSpreadsheetSelectionStatistics,type SelectionStatisticsHookSource} from "./useSpreadsheetSelectionStatistics";
import { type ExcelDateSystemArg } from "@mrnote/core/web/lib/spreadsheet/excel-1900-calendar.ts";

/** Completion updates this footer only, never the large worksheet host. */
/** Excel shows Sum, Average, Min and Max in the ACTIVE cell's number format
 * ("Average: 11,632.47", not "11632.4742857143"), so a selection of amounts
 * reads as amounts and a selection of dates reads as dates ("Average:
 * 2026/2/3", not 46056). Microsoft Support, "View summary data on the status
 * bar", reads the values as the cells show them. Text and General stay
 * General; a value the format cannot take (a negative date serial) falls back
 * to General. The system short date (built-ins 14 and 22) is drawn in the
 * viewer's region, exactly as the cell is. */
/** A General aggregate is shown to about ten significant digits, which is what
 * Excel's own status bar shows: an average of 3371.56 over three cells reads
 * "1123.853333", never the 1123.8533333333 a full double prints. A cell's own
 * number format decides its own precision, so this applies to the General
 * path only. */
const STATUS_BAR_GENERAL_DIGITS=10;
// The status bar is drawn for the viewer: its numbers take the viewer's
// decimal and thousands separators, as the grid's do (Excel's system ones).
function formatGeneralStatistic(value:number,locale:string):string{
  if(!Number.isFinite(value))return formatCellValue(value);
  const rounded=Number(value.toPrecision(STATUS_BAR_GENERAL_DIGITS));
  return formatGeneralNumberWith(Number.isFinite(rounded)?rounded:value,viewerNumberSeparators(locale));
}
function formatStatistic(value:number,numberFormat:string|undefined,locale:string,date1904:ExcelDateSystemArg=false):string{
  if(!isNumberFormat(numberFormat))return formatGeneralStatistic(value,locale);
  const family=numberFormatFamily(numberFormat);
  if(family==="text"||family==="general")return formatGeneralStatistic(value,locale);
  const code=family==="date"||family==="time"?regionalSystemDateDisplayCode(numberFormat,locale):numberFormat;
  const separators=viewerNumberSeparators(locale);
  try{
    const shown=applyNumberFormat(value,code,separators?{date1904,separators}:{date1904});
    return shown.trim()===""?formatGeneralStatistic(value,locale):shown;
  }catch{return formatGeneralStatistic(value,locale);}
}

const LABEL_KEYS:Record<StatusBarStatistic,string>={
  average:"spreadsheet.selectionAvg",count:"spreadsheet.selectionCount",numericalCount:"spreadsheet.selectionCountNumbers",
  minimum:"spreadsheet.selectionMin",maximum:"spreadsheet.selectionMax",sum:"spreadsheet.selectionSum",
};
const COPIED_MS=1500;
const serverPreference=()=>DEFAULT_STATUS_BAR_STATISTICS;

/** Excel's status bar statistics: Average, Count, Numerical Count, Minimum,
 * Maximum, Sum in that order, the ones the user ticked under Customize Status
 * Bar (right-click anywhere on the status bar), each one clicked to copy its
 * value to the clipboard (Microsoft Support, "Quickly copy information from
 * aggregations"). The right-click is heard on the enclosing element marked
 * `data-spreadsheet-status-bar`, so the whole bar answers it as in Excel. */
export const SpreadsheetSelectionStatistics=memo(function SpreadsheetSelectionStatistics({source,numberFormat,date1904=false}:{source:SelectionStatisticsHookSource;numberFormat?:string;
  /** The workbook reads serials in the 1904 date system (a date average). */
  date1904?:ExcelDateSystemArg}){
  const t=useTranslations("console-notebooks");
  const locale=useLocale();
  const outcome=useSpreadsheetSelectionStatistics(source);
  const preference=useSyncExternalStore(subscribeStatusBarStatisticsPreference,readStatusBarStatisticsPreference,serverPreference);
  const rootRef=useRef<HTMLSpanElement|null>(null);
  const restoreFocusRef=useRef<HTMLElement|null>(null);
  const [menu,setMenu]=useState<{x:number;y:number}|null>(null);
  const [copied,setCopied]=useState(false);
  const copiedTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  useEffect(()=>{
    const root=rootRef.current;if(!root)return;
    const bar=root.closest<HTMLElement>("[data-spreadsheet-status-bar]")??root;
    const open=(event:MouseEvent)=>{
      event.preventDefault();event.stopPropagation();
      restoreFocusRef.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
      setMenu({x:event.clientX,y:event.clientY});
    };
    bar.addEventListener("contextmenu",open);
    return()=>bar.removeEventListener("contextmenu",open);
  },[]);
  useEffect(()=>()=>{if(copiedTimer.current)clearTimeout(copiedTimer.current);},[]);
  const closeMenu=useCallback(()=>{
    setMenu(null);
    const previous=restoreFocusRef.current;restoreFocusRef.current=null;
    if(previous?.isConnected)previous.focus({preventScroll:true});
  },[]);
  const copy=useCallback(async(text:string)=>{
    if(!(await copyPlainText(text)))return;
    if(copiedTimer.current)clearTimeout(copiedTimer.current);
    setCopied(true);
    copiedTimer.current=setTimeout(()=>{copiedTimer.current=null;setCopied(false);},COPIED_MS);
  },[]);

  const stats=outcome.values;
  const figures=STATUS_BAR_STATISTICS.map(id=>{
    const value=stats?statusBarStatisticValue(id,stats):null;
    const text=value===null?null:isStatusBarCountStatistic(id)?String(value):formatStatistic(value,numberFormat,locale,date1904);
    return {id,label:t(LABEL_KEYS[id]),text};
  });
  const shown=figures.filter(figure=>preference[figure.id]&&figure.text!==null);
  const entries:PointerContextMenuEntry[]=figures.map(figure=>({
    id:figure.id,label:figure.label,detail:figure.text??undefined,checked:preference[figure.id],keepOpen:true,
    testId:`spreadsheet-statusbar-customize-${figure.id}`,
    onSelect:()=>{const current=readStatusBarStatisticsPreference();writeStatusBarStatisticsPreference({...current,[figure.id]:!current[figure.id]});},
  }));

  let body;
  if(outcome.pending)body=<span className="min-w-0 flex-1 text-xs text-slate-600" role="status" data-testid="spreadsheet-selection-stats-pending">{t("spreadsheet.calculationCalculating")}</span>;
  else if(outcome.failed)body=<span className="min-w-0 flex-1 text-xs" role="alert" data-testid="spreadsheet-selection-stats-error">{t("spreadsheet.selectionStatsFailed")} <button type="button" onClick={outcome.retry}>{t("window.error.retry")}</button></span>;
  else if(!shown.length)body=<span className="min-w-0 flex-1" aria-hidden />;
  else body=<span className="spreadsheet-window__selection-stats flex min-w-0 flex-1 items-center justify-end gap-3 overflow-hidden whitespace-nowrap text-xs text-slate-600" data-testid="spreadsheet-selection-stats" role="status">
    {copied?<span className="shrink-0 font-medium" data-testid="spreadsheet-selection-stats-copied">{t("spreadsheet.statusBar.copied")}</span>:null}
    {shown.map(figure=><button key={figure.id} type="button" className="shrink-0 rounded px-1 py-0.5 hover:bg-slate-500/10 focus-visible:outline focus-visible:outline-1" data-statistic={figure.id} data-testid={`spreadsheet-selection-stat-${figure.id}`} title={t("spreadsheet.statusBar.copyValue")} onClick={()=>void copy(figure.text!)}>{figure.label}: {figure.text}</button>)}
  </span>;
  return <span ref={rootRef} className="contents">
    {body}
    {menu?<PointerContextMenu x={menu.x} y={menu.y} label={t("spreadsheet.statusBar.customize")} heading={t("spreadsheet.statusBar.customize")} entries={entries} onClose={closeMenu} testId="spreadsheet-statusbar-customize-menu"/>:null}
  </span>;
});
