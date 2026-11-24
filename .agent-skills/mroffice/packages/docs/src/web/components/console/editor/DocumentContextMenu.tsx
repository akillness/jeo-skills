"use client";


























/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useCallback, useEffect, useState } from "react";
import type { Editor } from "@tiptap/core";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { CellSelection } from "@tiptap/pm/tables";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import {
  PointerContextMenu,
  type PointerContextMenuAction,
  type PointerContextMenuEntry,
} from "@mrnote/core/web/components/ui/PointerContextMenu.tsx";
import { officeContextMenuIcon } from "@mrnote/core/web/components/office-ribbon/officeContextMenuIcons.tsx";
import { formatOfficeShortcut, officeShortcut } from "@mrnote/core/web/lib/office-context-menu.ts";
import {
  isChartNode,
  isPictureNode,
  isShapeNode,
} from "@mrnote/core/web/components/console/editor/native-document/documentObjectNodes.ts";
import type { ImageFloat } from "@mrnote/core/web/components/console/editor/native-document/imageControls.ts";

export type DocumentContextMenuSurface =
  | "text"
  | "table"
  | "picture"
  | "tableOfContents";

export interface DocumentContextMenuAnchor {
  /** Viewport coordinates of the press. */
  readonly x: number;
  readonly y: number;
  readonly surface: DocumentContextMenuSurface;
  /** The document position the menu was opened at (the press, or the
   *  selection's head from the keyboard). */
  readonly pos?: number;
}

export interface DocumentContextMenuTarget {
  readonly surface: DocumentContextMenuSurface;
  /** The picture's or the table of contents' position, or the caret's. */
  readonly pos: number;
  /** A field the press is on (its position): it is selected, as Word
   *  selects a field when its result is clicked. */
  readonly field?: number;
}

/** One command the host lends the menu: run it, or say why it cannot run. */
export interface DocumentContextMenuCommand {
  readonly onSelect: () => void;
  readonly disabled?: boolean;
  readonly disabledReason?: string | null;
}

export interface DocumentContextMenuTableHost {
  readonly insertRowAbove: DocumentContextMenuCommand;
  readonly insertRowBelow: DocumentContextMenuCommand;
  readonly insertColumnLeft: DocumentContextMenuCommand;
  readonly insertColumnRight: DocumentContextMenuCommand;
  readonly deleteRows: DocumentContextMenuCommand;
  readonly deleteColumns: DocumentContextMenuCommand;
  readonly deleteTable: DocumentContextMenuCommand;
  readonly split: DocumentContextMenuCommand;
  /** Listed only while several cells are selected (Word's Merge Cells). */
  readonly mergeCells: DocumentContextMenuCommand | null;
  /** Sort ▸ is omitted when the host has no table sort. */
  readonly sort: {
    readonly ascending: DocumentContextMenuCommand;
    readonly descending: DocumentContextMenuCommand;
  } | null;
  /** Distribute ▸ is omitted when the host has neither command. */
  readonly distribute: {
    readonly rows: DocumentContextMenuCommand;
    readonly columns: DocumentContextMenuCommand;
  } | null;
  readonly select?: {
    readonly cell: DocumentContextMenuCommand;
    readonly row: DocumentContextMenuCommand;
    readonly column: DocumentContextMenuCommand;
    readonly table: DocumentContextMenuCommand;
  };
  readonly deleteCells?: DocumentContextMenuCommand;
  readonly autoFit?: {
    readonly contents: DocumentContextMenuCommand;
    readonly window: DocumentContextMenuCommand;
    readonly fixed: DocumentContextMenuCommand;
  };
  readonly properties?: DocumentContextMenuCommand;
  readonly insertCaption?: DocumentContextMenuCommand;
}

export interface DocumentContextMenuPictureHost {
  readonly changeFromDevice: DocumentContextMenuCommand;
  readonly changeOnline: DocumentContextMenuCommand;
  readonly crop: DocumentContextMenuCommand;
  readonly wrap: {
    /** `null` is In Line with Text. */
    readonly current: ImageFloat | null;
    readonly set: (mode: ImageFloat | null) => void;
    readonly disabled?: boolean;
    /** Word: an imported anchor only goes back In Line with Text from here. */
    readonly floatDisabledReason?: string | null;
  };
  readonly formatPicture: DocumentContextMenuCommand;
  /** Omitted when the host has no Reset Picture. */
  readonly resetPicture: DocumentContextMenuCommand | null;
  readonly insertCaption?: DocumentContextMenuCommand;
  readonly editAltText?: DocumentContextMenuCommand;
  readonly sizeAndPosition?: DocumentContextMenuCommand;
  /** Word's Bring to Front ▸ and Send to Back ▸, on a picture out of line. */
  readonly arrange?: {
    readonly bringToFront: DocumentContextMenuCommand;
    readonly bringForward: DocumentContextMenuCommand;
    readonly sendToBack: DocumentContextMenuCommand;
    readonly sendBackward: DocumentContextMenuCommand;
  } | null;
  readonly saveAsPicture?: DocumentContextMenuCommand;
}

/** A word the proofing check flags under the press: Word's suggestions, then
 *  Ignore All and Add to Dictionary, at the head of the menu. */
export interface DocumentContextMenuSpelling {
  readonly word: string;
  readonly suggestions: readonly string[];
  /** A repeated word: its one suggestion is Delete Repeated Word. */
  readonly repeated: boolean;
  readonly apply: (suggestion: string) => void;
  readonly ignoreAll: () => void;
  /** Null when the word cannot go into the custom dictionary. */
  readonly addToDictionary: (() => void) | null;
}

/** Word's Bullets ▸ / Numbering ▸ and, in a numbered list, its numbering. */
export interface DocumentContextMenuListHost {
  readonly bullets: DocumentContextMenuCommand & { readonly checked: boolean };
  readonly numbering: DocumentContextMenuCommand & { readonly checked: boolean };
  readonly restart: DocumentContextMenuCommand | null;
  readonly continueNumbering: DocumentContextMenuCommand | null;
  readonly setValue: DocumentContextMenuCommand | null;
}

export interface DocumentContextMenuHost {
  readonly writable: boolean;
  readonly selectionEmpty: boolean;
  readonly cut: () => void;
  readonly copy: () => void;
  readonly paste: DocumentContextMenuCommand;
  /** Both omitted when the host has no paste-option commands. */
  readonly pasteTextOnly?: () => void;
  readonly pasteMergeFormatting?: () => void;
  readonly paragraphOptions: DocumentContextMenuCommand;
  readonly insertLink: DocumentContextMenuCommand;
  




  readonly link?: {
    readonly open: DocumentContextMenuCommand;
    readonly remove: DocumentContextMenuCommand;
    readonly edit?: DocumentContextMenuCommand;
    readonly copy?: DocumentContextMenuCommand;
  };
  readonly newComment: DocumentContextMenuCommand;
  readonly font?: DocumentContextMenuCommand;
  readonly list?: DocumentContextMenuListHost;
  readonly spelling?: DocumentContextMenuSpelling | null;
  /** A tracked change under the press: Accept / Reject Change. */
  readonly revision?: {
    readonly accept: DocumentContextMenuCommand;
    readonly reject: DocumentContextMenuCommand;
  } | null;
  /** A comment anchored under the press. */
  readonly comment?: {
    readonly resolved: boolean;
    readonly reply: DocumentContextMenuCommand;
    readonly resolve: DocumentContextMenuCommand;
    readonly remove: DocumentContextMenuCommand;
  } | null;
  readonly table?: DocumentContextMenuTableHost;
  readonly picture?: DocumentContextMenuPictureHost;
  /** Word's Update Field on a table of contents (its Update Table dialog). */
  readonly updateField?: DocumentContextMenuCommand;
  /** A field under the press: Update Field, Edit Field..., Toggle Field Codes. */
  readonly field?: {
    readonly update: DocumentContextMenuCommand;
    readonly edit: DocumentContextMenuCommand;
    readonly toggleCodes: DocumentContextMenuCommand;
  } | null;
}

export interface DocumentContextMenuProps {
  readonly anchor: DocumentContextMenuAnchor;
  readonly onClose: () => void;
  readonly host: DocumentContextMenuHost;
  readonly testIdPrefix?: string;
}

const TABLE_CELL_NODE_NAMES: ReadonlySet<string> = new Set([
  "tableCell",
  "tableHeader",
]);

/** The rows of Word's Wrap Text ▸ for a picture, in Word's order, on the wrap
 *  modes Docs pictures carry (the two floats are Word's Square, left and
 *  right). The labels are the ribbon's own Wrap menu labels. */
const PICTURE_WRAP_MODES: ReadonlyArray<{
  readonly id: string;
  readonly mode: ImageFloat | null;
  readonly labelKey:
    | "toolbar.imageWrapInline"
    | "toolbar.imageWrapLeft"
    | "toolbar.imageWrapRight"
    | "toolbar.objectWrap_topAndBottom"
    | "toolbar.objectLayer_behindText"
    | "toolbar.objectLayer_inFrontOfText";
}> = [
  { id: "inline", mode: null, labelKey: "toolbar.imageWrapInline" },
  { id: "left", mode: "left", labelKey: "toolbar.imageWrapLeft" },
  { id: "right", mode: "right", labelKey: "toolbar.imageWrapRight" },
  {
    id: "topAndBottom",
    mode: "topAndBottom",
    labelKey: "toolbar.objectWrap_topAndBottom",
  },
  {
    id: "behindText",
    mode: "behindText",
    labelKey: "toolbar.objectLayer_behindText",
  },
  {
    id: "inFrontOfText",
    mode: "inFrontOfText",
    labelKey: "toolbar.objectLayer_inFrontOfText",
  },
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * What was right-clicked, from the press's DOM target and coordinates: a
 * picture (its position), a table cell (the caret position inside it) or body
 * text; `null` for a shape, SmartArt or chart, whose shared hosts answer the
 * press themselves, and for a press the view cannot place.
 */
export function resolveDocumentContextMenuTarget(
  view: EditorView,
  event: Pick<MouseEvent, "target" | "clientX" | "clientY">,
): DocumentContextMenuTarget | null {
  const target = event.target;
  if (!(target instanceof Node) || !view.dom.contains(target)) return null;
  if (
    target instanceof Element &&
    target.closest('[data-testid="chart-block"]')
  ) {
    return null;
  }
  const { doc } = view.state;
  let inside: number;
  try {
    inside = clamp(view.posAtDOM(target, 0), 0, doc.content.size);
  } catch {
    return null;
  }
  const $inside = doc.resolve(inside);
  // Every node the press may be on or in: the two neighbours of the DOM
  // position and each open ancestor.
  const candidates = [inside, inside - 1];
  for (let depth = $inside.depth; depth > 0; depth -= 1) {
    candidates.push($inside.before(depth));
  }
  for (const pos of candidates) {
    if (pos < 0 || pos > doc.content.size) continue;
    const node = doc.nodeAt(pos);
    if (node && (isShapeNode(node) || isChartNode(node))) return null;
  }
  // A picture, in either placement, or a table of contents: the press must
  // land in the node's own DOM, so the text beside an inline picture keeps
  // the text menu.
  for (const pos of [inside, inside - 1]) {
    if (pos < 0 || pos >= doc.content.size) continue;
    const node = doc.nodeAt(pos);
    if (!node) continue;
    const surface = isPictureNode(node)
      ? "picture"
      : node.type.name === "tableOfContents"
        ? "tableOfContents"
        : null;
    if (!surface) continue;
    let nodeDom: Node | null = null;
    try {
      nodeDom = view.nodeDOM(pos);
    } catch {
      nodeDom = null;
    }
    if (nodeDom && (nodeDom === target || nodeDom.contains(target))) {
      return { surface, pos };
    }
  }
  // The caret goes where the pointer is when the view can place it (a real
  // browser); otherwise at the DOM position.
  let caret = inside;
  try {
    const atCoords = view.posAtCoords({
      left: event.clientX,
      top: event.clientY,
    });
    if (atCoords && atCoords.inside >= -1) {
      caret = clamp(atCoords.pos, 0, doc.content.size);
    }
  } catch {
    caret = inside;
  }
  let field: number | undefined;
  const fieldDom = target instanceof Element ? target.closest('[data-type="document-field"]') : target.parentElement?.closest('[data-type="document-field"]');
  if (fieldDom && view.dom.contains(fieldDom)) {
    try {
      const at = view.posAtDOM(fieldDom, 0) - 1;
      for (const pos of [at, at + 1]) {
        if (doc.nodeAt(pos)?.type.name === "documentField") field = pos;
      }
    } catch {
      field = undefined;
    }
  }
  const $caret = doc.resolve(caret);
  for (let depth = $caret.depth; depth > 0; depth -= 1) {
    if (TABLE_CELL_NODE_NAMES.has($caret.node(depth).type.name)) {
      return { surface: "table", pos: caret, ...(field !== undefined ? { field } : {}) };
    }
  }
  return { surface: "text", pos: caret, ...(field !== undefined ? { field } : {}) };
}

/**
 * The selection move a right click makes, as Word makes it: a picture or a
 * table of contents is selected; a press inside the current selection (a text range or the cells
 * of a cell selection) keeps it, so Cut / Copy / Merge Cells act on it; a
 * press outside moves the caret there.
 */
export function selectDocumentContextMenuTarget(
  view: EditorView,
  target: DocumentContextMenuTarget,
): void {
  const { doc, selection } = view.state;
  if (target.surface === "picture" || target.surface === "tableOfContents") {
    if (
      selection instanceof NodeSelection &&
      selection.from === target.pos
    ) {
      return;
    }
    view.dispatch(
      view.state.tr.setSelection(NodeSelection.create(doc, target.pos)),
    );
    return;
  }
  if (target.field !== undefined) {
    if (!(selection instanceof NodeSelection && selection.from === target.field)) {
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(doc, target.field)));
    }
    return;
  }
  if (selection instanceof CellSelection) {
    let insideCells = false;
    selection.forEachCell((cell, pos) => {
      if (target.pos >= pos && target.pos <= pos + cell.nodeSize) {
        insideCells = true;
      }
    });
    if (insideCells) return;
  } else if (
    !selection.empty &&
    target.pos >= selection.from &&
    target.pos <= selection.to
  ) {
    return;
  } else if (selection.empty && selection.from === target.pos) {
    return;
  }
  view.dispatch(
    view.state.tr.setSelection(
      TextSelection.near(doc.resolve(target.pos)),
    ),
  );
}

/**
 * Where the keyboard opens the menu (Shift+F10, the Menu key): on the selected
 * picture or table of contents, else at the selection's head, in a table cell
 * as the table menu.
 */
export function documentContextMenuKeyboardAnchor(
  view: EditorView,
): DocumentContextMenuAnchor | null {
  const { selection } = view.state;
  if (selection instanceof NodeSelection) {
    const node = selection.node;
    const surface = isPictureNode(node)
      ? "picture"
      : node.type.name === "tableOfContents"
        ? "tableOfContents"
        : null;
    if (surface) {
      const dom = view.nodeDOM(selection.from);
      const rect = dom instanceof Element ? dom.getBoundingClientRect() : null;
      if (rect) return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, surface, pos: selection.from };
    }
    if (isShapeNode(node) || isChartNode(node)) return null;
  }
  let coords: { left: number; bottom: number };
  try {
    coords = view.coordsAtPos(selection.head);
  } catch {
    // No layout to place the caret by: the editor's own corner.
    const rect = view.dom.getBoundingClientRect();
    coords = { left: rect.left, bottom: rect.top };
  }
  const $head = selection.$head;
  let surface: DocumentContextMenuSurface = "text";
  for (let depth = $head.depth; depth > 0; depth -= 1) {
    if (TABLE_CELL_NODE_NAMES.has($head.node(depth).type.name)) {
      surface = "table";
      break;
    }
  }
  return { x: coords.left, y: coords.bottom, surface, pos: selection.head };
}

/**
 * Registers the editor's right-click listener and owns the open menu's
 * anchor. Bubble phase, so the shape / SmartArt capture host runs first, and
 * a press it or the chart host already answered is left alone.
 *
 * `textless`: the page holds no text to act on (a handwriting document, ink
 * only): its text menu (Paste, Font, Paragraph, Bullets, Link...) is not
 * offered, and a press on its paper -- a pen's or a finger's hold included --
 * moves no caret. Its objects keep their own menu (the shape host).
 */
export function useDocumentContextMenu(
  editor: Editor,
  { textless = false }: { readonly textless?: boolean } = {},
): {
  readonly menu: DocumentContextMenuAnchor | null;
  readonly closeMenu: () => void;
} {
  const [menu, setMenu] = useState<DocumentContextMenuAnchor | null>(null);
  useEffect(() => {
    if (editor.isDestroyed || textless) return;
    const dom = editor.view.dom;
    const onContextMenu = (event: globalThis.MouseEvent) => {
      if (event.defaultPrevented || editor.isDestroyed) return;
      const target = resolveDocumentContextMenuTarget(editor.view, event);
      if (!target) return;
      event.preventDefault();
      selectDocumentContextMenuTarget(editor.view, target);
      setMenu({ x: event.clientX, y: event.clientY, surface: target.surface, pos: target.pos });
    };
    // Shift+F10 and the Menu key open the menu at the selection, as in Word.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || editor.isDestroyed) return;
      const menuKey =
        event.key === "ContextMenu" ||
        (event.key === "F10" && event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey);
      if (!menuKey) return;
      const anchor = documentContextMenuKeyboardAnchor(editor.view);
      if (!anchor) return;
      event.preventDefault();
      setMenu(anchor);
    };
    dom.addEventListener("contextmenu", onContextMenu);
    dom.addEventListener("keydown", onKeyDown);
    return () => {
      dom.removeEventListener("contextmenu", onContextMenu);
      dom.removeEventListener("keydown", onKeyDown);
    };
  }, [editor, textless]);
  const closeMenu = useCallback(() => setMenu(null), []);
  return { menu: textless ? null : menu, closeMenu };
}

export function DocumentContextMenu({
  anchor,
  onClose,
  host,
  testIdPrefix = "document",
}: DocumentContextMenuProps) {
  const t = useTranslations("console-notebooks");
  const id = (suffix: string) => `${testIdPrefix}-context-${suffix}`;
  const command = (
    suffix: string,
    label: string,
    source: DocumentContextMenuCommand,
    extra: Partial<Omit<PointerContextMenuAction, "id" | "label" | "onSelect">> = {},
  ): PointerContextMenuAction => ({
    id: suffix,
    label,
    testId: id(suffix),
    onSelect: source.onSelect,
    disabled: Boolean(source.disabled),
    disabledReason: source.disabledReason ?? undefined,
    ...extra,
  });
  const separator = (suffix: string): PointerContextMenuEntry => ({
    id: `separator-${suffix}`,
    separator: true,
  });
  const readOnlyReason = t("contextMenu.document.readOnly");
  const emptySelectionReason = t("contextMenu.document.nothingSelected");

  // ---- Clipboard: the group every Word menu opens with ----------------------
  const clipboard: PointerContextMenuEntry[] = [
    command(
      "cut",
      t("toolbar.cut"),
      {
        onSelect: host.cut,
        disabled: !host.writable || host.selectionEmpty,
        disabledReason: !host.writable ? readOnlyReason : emptySelectionReason,
      },
      { icon: officeContextMenuIcon("cut"), shortcut: officeShortcut("cut") },
    ),
    command(
      "copy",
      t("toolbar.copy"),
      {
        onSelect: host.copy,
        disabled: host.selectionEmpty,
        disabledReason: emptySelectionReason,
      },
      { icon: officeContextMenuIcon("copy"), shortcut: officeShortcut("copy") },
    ),
    command(
      "paste",
      t("toolbar.paste"),
      {
        onSelect: host.paste.onSelect,
        disabled: !host.writable || host.paste.disabled,
        disabledReason: !host.writable
          ? readOnlyReason
          : host.paste.disabledReason,
      },
      { icon: officeContextMenuIcon("paste"), shortcut: officeShortcut("paste") },
    ),
  ];
  if (host.pasteTextOnly && host.pasteMergeFormatting) {
    clipboard.push(
      command(
        "paste-text-only",
        t("contextMenu.document.pasteTextOnly"),
        {
          onSelect: host.pasteTextOnly,
          disabled: !host.writable || host.paste.disabled,
          disabledReason: !host.writable
            ? readOnlyReason
            : host.paste.disabledReason,
        },
        { icon: officeContextMenuIcon("pasteSpecial") },
      ),
      command(
        "paste-merge-formatting",
        t("contextMenu.document.pasteMergeFormatting"),
        {
          onSelect: host.pasteMergeFormatting,
          disabled: !host.writable || host.paste.disabled,
          disabledReason: !host.writable
            ? readOnlyReason
            : host.paste.disabledReason,
        },
        {
          icon: officeContextMenuIcon("pasteSpecial"),
          shortcut: formatOfficeShortcut("Alt+V"),
        },
      ),
    );
  }

  // ---- Bullets ▸ · Numbering ▸ and, in a numbered list, its numbering -------
  const listGroup = (): PointerContextMenuEntry[] => {
    const list = host.list;
    if (!list) return [];
    const entries: PointerContextMenuEntry[] = [
      command("bullets", t("contextMenu.document.bullets"), list.bullets, {
        icon: officeContextMenuIcon("bullets"),
        checked: list.bullets.checked,
      }),
      command("numbering", t("contextMenu.document.numbering"), list.numbering, {
        icon: officeContextMenuIcon("numbering"),
        checked: list.numbering.checked,
      }),
    ];
    if (list.restart) {
      entries.push(command("list-restart", t("contextMenu.document.restartNumbering"), list.restart));
    }
    if (list.continueNumbering) {
      entries.push(
        command("list-continue", t("contextMenu.document.continueNumbering"), list.continueNumbering),
      );
    }
    if (list.setValue) {
      entries.push(command("list-set-value", t("contextMenu.document.setNumberingValue"), list.setValue));
    }
    return [separator("lists"), ...entries];
  };

  // ---- Word's spelling suggestions, at the head of the menu ------------------
  const spellingGroup = (): PointerContextMenuEntry[] => {
    const spelling = host.spelling;
    if (!spelling) return [];
    const suggestions: PointerContextMenuEntry[] = spelling.repeated
      ? [
          command(
            "spelling-delete-repeated",
            t("contextMenu.document.deleteRepeatedWord"),
            { onSelect: () => spelling.apply(""), disabled: !host.writable, disabledReason: readOnlyReason },
          ),
        ]
      : spelling.suggestions.length
        ? spelling.suggestions.map((suggestion, index) =>
            command(
              `spelling-suggestion-${index}`,
              suggestion,
              { onSelect: () => spelling.apply(suggestion), disabled: !host.writable, disabledReason: readOnlyReason },
            ),
          )
        : [
            command("spelling-none", t("contextMenu.document.noSpellingSuggestions"), {
              onSelect: () => undefined,
              disabled: true,
            }),
          ];
    return [
      ...suggestions,
      separator("spelling"),
      command("spelling-ignore-all", t("contextMenu.document.ignoreAll"), { onSelect: spelling.ignoreAll }),
      ...(spelling.addToDictionary && !spelling.repeated
        ? [
            command("spelling-add", t("contextMenu.document.addToDictionary"), {
              onSelect: spelling.addToDictionary,
            }),
          ]
        : []),
      separator("after-spelling"),
    ];
  };

  // ---- A tracked change and a comment under the press -----------------------
  const reviewGroup = (): PointerContextMenuEntry[] => {
    const entries: PointerContextMenuEntry[] = [];
    if (host.revision) {
      entries.push(
        command("revision-accept", t("contextMenu.document.acceptChange"), host.revision.accept, {
          icon: officeContextMenuIcon("showChanges"),
        }),
        command("revision-reject", t("contextMenu.document.rejectChange"), host.revision.reject, {
          icon: officeContextMenuIcon("delete"),
        }),
      );
    }
    if (host.comment) {
      entries.push(
        command("comment-reply", t("contextMenu.document.replyToComment"), host.comment.reply, {
          icon: officeContextMenuIcon("newComment"),
        }),
        command(
          "comment-resolve",
          host.comment.resolved
            ? t("contextMenu.document.reopenComment")
            : t("contextMenu.document.resolveComment"),
          host.comment.resolve,
        ),
        command("comment-delete", t("contextMenu.document.deleteComment"), host.comment.remove, {
          icon: officeContextMenuIcon("delete"),
        }),
      );
    }
    return entries.length ? [separator("review"), ...entries] : [];
  };

  // ---- Paragraph Options | Link ▸ · New Comment (text and table) ------------
  const paragraphAndLinks = (): PointerContextMenuEntry[] => [
    ...(host.font
      ? [
          command("font", t("contextMenu.document.font"), host.font, {
            icon: officeContextMenuIcon("font"),
            shortcut: formatOfficeShortcut("Mod+D"),
          }),
        ]
      : []),
    command(
      "paragraph-options",
      t("contextMenu.document.paragraphOptions"),
      host.paragraphOptions,
      { icon: officeContextMenuIcon("paragraph") },
    ),
    ...listGroup(),
    separator("links"),
    {
      id: "link",
      label: t("contextMenu.document.link"),
      testId: id("link"),
      icon: officeContextMenuIcon("link"),
      onSelect: () => undefined,
      submenu: [
        ...(host.link
          ? [
              command(
                "link-open",
                t("spreadsheet.contextMenu.openHyperlink"),
                host.link.open,
                { icon: officeContextMenuIcon("link") },
              ),
            ]
          : []),
        ...(host.link?.edit
          ? [
              command("link-edit", t("contextMenu.document.editLink"), host.link.edit, {
                icon: officeContextMenuIcon("link"),
                shortcut: officeShortcut("link"),
              }),
            ]
          : [
              command(
                "link-insert",
                t("toolbar.insertLink"),
                host.insertLink,
                {
                  icon: officeContextMenuIcon("link"),
                  shortcut: officeShortcut("link"),
                },
              ),
            ]),
        ...(host.link?.copy
          ? [
              command("link-copy", t("contextMenu.document.copyLink"), host.link.copy, {
                icon: officeContextMenuIcon("copyLink"),
              }),
            ]
          : []),
        ...(host.link
          ? [command("link-remove", t("toolbar.unlink"), host.link.remove)]
          : []),
      ],
    },
    newComment(),
  ];
  const newComment = (): PointerContextMenuAction =>
    command(
      "new-comment",
      t("contextMenu.document.newComment"),
      host.newComment,
      { icon: officeContextMenuIcon("newComment") },
    );

  // ---- Table: Insert ▸ · Delete ▸ · Split [· Merge Cells] · Sort ▸ · Distribute ▸
  const tableGroup = (table: DocumentContextMenuTableHost): PointerContextMenuEntry[] => {
    const entries: PointerContextMenuEntry[] = [
      {
        id: "table-insert",
        label: t("contextMenu.document.insert"),
        testId: id("table-insert"),
        icon: officeContextMenuIcon("insert"),
        onSelect: () => undefined,
        submenu: [
          command(
            "table-insert-row-above",
            t("contextMenu.document.insertRowAbove"),
            table.insertRowAbove,
            { icon: officeContextMenuIcon("insertRows") },
          ),
          command(
            "table-insert-row-below",
            t("contextMenu.document.insertRowBelow"),
            table.insertRowBelow,
            { icon: officeContextMenuIcon("insertRows") },
          ),
          command(
            "table-insert-column-left",
            t("contextMenu.document.insertColumnLeft"),
            table.insertColumnLeft,
            { icon: officeContextMenuIcon("insertColumns") },
          ),
          command(
            "table-insert-column-right",
            t("contextMenu.document.insertColumnRight"),
            table.insertColumnRight,
            { icon: officeContextMenuIcon("insertColumns") },
          ),
        ],
      },
      {
        id: "table-delete",
        label: t("contextMenu.document.delete"),
        testId: id("table-delete"),
        icon: officeContextMenuIcon("delete"),
        onSelect: () => undefined,
        submenu: [
          command(
            "table-delete-rows",
            t("contextMenu.document.deleteRows"),
            table.deleteRows,
            { icon: officeContextMenuIcon("insertRows") },
          ),
          command(
            "table-delete-columns",
            t("contextMenu.document.deleteColumns"),
            table.deleteColumns,
            { icon: officeContextMenuIcon("insertColumns") },
          ),
          command(
            "table-delete-table",
            t("contextMenu.document.deleteTable"),
            table.deleteTable,
            { icon: officeContextMenuIcon("table") },
          ),
          ...(table.deleteCells
            ? [command("table-delete-cells", t("contextMenu.document.deleteCells"), table.deleteCells)]
            : []),
        ],
      },
      command("table-split", t("contextMenu.document.split"), table.split, {
        icon: officeContextMenuIcon("splitCells"),
      }),
    ];
    if (table.select) {
      entries.unshift({
        id: "table-select",
        label: t("contextMenu.document.select"),
        testId: id("table-select"),
        icon: officeContextMenuIcon("table"),
        onSelect: () => undefined,
        submenu: [
          command("table-select-cell", t("toolbar.tableSelectCell"), table.select.cell),
          command("table-select-row", t("toolbar.tableSelectRow"), table.select.row),
          command("table-select-column", t("toolbar.tableSelectColumn"), table.select.column),
          command("table-select-table", t("toolbar.tableSelectTable"), table.select.table),
        ],
      });
    }
    if (table.mergeCells) {
      entries.push(
        command(
          "table-merge",
          t("contextMenu.document.mergeCells"),
          table.mergeCells,
          { icon: officeContextMenuIcon("mergeCells") },
        ),
      );
    }
    if (table.sort) {
      entries.push({
        id: "table-sort",
        label: t("contextMenu.document.sort"),
        testId: id("table-sort"),
        icon: officeContextMenuIcon("sort"),
        onSelect: () => undefined,
        submenu: [
          command(
            "table-sort-ascending",
            t("contextMenu.document.sortAscending"),
            table.sort.ascending,
            { icon: officeContextMenuIcon("sortAscending") },
          ),
          command(
            "table-sort-descending",
            t("contextMenu.document.sortDescending"),
            table.sort.descending,
            { icon: officeContextMenuIcon("sortDescending") },
          ),
        ],
      });
    }
    if (table.autoFit) {
      entries.push({
        id: "table-autofit",
        label: t("toolbar.autoFit"),
        testId: id("table-autofit"),
        icon: officeContextMenuIcon("columnWidth"),
        onSelect: () => undefined,
        submenu: [
          command("table-autofit-contents", t("toolbar.autoFitContents"), table.autoFit.contents),
          command("table-autofit-window", t("toolbar.autoFitWindow"), table.autoFit.window),
          command("table-autofit-fixed", t("toolbar.autoFitFixed"), table.autoFit.fixed),
        ],
      });
    }
    if (table.distribute) {
      entries.push({
        id: "table-distribute",
        label: t("contextMenu.document.distribute"),
        testId: id("table-distribute"),
        icon: officeContextMenuIcon("tableProperties"),
        onSelect: () => undefined,
        submenu: [
          command(
            "table-distribute-rows",
            t("contextMenu.document.distributeRows"),
            table.distribute.rows,
            { icon: officeContextMenuIcon("rowHeight") },
          ),
          command(
            "table-distribute-columns",
            t("contextMenu.document.distributeColumns"),
            table.distribute.columns,
            { icon: officeContextMenuIcon("columnWidth") },
          ),
        ],
      });
    }
    if (table.insertCaption) {
      entries.push(
        command("table-insert-caption", t("contextMenu.document.insertCaption"), table.insertCaption),
      );
    }
    if (table.properties) {
      entries.push(
        command("table-properties", t("toolbar.tableProperties"), table.properties, {
          icon: officeContextMenuIcon("tableProperties"),
        }),
      );
    }
    return entries;
  };

  // ---- Picture: Change Picture ▸ · Crop · Wrap Text ▸ · Format Picture · Reset Picture
  const pictureGroup = (
    picture: DocumentContextMenuPictureHost,
  ): PointerContextMenuEntry[] => {
    const entries: PointerContextMenuEntry[] = [
      {
        id: "picture-change",
        label: t("contextMenu.document.changePicture"),
        testId: id("picture-change"),
        icon: officeContextMenuIcon("picture"),
        onSelect: () => undefined,
        submenu: [
          command(
            "picture-change-from-device",
            t("contextMenu.document.fromThisDevice"),
            picture.changeFromDevice,
            { icon: officeContextMenuIcon("picture") },
          ),
          command(
            "picture-change-online",
            t("contextMenu.document.onlinePictures"),
            picture.changeOnline,
            { icon: officeContextMenuIcon("search") },
          ),
        ],
      },
      command("picture-crop", t("contextMenu.document.crop"), picture.crop, {
        icon: officeContextMenuIcon("crop"),
      }),
      {
        id: "picture-wrap",
        label: t("contextMenu.document.wrapText"),
        testId: id("picture-wrap"),
        icon: officeContextMenuIcon("wrapText"),
        onSelect: () => undefined,
        submenu: PICTURE_WRAP_MODES.map((option) => {
          const floatRefused =
            option.mode !== null && Boolean(picture.wrap.floatDisabledReason);
          return {
            id: `picture-wrap-${option.id}`,
            label: t(option.labelKey),
            testId: id(`picture-wrap-${option.id}`),
            icon: officeContextMenuIcon("wrapText"),
            checked: picture.wrap.current === option.mode,
            disabled: !host.writable || picture.wrap.disabled || floatRefused,
            disabledReason: !host.writable
              ? readOnlyReason
              : floatRefused
                ? (picture.wrap.floatDisabledReason ?? undefined)
                : undefined,
            onSelect: () => picture.wrap.set(option.mode),
          } satisfies PointerContextMenuAction;
        }),
      },
      command(
        "picture-format",
        t("contextMenu.document.formatPicture"),
        picture.formatPicture,
        { icon: officeContextMenuIcon("formatObject") },
      ),
    ];
    if (picture.resetPicture) {
      entries.push(
        command(
          "picture-reset",
          t("contextMenu.document.resetPicture"),
          picture.resetPicture,
          { icon: officeContextMenuIcon("clear") },
        ),
      );
    }
    if (picture.arrange) {
      const arrange = picture.arrange;
      entries.push(
        {
          id: "picture-bring-to-front",
          label: t("presentation.contextMenu.bringToFront"),
          testId: id("picture-bring-to-front"),
          icon: officeContextMenuIcon("bringForward"),
          onSelect: () => undefined,
          submenu: [
            command("picture-front", t("presentation.contextMenu.bringToFront"), arrange.bringToFront),
            command("picture-forward", t("presentation.contextMenu.bringForward"), arrange.bringForward),
          ],
        },
        {
          id: "picture-send-to-back",
          label: t("presentation.contextMenu.sendToBack"),
          testId: id("picture-send-to-back"),
          icon: officeContextMenuIcon("sendBackward"),
          onSelect: () => undefined,
          submenu: [
            command("picture-back", t("presentation.contextMenu.sendToBack"), arrange.sendToBack),
            command("picture-backward", t("presentation.contextMenu.sendBackward"), arrange.sendBackward),
          ],
        },
      );
    }
    const extras: PointerContextMenuEntry[] = [];
    if (picture.saveAsPicture) {
      extras.push(command("picture-save", t("contextMenu.document.saveAsPicture"), picture.saveAsPicture, {
        icon: officeContextMenuIcon("picture"),
      }));
    }
    if (picture.insertCaption) {
      extras.push(command("picture-insert-caption", t("contextMenu.document.insertCaption"), picture.insertCaption));
    }
    if (picture.editAltText) {
      extras.push(command("picture-alt-text", t("contextMenu.document.editAltText"), picture.editAltText, {
        icon: officeContextMenuIcon("altText"),
      }));
    }
    if (picture.sizeAndPosition) {
      extras.push(command("picture-size-position", t("contextMenu.document.sizeAndPosition"), picture.sizeAndPosition, {
        icon: officeContextMenuIcon("layout"),
      }));
    }
    if (extras.length) entries.push(separator("picture-extras"), ...extras);
    return entries;
  };

  // ---- Update Field · Edit Field... · Toggle Field Codes ---------------------
  const fieldGroup = (): PointerContextMenuEntry[] => {
    const field = host.field;
    if (!field) return [];
    return [
      separator("field"),
      command("field-update", t("contextMenu.document.updateField"), field.update, {
        icon: officeContextMenuIcon("updateField"),
        shortcut: "F9",
      }),
      command("field-edit", t("contextMenu.document.editField"), field.edit),
      command("field-toggle-codes", t("contextMenu.document.toggleFieldCodes"), field.toggleCodes, {
        shortcut: formatOfficeShortcut("Shift+F9"),
      }),
    ];
  };

  let entries: PointerContextMenuEntry[];
  const head = [...spellingGroup(), ...clipboard, ...fieldGroup(), ...reviewGroup()];
  if (anchor.surface === "picture" && host.picture) {
    entries = [
      ...clipboard,
      separator("picture"),
      ...pictureGroup(host.picture),
      separator("comment"),
      newComment(),
    ];
  } else if (anchor.surface === "table" && host.table) {
    entries = [
      ...head,
      separator("table"),
      ...tableGroup(host.table),
      separator("paragraph"),
      ...paragraphAndLinks(),
    ];
  } else if (anchor.surface === "tableOfContents" && host.updateField) {
    entries = [
      ...head,
      separator("field"),
      command(
        "update-field",
        t("contextMenu.document.updateField"),
        host.updateField,
        { icon: officeContextMenuIcon("updateField") },
      ),
      separator("paragraph"),
      ...paragraphAndLinks(),
    ];
  } else {
    entries = [...head, separator("paragraph"), ...paragraphAndLinks()];
  }

  return (
    <PointerContextMenu
      x={anchor.x}
      y={anchor.y}
      label={t("contextMenu.document.menu")}
      entries={entries}
      onClose={onClose}
      testId={id("menu")}
    />
  );
}

export default DocumentContextMenu;
