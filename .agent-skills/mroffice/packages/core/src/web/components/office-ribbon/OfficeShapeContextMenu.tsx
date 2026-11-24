"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useMemo } from "react";
import { useTranslations } from "../../../host/next-intl";

import {
  PointerContextMenu,
  type PointerContextMenuAction,
  type PointerContextMenuEntry,
} from "../ui/PointerContextMenu";
import { formatOfficeShortcut, officeShortcut } from "../../lib/office-context-menu";
import {
  officeContextMenuIcon,
  type OfficeContextMenuIconName,
} from "./officeContextMenuIcons";






















export interface OfficeShapeContextMenuLabels {
  menu: string;
  cut: string;
  copy: string;
  paste: string;
  editText: string;
  editPoints: string;
  group: string;
  regroup: string;
  ungroup: string;
  bringToFront: string;
  bringForward: string;
  sendToBack: string;
  sendBackward: string;
  link: string;
  saveAsPicture: string;
  setAsDefault: string;
  wrapText: string;
  insertCaption: string;
  editAltText: string;
  sizeAndPosition: string;
  moreLayoutOptions: string;
  formatShape: string;
  /** Said on every writing row when the page is read-only. */
  readOnly: string;
  /** PowerPoint for the web's rows; the catalog words below are the fallback. */
  changeShape?: string;
  arrange?: string;
  addAnimation?: string;
  newComment?: string;
  /** Excel's Assign Macro… (a host with macros). */
  assignMacro?: string;
  /** A connector's rows: Connector Type ▸, Reroute Connectors, and Set as
   * Default Line (Set as Default Shape's word on a line). */
  connectorType?: string;
  rerouteConnectors?: string;
  setAsDefaultLine?: string;
  /** PowerPoint (desktop) rows. */
  actionSettings?: string;
  lock?: string;
}

/** One command the host offers; `disabledReason` greys it and says why. */
export interface OfficeShapeContextMenuCommand {
  onSelect: () => void;
  disabled?: boolean;
  disabledReason?: string;
  testId?: string;
  /** The host's own word for the row (the deck's "Format Options" for
   * Format Shape); the catalog word is the default. */
  label?: string;
  /** The host's own chord text (the deck's Group ⌥⌘G); else the shared one. */
  shortcut?: string;
}

export interface OfficeShapeContextMenuWrapOption
  extends OfficeShapeContextMenuCommand {
  id: string;
  label: string;
  checked: boolean;
}

/** Change Shape ▸: the presets the shape can become, the current one checked. */
export interface OfficeShapeContextMenuChangeShape {
  options: readonly OfficeShapeContextMenuWrapOption[];
  disabled?: boolean;
  disabledReason?: string;
}

export interface OfficeShapeContextMenuHost {
  /** False greys every writing row with `labels.readOnly`. */
  writable: boolean;
  cut?: OfficeShapeContextMenuCommand;
  copy?: OfficeShapeContextMenuCommand;
  paste?: OfficeShapeContextMenuCommand;
  editText?: OfficeShapeContextMenuCommand;
  editPoints?: OfficeShapeContextMenuCommand;
  group?: OfficeShapeContextMenuCommand;
  regroup?: OfficeShapeContextMenuCommand;
  ungroup?: OfficeShapeContextMenuCommand;
  bringToFront?: OfficeShapeContextMenuCommand;
  bringForward?: OfficeShapeContextMenuCommand;
  sendToBack?: OfficeShapeContextMenuCommand;
  sendBackward?: OfficeShapeContextMenuCommand;
  link?: OfficeShapeContextMenuCommand;
  /** Open Hyperlink: given when the right click landed on a link (a word's
   * or the object's), drawn just above the link row. Reading, so it stays
   * available on a read-only page. Its label is the host's. */
  openLink?: OfficeShapeContextMenuCommand;
  saveAsPicture?: OfficeShapeContextMenuCommand;
  /** Excel only (XLS-A081): attach a macro a click on the shape runs. */
  assignMacro?: OfficeShapeContextMenuCommand;
  setAsDefault?: OfficeShapeContextMenuCommand;
  /** Word only: the wrap modes, one checked. */
  wrapText?: readonly OfficeShapeContextMenuWrapOption[];
  insertCaption?: OfficeShapeContextMenuCommand;
  editAltText?: OfficeShapeContextMenuCommand;
  sizeAndPosition?: OfficeShapeContextMenuCommand;
  /** Word's name for the layout dialog; drawn instead of Size and Position. */
  moreLayoutOptions?: OfficeShapeContextMenuCommand;
  formatShape?: OfficeShapeContextMenuCommand;
  /** PowerPoint for the web's Change Shape ▸ (the deck). */
  changeShape?: OfficeShapeContextMenuChangeShape;
  /** PowerPoint for the web's Add Animation (the deck). */
  addAnimation?: OfficeShapeContextMenuCommand;
  /** Office on the web's New Comment (every app has it on the object). */
  newComment?: OfficeShapeContextMenuCommand;
  /** PowerPoint (desktop): Action Settings… and Lock / Unlock. */
  actionSettings?: OfficeShapeContextMenuCommand;
  lock?: OfficeShapeContextMenuCommand;
  /**
   * A connector selected (PowerPoint): Connector Type ▸ (Straight / Elbow /
   * Curved, the current one checked) and Reroute Connectors take the place
   * of Edit Text / Edit Points, and Set as Default reads "Line".
   */
  connectorType?: readonly OfficeShapeContextMenuWrapOption[];
  rerouteConnectors?: OfficeShapeContextMenuCommand;
  /** The selection is a line: Set as Default says "Set as Default Line". */
  defaultIsLine?: boolean;
  /** Host-only groups, each drawn after a separator, in order. */
  extraGroups?: readonly (readonly PointerContextMenuEntry[])[];
}

export interface OfficeShapeContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  /** `"presentation"` -> `presentation-shape-context-...`, and so on. */
  testIdPrefix: string;
  labels: OfficeShapeContextMenuLabels;
  host: OfficeShapeContextMenuHost;
  container?: HTMLElement | null;
  /** A host whose menu already had an id keeps it. */
  menuTestId?: string;
  /**
   * `"web"` (the default) is Office on the web's order; `"powerpoint-desktop"`
   * is PowerPoint for the desktop's (the deck, audit PPT-C003..C006).
   */
  layout?: OfficeShapeContextMenuLayout;
}

export type OfficeShapeContextMenuLayout = "web" | "powerpoint-desktop";

/** The glyph each row draws in the icon column, as Office on the web does. */
const ICONS: Record<string, OfficeContextMenuIconName> = {
  cut: "cut",
  copy: "copy",
  paste: "paste",
  "group-menu": "group",
  group: "group",
  regroup: "group",
  ungroup: "ungroup",
  "change-shape-menu": "changeShape",
  "format-shape": "formatObject",
  "arrange-menu": "bringForward",
  "bring-to-front": "bringForward",
  "bring-forward": "bringForward",
  "send-backward": "sendBackward",
  "send-to-back": "sendBackward",
  "add-animation": "animation",
  "edit-alt-text": "altText",
  "new-comment": "newComment",
  "edit-text": "font",
  "edit-points": "editPoints",
  link: "link",
  "open-link": "link",
  "save-as-picture": "picture",
  "set-as-default": "formatObject",
  "wrap-text": "wrapText",
  "insert-caption": "font",
  "size-and-position": "formatObject",
  "more-layout-options": "formatObject",
  "bring-to-front-menu": "bringForward",
  "send-to-back-menu": "sendBackward",
  "action-settings": "link",
  lock: "protect",
};

/** The shortcut text Office on the web prints beside a row. */
const SHORTCUTS: Record<string, () => string> = {
  cut: () => officeShortcut("cut"),
  copy: () => officeShortcut("copy"),
  paste: () => officeShortcut("paste"),
  link: () => officeShortcut("link"),
  // PowerPoint and Word on the web print Ctrl+Shift+M / ⌘+⇧+M here (Excel's
  // Alt+⌘+M belongs to its cell menu).
  "new-comment": () => formatOfficeShortcut("Mod+Shift+M"),
};

/** Commands that read the selection only; they stay live on a read-only page. */
const READ_ONLY_SAFE = new Set([
  "copy",
  "open-link",
  "save-as-picture",
  "format-shape",
  "size-and-position",
  "more-layout-options",
  "new-comment",
]);

/**
 * The menu's entries, in Office's order. Exported so a host whose own menu
 * already exists can splice the same list into it instead of drawing a
 * second menu.
 */
export function officeShapeContextMenuEntries({
  testIdPrefix,
  labels,
  host,
  layout = "web",
}: Pick<OfficeShapeContextMenuProps, "testIdPrefix" | "labels" | "host" | "layout">):
  PointerContextMenuEntry[] {
  const id = (suffix: string) => `${testIdPrefix}-shape-context-${suffix}`;
  const action = (
    key: string,
    label: string,
    command: OfficeShapeContextMenuCommand | undefined,
    options: Partial<PointerContextMenuAction> = {},
  ): PointerContextMenuAction | null => {
    if (!command) return null;
    const readOnlyBlocked = !host.writable && !READ_ONLY_SAFE.has(key);
    const disabled = readOnlyBlocked || Boolean(command.disabled);
    return {
      id: key,
      label: command.label ?? label,
      onSelect: command.onSelect,
      testId: command.testId ?? id(key),
      disabled,
      disabledReason: disabled
        ? (readOnlyBlocked ? labels.readOnly : command.disabledReason)
        : undefined,
      ...(ICONS[key] ? { icon: officeContextMenuIcon(ICONS[key]) } : {}),
      ...(command.shortcut
        ? { shortcut: command.shortcut }
        : SHORTCUTS[key]
          ? { shortcut: SHORTCUTS[key]() }
          : {}),
      ...options,
    };
  };
  const compact = (list: (PointerContextMenuAction | null)[]) =>
    list.filter((entry): entry is PointerContextMenuAction => entry !== null);
  const submenu = (
    key: string,
    label: string,
    items: (PointerContextMenuAction | null)[],
    // A gate on the row itself (Change Shape greyed with its reason even
    // when every preset under it would be live).
    gate?: { disabled?: boolean; disabledReason?: string },
  ): PointerContextMenuAction | null => {
    const children = compact(items);
    if (children.length === 0) return null;
    const readOnlyBlocked = !host.writable && !READ_ONLY_SAFE.has(key);
    const disabled =
      Boolean(gate?.disabled) || readOnlyBlocked || children.every((child) => child.disabled);
    return {
      id: key,
      label,
      onSelect: () => undefined,
      testId: id(key),
      ...(ICONS[key] ? { icon: officeContextMenuIcon(ICONS[key]) } : {}),
      disabled,
      disabledReason: disabled
        ? gate?.disabled
          ? gate.disabledReason
          : readOnlyBlocked
            ? labels.readOnly
            : children[0]!.disabledReason
        : undefined,
      submenu: children,
    };
  };

  const groups: PointerContextMenuAction[][] =
    layout === "powerpoint-desktop"
      ? desktopGroups()
      : [
    // PowerPoint for the web, in its order.
    compact([
      action("cut", labels.cut, host.cut),
      action("copy", labels.copy, host.copy),
      action("paste", labels.paste, host.paste),
    ]),
    compact([
      submenu("group-menu", labels.group, [
        action("group", labels.group, host.group),
        action("ungroup", labels.ungroup, host.ungroup),
        action("regroup", labels.regroup, host.regroup),
      ]),
      host.changeShape
        ? submenu(
            "change-shape-menu",
            labels.changeShape ?? "Change Shape",
            host.changeShape.options.map((option) =>
              action(`change-shape-${option.id}`, option.label, option, {
                checked: option.checked,
              }),
            ),
            host.changeShape,
          )
        : null,
      action("format-shape", labels.formatShape, host.formatShape),
      submenu("arrange-menu", labels.arrange ?? labels.bringToFront, [
        action("bring-to-front", labels.bringToFront, host.bringToFront),
        action("bring-forward", labels.bringForward, host.bringForward),
        action("send-backward", labels.sendBackward, host.sendBackward),
        action("send-to-back", labels.sendToBack, host.sendToBack),
      ]),
      action("add-animation", labels.addAnimation ?? "Add Animation", host.addAnimation),
    ]),
    compact([action("edit-alt-text", labels.editAltText, host.editAltText)]),
    compact([action("new-comment", labels.newComment ?? "New Comment", host.newComment)]),
    // Office's desktop rows the web menu lacks, in their historical order.
    compact([
      action("edit-text", labels.editText, host.editText),
      action("edit-points", labels.editPoints, host.editPoints),
    ]),
    compact([
      action("open-link", host.openLink?.label ?? "Open Hyperlink", host.openLink),
      action("link", labels.link, host.link),
      action("save-as-picture", labels.saveAsPicture, host.saveAsPicture),
      action("assign-macro", labels.assignMacro ?? "Assign Macro…", host.assignMacro),
      action("set-as-default", labels.setAsDefault, host.setAsDefault),
    ]),
    compact([
      host.wrapText
        ? submenu(
            "wrap-text",
            labels.wrapText,
            host.wrapText.map((option) =>
              action(`wrap-${option.id}`, option.label, option, {
                checked: option.checked,
              }),
            ),
          )
        : null,
      action("insert-caption", labels.insertCaption, host.insertCaption),
    ]),
    compact([
      host.moreLayoutOptions
        ? action("more-layout-options", labels.moreLayoutOptions, host.moreLayoutOptions)
        : action("size-and-position", labels.sizeAndPosition, host.sizeAndPosition),
    ]),
    ...extraGroups(),
  ];

  function extraGroups(): PointerContextMenuAction[][] {
    return (host.extraGroups ?? []).map((group) =>
      group.filter((entry): entry is PointerContextMenuAction => !("separator" in entry)),
    );
  }

  /**
   * PowerPoint for the desktop's selected-object menu (PowerPoint for Mac
   * 16.86, audit dumps/ppt-ctxmenu-shape.txt; Windows draws the same rows):
   * Cut / Copy / Paste | Edit Text / Edit Points | Group ▸ (Group / Regroup /
   * Ungroup) / Bring to Front ▸ (Bring to Front / Bring Forward) / Send to
   * Back ▸ (Send to Back / Send Backward) / Lock | Hyperlink… | Save as
   * Picture… | View Alt Text… / Set as Default Shape / Size and Position… /
   * Format Shape… | Action Settings… | New Comment. The host's own rows
   * follow. Mac's Reorder Objects (its 3-D layer view) and Translate have no
   * counterpart here.
   */
  function desktopGroups(): PointerContextMenuAction[][] {
    const lock = host.lock
      ? action("lock", labels.lock ?? "Lock", host.lock, {
          // A locked object is not writable, yet Unlock must stay live: the
          // row answers to its own gate only.
          disabled: Boolean(host.lock.disabled),
          disabledReason: host.lock.disabled ? host.lock.disabledReason : undefined,
        })
      : null;
    return [
      compact([
        action("cut", labels.cut, host.cut),
        action("copy", labels.copy, host.copy),
        action("paste", labels.paste, host.paste),
      ]),
      host.connectorType
        ? compact([
            submenu(
              "connector-type",
              labels.connectorType ?? "Connector Type",
              host.connectorType.map((option) =>
                action(`connector-type-${option.id}`, option.label, option, {
                  checked: option.checked,
                }),
              ),
            ),
            action("reroute-connectors", labels.rerouteConnectors ?? "Reroute Connectors", host.rerouteConnectors),
          ])
        : compact([
            action("edit-text", labels.editText, host.editText),
            action("edit-points", labels.editPoints, host.editPoints),
          ]),
      compact([
        submenu("group-menu", labels.group, [
          action("group", labels.group, host.group),
          action("regroup", labels.regroup, host.regroup),
          action("ungroup", labels.ungroup, host.ungroup),
        ]),
        submenu("bring-to-front-menu", labels.bringToFront, [
          action("bring-to-front", labels.bringToFront, host.bringToFront),
          action("bring-forward", labels.bringForward, host.bringForward),
        ]),
        submenu("send-to-back-menu", labels.sendToBack, [
          action("send-to-back", labels.sendToBack, host.sendToBack),
          action("send-backward", labels.sendBackward, host.sendBackward),
        ]),
        lock,
      ]),
      compact([
        action("open-link", host.openLink?.label ?? "Open Hyperlink", host.openLink),
        action("link", labels.link, host.link),
      ]),
      compact([action("save-as-picture", labels.saveAsPicture, host.saveAsPicture)]),
      compact([
        action("edit-alt-text", labels.editAltText, host.editAltText),
        action(
          "set-as-default",
          host.defaultIsLine ? (labels.setAsDefaultLine ?? labels.setAsDefault) : labels.setAsDefault,
          host.setAsDefault,
        ),
        action("size-and-position", labels.sizeAndPosition, host.sizeAndPosition),
        action("format-shape", labels.formatShape, host.formatShape),
      ]),
      compact([
        action("action-settings", labels.actionSettings ?? "Action Settings…", host.actionSettings),
      ]),
      compact([action("new-comment", labels.newComment ?? "New Comment", host.newComment)]),
      ...extraGroups(),
    ];
  }

  const entries: PointerContextMenuEntry[] = [];
  for (const group of groups) {
    if (group.length === 0) continue;
    if (entries.length > 0) {
      entries.push({ id: `separator-${entries.length}`, separator: true });
    }
    entries.push(...group);
  }
  return entries;
}

export function OfficeShapeContextMenu({
  x,
  y,
  onClose,
  testIdPrefix,
  labels,
  host,
  container,
  menuTestId,
  layout,
}: OfficeShapeContextMenuProps) {
  const entries = officeShapeContextMenuEntries({ testIdPrefix, labels, host, layout });
  return (
    <PointerContextMenu
      x={x}
      y={y}
      label={labels.menu}
      entries={entries}
      onClose={onClose}
      testId={menuTestId ?? `${testIdPrefix}-shape-context-menu`}
      container={container}
    />
  );
}

/**
 * The menu's words, from the keys the three editors already carry (the SmartArt
 * menu's Cut / Copy / Paste / Edit Text / Bring to Front / Send to Back / Size
 * and Position, the deck's Bring Forward / Send Backward and Group / Ungroup,
 * Docs' Wrap text and Caption); the rest under `office.shapeContextMenu.*`.
 */
export function useOfficeShapeContextMenuLabels(): OfficeShapeContextMenuLabels {
  const t = useTranslations("console-notebooks");
  return useMemo(
    () => ({
      menu: t("office.shapeContextMenu.menu"),
      cut: t("presentation.smartartContext.menu.cut"),
      copy: t("presentation.smartartContext.menu.copy"),
      paste: t("presentation.smartartContext.menu.paste"),
      editText: t("presentation.smartartContext.menu.editText"),
      editPoints: t("office.shapeContextMenu.editPoints"),
      group: t("presentation.group.group"),
      regroup: t("office.shapeContextMenu.regroup"),
      ungroup: t("presentation.group.ungroup"),
      bringToFront: t("presentation.contextMenu.bringToFront"),
      bringForward: t("presentation.contextMenu.bringForward"),
      sendToBack: t("presentation.contextMenu.sendToBack"),
      sendBackward: t("presentation.contextMenu.sendBackward"),
      link: t("office.shapeContextMenu.link"),
      saveAsPicture: t("office.shapeContextMenu.saveAsPicture"),
      setAsDefault: t("office.shapeContextMenu.setAsDefault"),
      setAsDefaultLine: t("office.shapeContextMenu.setAsDefaultLine"),
      connectorType: t("office.shapeContextMenu.connectorType"),
      rerouteConnectors: t("office.shapeContextMenu.rerouteConnectors"),
      wrapText: t("toolbar.objectWrap"),
      insertCaption: t("toolbar.insertCaption"),
      editAltText: t("presentation.shapeAltText"),
      sizeAndPosition: t("presentation.smartartContext.menu.sizeAndPosition"),
      moreLayoutOptions: t("office.shapeContextMenu.moreLayoutOptions"),
      formatShape: t("office.shapeContextMenu.formatShape"),
      readOnly: t("ai.readOnlyLock"),
      changeShape: t("presentation.changeShape"),
      arrange: t("presentation.contextMenu.arrange"),
      addAnimation: t("presentation.animations.addAnimation"),
      newComment: t("presentation.review.newComment"),
      assignMacro: t("office.shapeContextMenu.assignMacro"),
      actionSettings: t("presentation.desktopMenu.actionSettings"),
      lock: t("presentation.contextMenu.lock"),
    }),
    [t],
  );
}
