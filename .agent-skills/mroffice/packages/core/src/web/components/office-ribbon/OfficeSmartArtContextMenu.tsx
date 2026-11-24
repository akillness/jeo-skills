"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The SmartArt right-click menus — ONE module, mounted by every editor.
 *
 * Word, Excel and PowerPoint answer a right click inside a SmartArt graphic
 * with one of three menus, and MRAI's three editors show the same three,
 * built on the shared {@link PointerContextMenu}. Their entries follow
 * Microsoft's Office Fluent UI command identifiers (Microsoft 365 Current
 * Channel, `wordcontrols` / `excelcontrols` / `powerpointcontrols`):
 *
 * - the GRAPHIC (`ContextMenuSmartArtBackground`, a right click on the
 *   graphic's border or background): Cut / Copy / Paste, Change Layout…,
 *   Show Text Pane, Bring to Front / Send to Back, Alt Text, Reset Graphic,
 *   Convert to Text (PowerPoint) and Convert to Shapes (PowerPoint, Excel),
 *   Size and Position…, Format Object…;
 * - one SHAPE (`ContextMenuSmartArtEditSmartArt`, a right click on a shape):
 *   Cut / Copy / Paste, Edit Text, Add Shape ▸ (After, Before, Above, Below,
 *   Add Assistant), Change Picture (a picture shape), Size and Position…,
 *   Format Shape…;
 * - the Text Pane (`ContextMenuSmartArtContentPane`): Cut / Copy, Promote,
 *   Demote, Move Up, Move Down — drawn by `OfficeSmartArtTextPane` from
 *   {@link officeSmartArtTextPaneMenuEntries}.
 *
 * Promote / Demote / Move Up / Move Down live on the Design tab and in the
 * Text Pane's menu, not on either canvas menu, and Right to Left on the tab
 * alone, exactly as in Office.
 *
 * The canvas menus read the SAME objects the SmartArt Design tab reads
 * ({@link OfficeSmartArtDesignTabDiagram} / {@link OfficeSmartArtDesignTabPreserved}),
 * so a command is offered in a menu exactly when the tab offers it and runs
 * through the same callback. What only the host knows — its clipboard, text
 * editing, z-order, Format pane and how it opens the Change Layout gallery —
 * arrives through {@link OfficeSmartArtContextMenuHost}; an absent callback
 * means the host has no such command, and the entry is not drawn.
 *
 * Host differences follow Microsoft's documentation: the Convert entries are
 * drawn only when the host passes them on the diagram (Word has neither).
 */

import {
  PointerContextMenu,
  type PointerContextMenuAction,
  type PointerContextMenuEntry,
} from "../ui/PointerContextMenu";
import {
  officeSmartArtAddShapeEntries,
  officeSmartArtAssistantReason,
  type OfficeSmartArtDesignTabDiagram,
  type OfficeSmartArtDesignTabLabels,
  type OfficeSmartArtDesignTabPreserved,
} from "./OfficeSmartArtDesignTab";
import { SMARTART_NO_OUTLINE_COMMANDS } from "../../lib/office-smartart/design-model";
import { officeShortcut } from "../../lib/office-context-menu";
import {
  officeContextMenuIcon,
  type OfficeContextMenuIconName,
} from "./officeContextMenuIcons";

/** The glyph each row draws in the icon column, as Office on the web does. */
const ICONS: Record<string, OfficeContextMenuIconName> = {
  cut: "cut",
  copy: "copy",
  paste: "paste",
  "edit-text": "font",
  "add-shape": "insert",
  "change-picture": "changePicture",
  "reset-shape": "formatObject",
  "change-layout": "layout",
  "text-pane": "paragraph",
  "bring-to-front": "bringForward",
  "send-to-back": "sendBackward",
  "alt-text": "altText",
  reset: "formatObject",
  "convert-to-text": "font",
  "convert-to-shapes": "changeShape",
  "size-and-position": "formatObject",
  "format-object": "formatObject",
};

/** The shortcut text Office on the web prints beside a row. */
const SHORTCUTS: Record<string, () => string> = {
  cut: () => officeShortcut("cut"),
  copy: () => officeShortcut("copy"),
  paste: () => officeShortcut("paste"),
};

function dressed(key: string): Partial<Action> {
  return {
    ...(ICONS[key] ? { icon: officeContextMenuIcon(ICONS[key]) } : {}),
    ...(SHORTCUTS[key] ? { shortcut: SHORTCUTS[key]() } : {}),
  };
}

/** The menu's own words (the command words come from the Design tab's labels). */
export interface OfficeSmartArtContextMenuLabels {
  menu: string;
  cut: string;
  copy: string;
  paste: string;
  editText: string;
  changeLayout: string;
  showTextPane: string;
  hideTextPane: string;
  bringToFront: string;
  sendToBack: string;
  sizeAndPosition: string;
  formatObject: string;
  /** The shape menu's Format Shape… (Office's `ObjectFormatDialog` there). */
  formatShape?: string;
  /** A picture shape's Change Picture (Office's Change Graphic ▸ From a File). */
  changePicture?: string;
  /** The shape menu's Reset Shape. */
  resetShape?: string;
  /** Why an imported diagram's structure cannot change from here. */
  nativeStructureUnavailable: string;
}

/**
 * Which of Office's two canvas menus: the GRAPHIC's (a right click on its
 * border or background) or one SHAPE's (a right click on a shape of it).
 */
export type OfficeSmartArtContextMenuTarget = "graphic" | "shape";

/** What only the host can do. Each absent callback hides its entry. */
export interface OfficeSmartArtContextMenuHost {
  writable: boolean;
  onCut?: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
  canPaste?: boolean;
  onEditText?: () => void;
  /** Why Edit Text is refused, already translated; present disables it. */
  editTextBlockedReason?: string | null;
  /** Open the SmartArt Design tab's layout gallery (Office's Change Layout…). */
  onChangeLayout?: () => void;
  onBringToFront?: () => void;
  onSendToBack?: () => void;
  onSizeAndPosition?: () => void;
  onFormatObject?: () => void;
  /** The right-clicked shape is a picture slot: replace its picture. */
  onChangePicture?: () => void;
  /** Reset Shape: the pressed shape loses its own paint, move and resize. */
  onResetShape?: () => void;
}

export interface OfficeSmartArtContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  /** `"presentation"` → `presentation-smartart-context-…`, and so on. */
  testIdPrefix: string;
  labels: OfficeSmartArtContextMenuLabels;
  designLabels: OfficeSmartArtDesignTabLabels;
  diagram: OfficeSmartArtDesignTabDiagram | null;
  preserved: OfficeSmartArtDesignTabPreserved | null;
  host: OfficeSmartArtContextMenuHost;
  /** The graphic's menu (default) or one shape's. */
  target?: OfficeSmartArtContextMenuTarget;
  container?: HTMLElement | null;
}

type Action = PointerContextMenuAction;

/**
 * The menu's entries, in Office's order. Exported so a host whose own menu
 * already exists can splice the same list into it instead of drawing a second
 * menu.
 */
export function officeSmartArtContextMenuEntries({
  testIdPrefix,
  labels,
  designLabels,
  diagram,
  preserved,
  host,
  target = "graphic",
}: Omit<OfficeSmartArtContextMenuProps, "x" | "y" | "onClose" | "container">):
  PointerContextMenuEntry[] {
  const id = (suffix: string) => `${testIdPrefix}-smartart-context-${suffix}`;
  const readOnly = !host.writable;
  const groups: Action[][] = [];
  const action = (
    key: string,
    label: string | undefined,
    onSelect: (() => void) | undefined,
    options: Partial<Action> = {},
  ): Action | null =>
    onSelect && label
      ? { id: key, label, onSelect, testId: id(key), ...dressed(key), ...options }
      : null;
  const compact = (list: (Action | null)[]) =>
    list.filter((entry): entry is Action => entry !== null);

  groups.push(
    compact([
      action("cut", labels.cut, host.onCut, { disabled: readOnly }),
      action("copy", labels.copy, host.onCopy),
      action("paste", labels.paste, host.onPaste, {
        disabled: readOnly || host.canPaste === false,
      }),
    ]),
  );

  if (target === "shape") {
    // `ContextMenuSmartArtEditSmartArt`: one shape of the graphic.
    groups.push(
      compact([
        action("edit-text", labels.editText, host.onEditText, {
          disabled: readOnly || Boolean(host.editTextBlockedReason),
          disabledReason: host.editTextBlockedReason ?? undefined,
        }),
      ]),
    );
    const adding: (Action | null)[] = [];
    if (diagram?.onAddShape) {
      const commands = diagram.commands ?? SMARTART_NO_OUTLINE_COMMANDS;
      const writable = diagram.writable && !readOnly;
      const assistantEnabled = writable && commands.addAssistant;
      const assistantReason = officeSmartArtAssistantReason(
        designLabels,
        diagram.kind,
        assistantEnabled,
        diagram.selectedIsAssistant === true,
        writable ? designLabels.commandUnavailableReason : designLabels.readOnlyReason,
      );
      adding.push({
        id: "add-shape",
        label: designLabels.addShape,
        testId: id("add-shape"),
        ...dressed("add-shape"),
        disabled: !writable,
        onSelect: () => undefined,
        submenu: [
          ...officeSmartArtAddShapeEntries(designLabels, commands).map(
            (entry): Action => ({
              id: `add-shape-${entry.position}`,
              label: entry.label,
              testId: id(`add-shape-${entry.position}`),
              disabled: !entry.enabled,
              onSelect: () => diagram.onAddShape?.(entry.position),
            }),
          ),
          {
            id: "add-assistant",
            label: designLabels.addAssistant ?? "",
            testId: id("add-assistant"),
            disabled: !assistantEnabled,
            disabledReason: assistantReason,
            onSelect: () => diagram.onAddShape?.("assistant"),
          },
        ],
      });
    } else if (!diagram && preserved) {
      // An imported diagram MRAI does not own: Add Shape runs only where the
      // host edits it in place (the deck's native receipt); elsewhere it is
      // shown and refused with the reason, as the tab's is.
      const native = preserved.nativeEditing;
      adding.push(
        action("add-shape", designLabels.addShape, preserved.onAddShape, {
          disabled: readOnly || !native || !preserved.canAdd,
          disabledReason: native ? undefined : labels.nativeStructureUnavailable,
        }),
      );
    }
    groups.push(compact(adding));
    groups.push(
      compact([
        action("change-picture", labels.changePicture, host.onChangePicture, {
          disabled: readOnly || !(diagram?.writable ?? preserved?.writable),
        }),
        // Office's Reset Shape sits between Change Graphic and Position.
        action("reset-shape", labels.resetShape, diagram ? host.onResetShape : undefined, {
          disabled: readOnly || !diagram?.writable,
        }),
      ]),
    );
    groups.push(
      compact([
        action("size-and-position", labels.sizeAndPosition, host.onSizeAndPosition),
        action(
          "format-object",
          labels.formatShape ?? labels.formatObject,
          host.onFormatObject,
        ),
      ]),
    );
  } else {
    // `ContextMenuSmartArtBackground`: the graphic itself.
    const graphic: (Action | null)[] = [
      action("change-layout", labels.changeLayout, host.onChangeLayout, {
        disabled: readOnly || (diagram ? !diagram.writable : !preserved?.writable),
      }),
    ];
    if (diagram) {
      graphic.push(
        action(
          "text-pane",
          diagram.textPaneOpen ? labels.hideTextPane : labels.showTextPane,
          diagram.onToggleTextPane,
          { disabled: !diagram.hasOutline },
        ),
      );
    } else if (preserved?.nativeEditing) {
      graphic.push(
        action(
          "text-pane",
          preserved.textPaneOpen ? labels.hideTextPane : labels.showTextPane,
          preserved.onToggleTextPane,
        ),
      );
    }
    groups.push(compact(graphic));
    groups.push(
      compact([
        action("bring-to-front", labels.bringToFront, host.onBringToFront, {
          disabled: readOnly,
        }),
        action("send-to-back", labels.sendToBack, host.onSendToBack, {
          disabled: readOnly,
        }),
      ]),
    );
    groups.push(
      compact([
        diagram
          ? action("alt-text", designLabels.altText, () => diagram.onAltText(null), {
              disabled: readOnly || !diagram.writable,
            })
          : null,
      ]),
    );
    if (diagram) {
      groups.push(
        compact([
          action("reset", designLabels.resetGraphic, diagram.onReset, {
            disabled: readOnly || !diagram.writable,
          }),
          action("convert-to-text", designLabels.convertToText, diagram.onConvertToText, {
            disabled: readOnly || !diagram.writable,
          }),
          action(
            "convert-to-shapes",
            designLabels.convertToShapes,
            diagram.onConvertToShapes,
            { disabled: readOnly || !diagram.writable },
          ),
        ]),
      );
    }
    groups.push(
      compact([
        action("size-and-position", labels.sizeAndPosition, host.onSizeAndPosition),
        action("format-object", labels.formatObject, host.onFormatObject),
      ]),
    );
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

/** The Text Pane menu's own words; the verbs are the pane toolbar's. */
export interface OfficeSmartArtTextPaneMenuLabels {
  menu: string;
  cut: string;
  copy: string;
  promote: string;
  demote: string;
  moveUp: string;
  moveDown: string;
}

/**
 * `ContextMenuSmartArtContentPane`: a right click in the Text Pane. Office
 * offers the clipboard and the four outline verbs there; Paste is left to
 * Ctrl+V, because a page cannot read the clipboard from a menu without a
 * browser prompt (the Docs canvas menu makes the same call).
 */
export function officeSmartArtTextPaneMenuEntries({
  testIdPrefix,
  labels,
  readOnly,
  hasSelection,
  onCut,
  onCopy,
  onPromote,
  onDemote,
  onMoveUp,
  onMoveDown,
}: {
  testIdPrefix: string;
  labels: OfficeSmartArtTextPaneMenuLabels;
  readOnly: boolean;
  hasSelection: boolean;
  onCut: () => void;
  onCopy: () => void;
  onPromote: (() => void) | null;
  onDemote: (() => void) | null;
  onMoveUp: (() => void) | null;
  onMoveDown: (() => void) | null;
}): PointerContextMenuEntry[] {
  const id = (suffix: string) => `${testIdPrefix}-smartart-text-pane-menu-${suffix}`;
  const verb = (key: string, label: string, run: (() => void) | null): Action => ({
    id: key,
    label,
    testId: id(key),
    disabled: readOnly || !run,
    onSelect: () => run?.(),
  });
  return [
    {
      id: "cut",
      label: labels.cut,
      testId: id("cut"),
      ...dressed("cut"),
      disabled: readOnly || !hasSelection,
      onSelect: onCut,
    },
    {
      id: "copy",
      label: labels.copy,
      testId: id("copy"),
      ...dressed("copy"),
      disabled: !hasSelection,
      onSelect: onCopy,
    },
    { id: "separator-verbs", separator: true },
    verb("promote", labels.promote, onPromote),
    verb("demote", labels.demote, onDemote),
    verb("move-up", labels.moveUp, onMoveUp),
    verb("move-down", labels.moveDown, onMoveDown),
  ];
}

export function OfficeSmartArtContextMenu(props: OfficeSmartArtContextMenuProps) {
  const { x, y, onClose, container, testIdPrefix, labels } = props;
  return (
    <PointerContextMenu
      x={x}
      y={y}
      label={labels.menu}
      entries={officeSmartArtContextMenuEntries(props)}
      onClose={onClose}
      testId={`${testIdPrefix}-smartart-context-menu`}
      container={container}
    />
  );
}

/**
 * Change Layout… in every host: bring the SmartArt Design tab up (the host
 * does that) and then open its layout gallery, which is the shared tab's own
 * overflow menu. Runs on the next frame so the tab the host just activated has
 * rendered.
 */
export function openOfficeSmartArtLayoutGallery(testIdPrefix: string): void {
  const open = () => {
    // An authored diagram's Change Layout gallery, or — for an imported one —
    // the Convert to Editable gallery, which is where its layout is picked.
    const trigger =
      document.querySelector<HTMLElement>(
        `[data-testid="${testIdPrefix}-smartart-layout-gallery-more"]`,
      ) ??
      document.querySelector<HTMLElement>(
        `[data-testid="${testIdPrefix}-smartart-convert-native"]`,
      );
    if (!trigger) return false;
    trigger.focus({ preventScroll: true });
    trigger.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    return true;
  };
  requestAnimationFrame(() => {
    if (!open()) requestAnimationFrame(() => void open());
  });
}
