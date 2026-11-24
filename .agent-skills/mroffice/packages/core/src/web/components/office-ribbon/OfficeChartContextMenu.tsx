"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The right-click menu of a chart, once for Docs, the deck and the worksheet.
 *
 * Word, Excel and PowerPoint open one shortcut menu on a chart's area:
 * Cut / Copy / Paste; Reset to Match Style ("clear the custom formatting and
 * return the chart to its style", Microsoft Support "Save a custom chart as a
 * template"); Font; Change Chart Type; Edit Data (Word and PowerPoint, whose
 * chart data is an embedded workbook) or Select Data; Move Chart (Excel only:
 * a chart moves between sheets); 3-D Rotation (a 3-D chart); Group, Bring to
 * Front, Send to Back; Edit Alt Text; Format Chart Area ("select a chart
 * element, right-click it, and click Format <element>", Microsoft Support
 * "Format elements of a chart"). Excel alone adds Save as Template (a .crtx)
 * and Assign Macro (XLS-A081); a host without them leaves them out.
 *
 * The menu owns the order, the words and the test ids; a host adapter gives
 * each command it has (a command it does not have is left out, one it has but
 * cannot run now is listed greyed with the reason). Built on the shared
 * `PointerContextMenu`, the anchoring and keyboard every editor's right click
 * already uses.
 */
import { useTranslations } from "../../../host/next-intl";
import {
  PointerContextMenu,
  type PointerContextMenuEntry,
} from "../ui/PointerContextMenu";
import { officeShortcut } from "../../lib/office-context-menu";
import {
  officeContextMenuIcon,
  type OfficeContextMenuIconName,
} from "./officeContextMenuIcons";

export interface OfficeChartContextCommand {
  run: () => void;
  /** The reason the command cannot run on this chart now. */
  disabledReason?: string | null;
}

export type OfficeChartContextCommandId =
  | "cut"
  | "copy"
  | "paste"
  | "resetToMatchStyle"
  | "font"
  | "changeChartType"
  | "saveAsTemplate"
  | "editData"
  | "selectData"
  | "moveChart"
  | "rotation3d"
  | "group"
  | "ungroup"
  | "bringToFront"
  | "bringForward"
  | "sendToBack"
  | "sendBackward"
  | "assignMacro"
  | "altText"
  | "formatChartArea"
  // The element the right click landed on (PowerPoint's menu follows it,
  // PPT-C011): Delete it, add its labels, format it; and New Comment.
  | "deleteElement"
  | "addDataLabels"
  | "formatSeries"
  | "formatLegend"
  | "formatTitle"
  | "newComment";

/** Office's groups, in its order; a separator between groups. */
const GROUPS: readonly (readonly OfficeChartContextCommandId[])[] = [
  ["cut", "copy", "paste"],
  ["deleteElement", "resetToMatchStyle", "font"],
  ["changeChartType", "saveAsTemplate", "editData", "selectData", "moveChart", "rotation3d"],
  ["addDataLabels"],
  ["group", "ungroup", "bringToFront", "bringForward", "sendToBack", "sendBackward"],
  ["assignMacro", "altText", "formatChartArea", "formatSeries", "formatLegend", "formatTitle"],
  ["newComment"],
];

const WORDS: Record<OfficeChartContextCommandId, string> = {
  cut: "office.chartContextMenu.cut",
  copy: "office.chartContextMenu.copy",
  paste: "office.chartContextMenu.paste",
  resetToMatchStyle: "office.chartContextMenu.resetToMatchStyle",
  font: "office.chartContextMenu.font",
  changeChartType: "office.chartContextMenu.changeChartType",
  saveAsTemplate: "office.chartContextMenu.saveAsTemplate",
  editData: "office.chartContextMenu.editData",
  selectData: "office.chartContextMenu.selectData",
  moveChart: "office.chartContextMenu.moveChart",
  rotation3d: "office.chartContextMenu.rotation3d",
  group: "office.chartContextMenu.group",
  ungroup: "office.chartContextMenu.ungroup",
  bringToFront: "office.chartContextMenu.bringToFront",
  bringForward: "office.chartContextMenu.bringForward",
  sendToBack: "office.chartContextMenu.sendToBack",
  sendBackward: "office.chartContextMenu.sendBackward",
  assignMacro: "office.chartContextMenu.assignMacro",
  altText: "office.chartContextMenu.altText",
  formatChartArea: "office.chartContextMenu.formatChartArea",
  deleteElement: "office.chartContextMenu.deleteElement",
  addDataLabels: "office.chartContextMenu.addDataLabels",
  formatSeries: "office.chartContextMenu.formatSeries",
  formatLegend: "office.chartContextMenu.formatLegend",
  formatTitle: "office.chartContextMenu.formatTitle",
  newComment: "office.chartContextMenu.newComment",
};

/**
 * Office's Bring to Front and Send to Back are cascading rows on a chart:
 * "Bring to Front ▸ Bring to Front / Bring Forward" (XLS-A081). A host that
 * gives the one-step command gets the cascade; one that does not keeps the
 * plain row. A host with only the one-step command (Word's floating chart,
 * whose ribbon moves it one layer) lists that row on its own.
 */
const CASCADES: Partial<Record<OfficeChartContextCommandId, OfficeChartContextCommandId>> = {
  // "Group ▸ Group / Ungroup".
  group: "ungroup",
  bringToFront: "bringForward",
  sendToBack: "sendBackward",
};

/** The glyph each row draws in the menu's icon column (Office on the web). */
const ICONS: Record<OfficeChartContextCommandId, OfficeContextMenuIconName> = {
  cut: "cut",
  copy: "copy",
  paste: "paste",
  resetToMatchStyle: "clear",
  font: "font",
  changeChartType: "layout",
  saveAsTemplate: "duplicate",
  editData: "table",
  selectData: "tableProperties",
  moveChart: "duplicate",
  rotation3d: "formatObject",
  group: "group",
  ungroup: "group",
  bringToFront: "bringForward",
  bringForward: "bringForward",
  sendToBack: "sendBackward",
  sendBackward: "sendBackward",
  assignMacro: "link",
  altText: "altText",
  formatChartArea: "formatObject",
  deleteElement: "delete",
  addDataLabels: "insert",
  formatSeries: "formatObject",
  formatLegend: "formatObject",
  formatTitle: "formatObject",
  newComment: "newComment",
};

/** The shortcut text Office on the web prints beside a row. */
const SHORTCUTS: Partial<Record<OfficeChartContextCommandId, () => string>> = {
  cut: () => officeShortcut("cut"),
  copy: () => officeShortcut("copy"),
  paste: () => officeShortcut("paste"),
};

export interface OfficeChartContextMenuProps {
  x: number;
  y: number;
  locale: string;
  commands: Partial<Record<OfficeChartContextCommandId, OfficeChartContextCommand>>;
  onClose: () => void;
  /** Every item's test id is `${testIdPrefix}-${command}`. */
  testIdPrefix: string;
  /** A host that translates the words (the worksheet's catalogue). */
  label?: (command: OfficeChartContextCommandId) => string | undefined;
  container?: HTMLElement | null;
}

export function OfficeChartContextMenu(props: OfficeChartContextMenuProps) {
  const t = useTranslations("console-notebooks");
  const word = (command: OfficeChartContextCommandId) =>
    props.label?.(command) ?? t(WORDS[command]);
  const entries: PointerContextMenuEntry[] = [];
  for (const [index, group] of GROUPS.entries()) {
    // A cascade's second row is listed inside its first when the host has both.
    const nested = new Set(
      Object.entries(CASCADES)
        .filter(([first]) => props.commands[first as OfficeChartContextCommandId])
        .map(([, step]) => step),
    );
    const items = group.filter((command) => props.commands[command] && !nested.has(command));
    if (!items.length) continue;
    if (entries.length) entries.push({ id: `separator-${index}`, separator: true });
    const row = (command: OfficeChartContextCommandId, testId: string): PointerContextMenuEntry => {
      const entry = props.commands[command]!;
      return {
        id: testId,
        label: word(command),
        disabled: Boolean(entry.disabledReason),
        ...(entry.disabledReason ? { disabledReason: entry.disabledReason } : {}),
        onSelect: entry.run,
        testId: `${props.testIdPrefix}-${testId}`,
        icon: officeContextMenuIcon(ICONS[command]),
        ...(SHORTCUTS[command] ? { shortcut: SHORTCUTS[command]!() } : {}),
      };
    };
    for (const command of items) {
      const step = CASCADES[command];
      if (step && props.commands[step]) {
        entries.push({
          ...row(command, `${command}-menu`),
          disabled: false,
          onSelect: () => {},
          submenu: [row(command, command), row(step, step)],
        });
        continue;
      }
      entries.push(row(command, command));
    }
  }
  return (
    <PointerContextMenu
      x={props.x}
      y={props.y}
      label={t("office.chartContextMenu.menuLabel")}
      entries={entries}
      onClose={props.onClose}
      testId={props.testIdPrefix}
      container={props.container}
    />
  );
}

/**
 * The chart with Reset to Match Style applied: every custom formatting the
 * author set on its elements goes, and the chart shows its style again. The
 * element switches, data, titles and the Change Colors pick (the chart's
 * colour scheme, part of its style) stay. Null when nothing is custom.
 */
export function officeChartResetToMatchStyle<T extends { format?: object }>(
  attrs: T,
): T | null {
  const format = { ...(attrs.format ?? {}) } as Record<string, unknown>;
  let changed = false;
  for (const key of Object.keys(format)) {
    if (
      key.endsWith("Style") ||
      key === "seriesStyles" ||
      key === "sliceStyles" ||
      key === "axisStyles" ||
      // The chart's own text (Home ribbon size, bold, colour) is formatting too (PPT-B218).
      key === "text"
    ) {
      delete format[key];
      changed = true;
    }
  }
  if (!changed) return null;
  return {
    ...attrs,
    format: Object.keys(format).length ? format : undefined,
  } as T;
}

/**
 * Press a ribbon control a context-menu command stands for once it is on
 * screen (a command that first switches the host to the tab the control is
 * on): "click" runs a command button, "menu" opens a menu trigger the way a
 * keyboard does. Gives up quietly after a few frames.
 */
export function activateOfficeControl(
  testId: string,
  how: "click" | "menu",
  attempts = 30,
): void {
  if (typeof document === "undefined") return;
  const step = (left: number) => {
    const control = document.querySelector<HTMLElement>(
      `[data-testid="${testId}"]`,
    );
    if (control && !(control as HTMLButtonElement).disabled) {
      if (how === "menu") {
        control.focus();
        control.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
        );
      } else {
        control.click();
      }
      return;
    }
    if (left > 0) requestAnimationFrame(() => step(left - 1));
  };
  step(attempts);
}
