"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { useTranslations } from "../../../../../host/next-intl";
import {
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown, RefreshCw } from "../../../office-ribbon/icons/houseIcons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "../../../ui/dropdown-menu";
import { DocsHomeIcon } from "../DocumentHomeRibbonIcons";
import { DocumentTocGalleryMenu } from "./DocumentTocDialogs";
import { requestTocControl } from "./tocControlRequests";

/** Marks the tab, so the node view lets its pointer and keys through. */
export const TOC_CONTROL_TAB_ATTR = "data-toc-control-tab";

/** The page surface layer the tab floats in: the one the header and footer
 * hit strips (.sheet-band-edit-layer) share. */
const TAB_HOST_SELECTOR = ".note-editor-content-columns";

/**
 * The tab Word hangs on the top-left corner of a table of contents while the
 * selection is in it (the gallery block's content control): the gallery
 * drop-down, the same gallery the References tab opens, and "Update
 * Table...", the same Update Table dialog. It never prints and takes no room
 * in the page.
 *
 * On a page the tab floats in the page surface's own layer, over the header
 * and footer hit strips: a table at the top of a page puts its tab in the
 * header margin, and drawn inside the sheet (a stacking context of its own)
 * the strips took every press on it and opened the header instead. It is
 * drawn there only while the table is `active` (selected, or an entry being
 * typed into), following the table each frame. With no page surface (an
 * unpaged view) it stays in the table, shown by the same state (CSS).
 */
export function TocControlTab({
  editor,
  getPos,
  active,
}: {
  readonly editor: Editor;
  readonly getPos: () => number | undefined;
  readonly active: boolean;
}) {
  const t = useTranslations("console-notebooks");
  const anchorRef = useRef<HTMLDivElement>(null);
  const [floating, setFloating] = useState<{
    host: HTMLElement;
    left: number;
    top: number;
  } | null>(null);
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const host = active ? anchor?.closest<HTMLElement>(TAB_HOST_SELECTOR) ?? null : null;
    if (!anchor || !host) {
      setFloating(null);
      return;
    }
    let frame = 0;
    let last = "";
    const follow = () => {
      const at = anchor.getBoundingClientRect();
      const box = host.getBoundingClientRect();
      // A zoomed page scales the surface: place in its own pixels.
      const scale = host.offsetWidth > 0 ? box.width / host.offsetWidth : 1;
      const left = (at.left - box.left) / (scale || 1);
      const top = (at.top - box.top) / (scale || 1);
      const key = `${left.toFixed(1)}:${top.toFixed(1)}`;
      if (key !== last) {
        last = key;
        setFloating({ host, left, top });
      }
      frame = requestAnimationFrame(follow);
    };
    follow();
    return () => cancelAnimationFrame(frame);
  }, [active]);
  // A press on the tab selects its table first: Update Table and the gallery
  // act on the table the selection is on, as the ribbon's commands do.
  const selectTable = (event: ReactPointerEvent) => {
    if (event.button > 0 || editor.isDestroyed) return;
    const pos = getPos();
    if (typeof pos !== "number") return;
    const { state } = editor.view;
    const { selection } = state;
    if (selection instanceof NodeSelection && selection.from === pos) return;
    if (state.doc.nodeAt(pos)?.type.name !== "tableOfContents") return;
    editor.view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, pos)));
  };
  const refocusEditor = (event: Event) => {
    event.preventDefault();
    try {
      if (!editor.isDestroyed) editor.view.focus();
    } catch {
      // The view can go between the check and the focus.
    }
  };
  const tab = (
      <div
        className={
          floating
            ? "note-editor-toc__control-tab note-editor-toc__control-tab--floating"
            : "note-editor-toc__control-tab"
        }
        style={floating ? { left: floating.left, top: floating.top } : undefined}
        {...{ [TOC_CONTROL_TAB_ATTR]: "" }}
        role="toolbar"
        aria-label={t("toolbar.tableOfContents")}
        data-testid="document-toc-control-tab"
        onPointerDownCapture={selectTable}
        // Keep the caret where it is: the buttons act on the selected table.
        onMouseDown={(event) => event.preventDefault()}
      >
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="note-editor-toc__control-button"
              aria-label={t("toolbar.tableOfContents")}
              title={t("toolbar.tableOfContents")}
              data-testid="document-toc-control-gallery"
            >
              <DocsHomeIcon name="tableOfContents" size={14} />
              <ChevronDown size={10} aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="note-editor-toolbar-menu note-editor-toolbar-menu--toc-gallery"
            onCloseAutoFocus={refocusEditor}
          >
            <DocumentTocGalleryMenu
              removeEnabled
              onInsertAutomatic={(row) => requestTocControl(editor, { action: "automatic", row })}
              onInsertManual={(row) => requestTocControl(editor, { action: "manual", row })}
              onCustom={() => requestTocControl(editor, { action: "custom" })}
              onRemove={() => requestTocControl(editor, { action: "remove" })}
            />
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          type="button"
          className="note-editor-toc__control-button"
          data-testid="document-toc-control-update"
          onClick={() => requestTocControl(editor, { action: "update" })}
        >
          <RefreshCw size={12} aria-hidden />
          <span>{t("toolbar.tocControlUpdate")}</span>
        </button>
      </div>
  );
  return (
    <div
      ref={anchorRef}
      className="note-editor-toc__control-anchor"
      contentEditable={false}
      data-active={active ? "true" : undefined}
      {...{ [TOC_CONTROL_TAB_ATTR]: "" }}
    >
      {floating ? createPortal(tab, floating.host) : tab}
    </div>
  );
}
