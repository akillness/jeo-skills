"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { EMU_PER_PX } from "@mrnote/core/web/lib/office-units.ts";
import { Node, mergeAttributes, type Editor } from "@tiptap/core";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { normalizeCoverScene } from "@mrnote/core/web/lib/document-cover-pages/coverPages.ts";

import { DocumentCoverPageScene } from "../native-document/DocumentCoverPageScene";
import {
  DOCUMENT_COVER_PAGE_NODE,
  documentCoverPageContext,
  documentCoverPageScene,
  setDocumentCoverField,
  type DocumentCoverPageContext,
} from "../native-document/documentCoverPages";
import styles from "./DocumentCoverPage.module.css";
import { reactNodeViewWithLivePosition } from "@mrnote/core/web/components/console/editor/extensions/reactNodeViewPosition.tsx";

const SCENE_SCALE = 1 / EMU_PER_PX;
// Imported covers carry their pictures inline (see normalizeCoverScene).
const MAX_SCENE_ATTR_CHARS = 40_000_000;

interface CoverDocumentSnapshot {
  key: string;
  context: DocumentCoverPageContext;
  editable: boolean;
}

function readSnapshot(editor: Editor): CoverDocumentSnapshot {
  const attrs = editor.state.doc.attrs as Record<string, unknown>;
  const context = documentCoverPageContext(attrs);
  return {
    key: JSON.stringify([context, editor.isEditable]),
    context,
    editable: editor.isEditable,
  };
}

/**
 * The document-level state a cover shows (page size, palette, properties)
 * lives on the root node, which never re-renders an atom's node view. Follow
 * it through transactions instead, re-rendering only when it changed.
 */
function useCoverDocumentSnapshot(editor: Editor): CoverDocumentSnapshot {
  const [snapshot, setSnapshot] = useState(() => readSnapshot(editor));
  const keyRef = useRef(snapshot.key);
  useEffect(() => {
    const refresh = () => {
      if (editor.isDestroyed) return;
      const next = readSnapshot(editor);
      if (next.key === keyRef.current) return;
      keyRef.current = next.key;
      setSnapshot(next);
    };
    refresh();
    editor.on("transaction", refresh);
    return () => {
      editor.off("transaction", refresh);
    };
  }, [editor]);
  return snapshot;
}

function DocumentCoverPageView({ editor, node, selected }: NodeViewProps) {
  const snapshot = useCoverDocumentSnapshot(editor);
  const { context } = snapshot;
  const scene = useMemo(
    () => documentCoverPageScene(node.attrs as Record<string, unknown>, context),
    [node.attrs, context],
  );
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(() => ({
    left: context.margins.left / EMU_PER_PX,
    top: context.margins.top / EMU_PER_PX,
  }));

  // The cover paints the whole sheet, margins included: anchor its layer to
  // the sheet's corner wherever the atom's own box landed.
  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    const sheet = wrapper?.closest<HTMLElement>("[data-page-sheet]");
    let next = {
      left: context.margins.left / EMU_PER_PX,
      top: context.margins.top / EMU_PER_PX,
    };
    if (wrapper && sheet && sheet.offsetWidth > 0) {
      const sheetBox = sheet.getBoundingClientRect();
      const box = wrapper.getBoundingClientRect();
      const zoom = sheetBox.width / sheet.offsetWidth || 1;
      next = {
        left: (box.left - sheetBox.left) / zoom,
        top: (box.top - sheetBox.top) / zoom,
      };
    }
    setOffset((current) =>
      Math.abs(current.left - next.left) < 0.5 &&
      Math.abs(current.top - next.top) < 0.5
        ? current
        : next,
    );
  });

  // Typing stays in the field until it is left (blur / Enter). Writing the
  // document property on every keystroke changed the document's own attrs,
  // and ProseMirror redraws the whole document for that: the field being
  // typed in was replaced, the focus fell to the page and the view jumped to
  // the document's selection at the bottom, so every later key was lost.
  // Other copies of the same property on this cover follow the typing here.
  const onInput = useCallback(
    (field: Parameters<typeof setDocumentCoverField>[1], text: string) => {
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      const active = wrapper.ownerDocument.activeElement;
      for (const copy of wrapper.querySelectorAll<HTMLElement>(
        `[data-cover-field="${field}"]`,
      )) {
        if (copy === active) continue;
        copy.textContent = text;
        copy.dataset.empty = text ? "" : "true";
      }
    },
    [],
  );
  const coverId = typeof node.attrs.coverId === "string" ? node.attrs.coverId : null;
  const onCommit = useCallback(
    (
      field: Parameters<typeof setDocumentCoverField>[1],
      text: string,
      next?: { field: string; index: number } | null,
    ) => {
      setDocumentCoverField(editor, field, text, { commit: true });
      // Writing the property redraws the cover, and the field Tab had just
      // focused was replaced: the focus fell to the page and the next keys
      // went nowhere (WUA 087). The field takes it back once redrawn.
      if (!next || !coverId) return;
      const view = wrapperRef.current?.ownerDocument.defaultView;
      if (!view) return;
      const refocus = (attempt: number) => {
        const doc = view.document;
        const active = doc.activeElement;
        if (active instanceof HTMLElement && active.closest("[data-cover-field]") && active.isConnected) return;
        if (active && active !== doc.body && !(active instanceof HTMLElement && active.closest(".ProseMirror"))) return;
        const cover = doc.querySelector(
          `[data-type="document-cover-page"][data-cover-id="${CSS.escape(coverId)}"]`,
        );
        const target = cover?.querySelectorAll<HTMLElement>(
          `[data-cover-field="${CSS.escape(next.field)}"]`,
        )[next.index];
        if (!target) {
          if (attempt < 3) view.requestAnimationFrame(() => refocus(attempt + 1));
          return;
        }
        target.focus({ preventScroll: true });
        const selection = doc.getSelection();
        if (selection) {
          const range = doc.createRange();
          range.selectNodeContents(target);
          range.collapse(false);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      };
      view.requestAnimationFrame(() => refocus(0));
    },
    [coverId, editor],
  );

  const contentHeight = Math.max(
    120,
    (context.page.heightEmu - context.margins.top - context.margins.bottom) /
      EMU_PER_PX -
      2,
  );

  return (
    <NodeViewWrapper
      ref={wrapperRef}
      className={`note-editor-cover-page ${styles.cover}`}
      data-type="document-cover-page"
      data-cover-id={node.attrs.coverId ?? undefined}
      data-selected={selected ? "true" : undefined}
      style={{ height: contentHeight }}
    >
      {scene ? (
        <div
          className={styles.layer}
          contentEditable={false}
          style={{ left: -offset.left, top: -offset.top }}
        >
          <DocumentCoverPageScene
            scene={scene}
            values={context.values}
            scale={SCENE_SCALE}
            fontFamily={context.fontFamily}
            editing={{ editable: snapshot.editable, onInput, onCommit }}
            testId="document-cover-page-scene"
          />
        </div>
      ) : null}
    </NodeViewWrapper>
  );
}

function isInsideCoverField(target: EventTarget | null): boolean {
  return (
    target instanceof Element && target.closest("[data-cover-field]") !== null
  );
}

function positiveInteger(value: unknown): number | null {
  const number = typeof value === "string" ? Number(value) : value;
  return typeof number === "number" &&
    Number.isInteger(number) &&
    number >= 1 &&
    number <= 0x7fffffff
    ? number
    : null;
}

/**
 * A Word cover page: one atom at the document start. `coverId` names an
 * MRAI design from the catalog (drawn fresh on the document's page and
 * theme); `scene` carries a cover imported from Word, as the server read it.
 * `locale` is the author's language, for placeholders and date pictures.
 */
const DocumentCoverPage = Node.create({
  name: DOCUMENT_COVER_PAGE_NODE,
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,
  isolating: true,

  addAttributes() {
    return {
      coverId: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-cover-id") || null,
        renderHTML: (attrs: Record<string, unknown>) =>
          typeof attrs.coverId === "string"
            ? { "data-cover-id": attrs.coverId }
            : {},
      },
      locale: {
        default: "en",
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-cover-locale") || "en",
        renderHTML: (attrs: Record<string, unknown>) => ({
          "data-cover-locale":
            typeof attrs.locale === "string" ? attrs.locale : "en",
        }),
      },
      controlId: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          positiveInteger(element.getAttribute("data-cover-control-id")),
        renderHTML: (attrs: Record<string, unknown>) => {
          const id = positiveInteger(attrs.controlId);
          return id === null ? {} : { "data-cover-control-id": String(id) };
        },
      },
      scene: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const serialized = element.getAttribute("data-cover-scene");
          if (!serialized || serialized.length > MAX_SCENE_ATTR_CHARS) return null;
          try {
            return normalizeCoverScene(JSON.parse(serialized));
          } catch {
            return null;
          }
        },
        renderHTML: (attrs: Record<string, unknown>) => {
          const scene = normalizeCoverScene(attrs.scene);
          return scene ? { "data-cover-scene": JSON.stringify(scene) } : {};
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="document-cover-page"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "document-cover-page" }),
    ];
  },

  addNodeView() {
    return reactNodeViewWithLivePosition(DocumentCoverPageView, {
      // Typing into a bound field is the field's own business; everything
      // else on the cover selects the cover, as a click on a Word cover
      // drawing selects the drawing.
      stopEvent: ({ event }) => isInsideCoverField(event.target),
      ignoreMutation: () => true,
    });
  },
});

export default DocumentCoverPage;
