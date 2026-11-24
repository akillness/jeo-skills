"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { isPictureNode } from "@mrnote/core/web/components/console/editor/native-document/documentObjectNodes.ts";
import type { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection, Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { OfficePictureStyleGallery } from "@mrnote/core/web/components/office-ribbon/OfficePictureStyleGallery.tsx";
import type {
  OfficePictureStyleEntry,
  OfficePictureStyleId,
} from "@mrnote/core/web/lib/office-picture-styles/catalog.ts";

import {
  documentPictureGeometryOverride,
  normalizeImageBorderWidth,
  normalizeImagePictureStyle,
} from "@mrnote/core/web/components/console/editor/native-document/imageControls.ts";

const PICTURE_STYLE_PREVIEW_META = "documentPictureStylePreview";

/**
 * Word's Picture Styles are Office's 28 built-in styles (the same gallery as
 * Excel and PowerPoint). Applying one stores its id in the image node's
 * `pictureStyle` attribute; the DOCX writers emit the style's complete
 * `pic:spPr` recipe and the importers recognise it back. Applying a style
 * resets the outline to the style's own (a Picture Border set earlier goes);
 * a Picture Border set AFTER it replaces only the style's outline and keeps
 * its effects, as in Word. Crop, rotation, size, alt text and picture
 * corrections are kept.
 *
 * Pictures saved with the earlier MRAI-only frame presets carry plain
 * `pictureBorder*` attributes and no `pictureStyle`; they load, render and
 * export exactly as before.
 */
export const normalizeDocumentPictureStyle = normalizeImagePictureStyle;

export interface DocumentPictureStyleTarget {
  readonly editor: Editor;
  readonly doc: ProseMirrorNode;
  readonly selection: NodeSelection;
  readonly pos: number;
  readonly node: ProseMirrorNode;
  readonly editable: boolean;
}

interface DocumentPictureStylePreview {
  readonly target: DocumentPictureStyleTarget;
  readonly style: OfficePictureStyleId;
}

interface DocumentPictureStylePluginState {
  readonly preview: DocumentPictureStylePreview | null;
  readonly decorations: DecorationSet;
}

type DocumentPictureStylePreviewRequest =
  | {
      readonly kind: "set";
      readonly preview: DocumentPictureStylePreview;
    }
  | { readonly kind: "clear" };

export const documentPictureStylePluginKey =
  new PluginKey<DocumentPictureStylePluginState>("documentPictureStyles");

function imageVisualFormattingEditable(node: ProseMirrorNode): boolean {
  const attrs = node.attrs as Record<string, unknown>;
  return (
    attrs.pictureVisualFormattingEditable === true ||
    (attrs.pictureVisualFormattingEditable == null &&
      attrs.officeImage !== true)
  );
}

export function readDocumentPictureStyleTarget(
  editor: Editor,
): DocumentPictureStyleTarget | null {
  if (editor.isDestroyed) return null;
  const { doc, selection } = editor.state;
  if (!(selection instanceof NodeSelection)) return null;
  const node = selection.node;
  if (!isPictureNode(node) || doc.nodeAt(selection.from) !== node) {
    return null;
  }
  return {
    editor,
    doc,
    selection,
    pos: selection.from,
    node,
    editable: editor.isEditable && imageVisualFormattingEditable(node),
  };
}

function authenticateDocumentPictureStyleTarget(
  editor: Editor,
  target: DocumentPictureStyleTarget,
): DocumentPictureStyleTarget | null {
  if (
    editor !== target.editor ||
    editor.isDestroyed ||
    editor.state.doc !== target.doc
  ) {
    return null;
  }
  // The target is frozen when the ribbon renders; a later transaction can
  // re-select the same picture with a new selection object (node-view
  // re-selection, focus restore) without re-rendering the ribbon, so the
  // selection is authenticated by value, not by identity.
  const current = readDocumentPictureStyleTarget(editor);
  return current &&
    current.pos === target.pos &&
    current.node === target.node &&
    current.selection.eq(target.selection) &&
    current.doc.nodeAt(current.pos) === current.node
    ? current
    : null;
}

function pictureStyleDecorations(
  doc: ProseMirrorNode,
  preview: DocumentPictureStylePreview | null,
): DecorationSet {
  if (
    !preview ||
    preview.target.doc !== doc ||
    doc.nodeAt(preview.target.pos) !== preview.target.node
  ) {
    return DecorationSet.empty;
  }
  return DecorationSet.create(doc, [
    Decoration.node(
      preview.target.pos,
      preview.target.pos + preview.target.node.nodeSize,
      { "data-picture-style-preview": preview.style },
      // The image NodeView reads the id from the decoration spec and draws the
      // style over the picture; nothing enters document JSON or history.
      { pictureStylePreview: preview.style },
    ),
  ]);
}

export function createDocumentPictureStylePlugin(): Plugin<DocumentPictureStylePluginState> {
  return new Plugin<DocumentPictureStylePluginState>({
    key: documentPictureStylePluginKey,
    state: {
      init: (_config, state) => ({
        preview: null,
        decorations: pictureStyleDecorations(state.doc, null),
      }),
      apply: (transaction, current) => {
        const request = transaction.getMeta(PICTURE_STYLE_PREVIEW_META) as
          DocumentPictureStylePreviewRequest | undefined;
        let preview = current.preview;
        if (request?.kind === "set") preview = request.preview;
        else if (request?.kind === "clear") preview = null;
        else if (transaction.docChanged || transaction.selectionSet) {
          preview = null;
        }
        if (!transaction.docChanged && preview === current.preview) {
          return current;
        }
        return {
          preview,
          decorations: pictureStyleDecorations(transaction.doc, preview),
        };
      },
    },
    props: {
      decorations: (state) =>
        documentPictureStylePluginKey.getState(state)?.decorations ??
        DecorationSet.empty,
    },
  });
}

export function setDocumentPictureStylePreview(
  editor: Editor,
  target: DocumentPictureStyleTarget,
  style: OfficePictureStyleId | null,
): boolean {
  const currentPreview =
    documentPictureStylePluginKey.getState(editor.state)?.preview ?? null;
  if (style === null) {
    if (!currentPreview) return false;
    if (
      currentPreview.target.editor !== target.editor ||
      currentPreview.target.node !== target.node
    ) {
      return false;
    }
    editor.view.dispatch(
      editor.state.tr
        .setMeta(PICTURE_STYLE_PREVIEW_META, { kind: "clear" })
        .setMeta("addToHistory", false),
    );
    return true;
  }
  const current = authenticateDocumentPictureStyleTarget(editor, target);
  if (!current?.editable) return false;
  editor.view.dispatch(
    editor.state.tr
      .setMeta(PICTURE_STYLE_PREVIEW_META, {
        kind: "set",
        preview: { target, style },
      })
      .setMeta("addToHistory", false),
  );
  return true;
}

export function documentPictureStyleValue(
  node: ProseMirrorNode,
): OfficePictureStyleId | null {
  return normalizeDocumentPictureStyle(
    (node.attrs as Record<string, unknown>).pictureStyle,
  );
}

/**
 * The picture attributes applying one Office picture style (or none) writes,
 * shared by the gallery and the Format Picture pane's Effects preset.
 */
export function documentPictureStylePatch(
  style: OfficePictureStyleId | null,
): Record<string, unknown> {
  const next = normalizeDocumentPictureStyle(style);
  return {
    // "none" states the removal, so an imported picture's source style
    // is not kept on save (null would mean "unstated").
    pictureStyle: next ?? "none",
    // The style's own `a:ln` is the outline; a Picture Border set before
    // it is replaced, as applying a picture style does in Word.
    ...(next
      ? {
          pictureBorderWidth: 0,
          pictureBorderStyle: "solid",
          pictureBorderColor: "#000000",
        }
      : {}),
    pictureStyleOutlineHidden: false,
    // A style is a whole `spPr` recipe, its geometry included: the shape
    // Crop to Shape gave the picture is replaced by the style's own (null
    // states none of the picture's own; see documentPictureGeometry).
    pictureGeometry: null,
    pictureGeometryAdjustments: null,
  };
}

/** Apply one Office picture style (or none) as a single undoable step. */
export function commitDocumentPictureStyle(
  editor: Editor,
  target: DocumentPictureStyleTarget,
  style: OfficePictureStyleId | null,
): boolean {
  const current = authenticateDocumentPictureStyleTarget(editor, target);
  if (!current?.editable) return false;
  const next = normalizeDocumentPictureStyle(style);
  if (style !== null && next === null) return false;
  const attrs = current.node.attrs as Record<string, unknown>;
  if (
    documentPictureStyleValue(current.node) === next &&
    documentPictureGeometryOverride(attrs) === null &&
    (next === null ||
      (normalizeImageBorderWidth(attrs.pictureBorderWidth) === 0 &&
        attrs.pictureStyleOutlineHidden !== true))
  ) {
    return false;
  }
  let transaction = closeHistory(
    editor.state.tr.setNodeMarkup(
      current.pos,
      undefined,
      { ...current.node.attrs, ...documentPictureStylePatch(next) },
      current.node.marks,
    ),
  );
  if (!transaction.docChanged) return false;
  transaction = transaction.setSelection(
    NodeSelection.create(transaction.doc, current.pos),
  );
  editor.view.dispatch(transaction);
  editor.view.focus();
  return true;
}

export interface DocumentPictureStyleGalleryLabels {
  readonly ariaLabel: string;
  readonly more: string;
  readonly disabledReason: string;
  /** Unused: the shared gallery names each style from the catalogue. */
  readonly style?: (entry: OfficePictureStyleEntry, index: number) => string;
}

/**
 * The selected picture as the editor holds it NOW. The ribbon hands the
 * gallery the picture it rendered with; applying a style changes the
 * document without always re-rendering the ribbon, so a gallery that kept
 * that target showed the old style as current and refused the next style
 * until the picture was selected again. The gallery follows every
 * transaction instead and acts on the picture that is selected when pressed.
 */
function useLiveDocumentPictureStyleTarget(
  editor: Editor,
  rendered: DocumentPictureStyleTarget,
): DocumentPictureStyleTarget {
  const subscribe = useCallback(
    (notify: () => void) => {
      editor.on("transaction", notify);
      return () => {
        editor.off("transaction", notify);
      };
    },
    [editor],
  );
  // Only the selected picture's position and style re-render the gallery:
  // a string snapshot, so other transactions (typing elsewhere, a pane's own
  // writes) leave it and the ribbon around it alone.
  const key = useSyncExternalStore(
    subscribe,
    () => {
      const live = editor.isDestroyed ? null : readDocumentPictureStyleTarget(editor);
      return live ? `${live.pos}|${String(documentPictureStyleValue(live.node))}|${live.editable}` : "";
    },
    () => "",
  );
  return useMemo(() => {
    void key;
    const live = readDocumentPictureStyleTarget(editor);
    return live && live.pos === rendered.pos ? live : rendered;
  }, [editor, rendered, key]);
}

export function DocumentPictureStyleGallery({
  editor,
  target: renderedTarget,
  labels,
}: {
  readonly editor: Editor;
  readonly target: DocumentPictureStyleTarget;
  readonly labels: DocumentPictureStyleGalleryLabels;
}) {
  const target = useLiveDocumentPictureStyleTarget(editor, renderedTarget);
  return (
    <OfficePictureStyleGallery
      application="docs"
      disabled={!target.editable}
      disabledReason={labels.disabledReason}
      labels={labels}
      value={documentPictureStyleValue(target.node)}
      visibleItemCount={5}
      onPreviewChange={(id) => {
        setDocumentPictureStylePreview(
          editor,
          readDocumentPictureStyleTarget(editor) ?? target,
          id,
        );
      }}
      onCommit={(id) => {
        commitDocumentPictureStyle(
          editor,
          readDocumentPictureStyleTarget(editor) ?? target,
          id,
        );
      }}
      testIdPrefix="document-toolbar-picture-styles"
    />
  );
}
