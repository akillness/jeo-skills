"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { subscribeEditorSurfaceEditable } from "@mrnote/core/web/components/console/editor/useEditorSurfaceEditable.ts";
import { Node, mergeAttributes } from "@tiptap/core";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import { reactNodeViewWithLivePosition } from "@mrnote/core/web/components/console/editor/extensions/reactNodeViewPosition.tsx";
import { useCallback, useEffect, useState } from "react";
import {
  Layers,
  Pencil,
  Eye,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { updateCurrentNodeViewAttributes } from "./nodeViewWriteAuthority";

interface FlashcardAttrs {
  front: string;
  back: string;
  flipped: boolean;
  card_id: string | null;
}

interface FlashcardBlockOptions {
  /** Retained for callers that configure the shared editor in guest mode. */
  guestMode: boolean;
}

function FlashcardBlockView(props: NodeViewProps) {
  const t = useTranslations("console-notebooks");
  const { editor, getPos, node } = props;
  const attrs = node.attrs as FlashcardAttrs;
  const [mode, setMode] = useState<"edit" | "preview">(
    attrs.front || attrs.back ? "preview" : "edit",
  );
  const [editable, setEditable] = useState(
    () => !editor.isDestroyed && editor.isEditable,
  );
  const [readOnlyFlipped, setReadOnlyFlipped] = useState(attrs.flipped);
  const commitFlashcardPatch = useCallback(
    (patch: Record<string, unknown>) =>
      updateCurrentNodeViewAttributes(
        editor,
        getPos,
        node,
        "flashcard",
        patch,
      ),
    [editor, getPos, node],
  );

  useEffect(() => {
    const syncEditable = () => {
      const next = !editor.isDestroyed && editor.isEditable;
      setEditable(next);
      if (!next) setReadOnlyFlipped(attrs.flipped);
    };
    const unsubscribe = subscribeEditorSurfaceEditable(editor, syncEditable);
    syncEditable();
    return () => {
      unsubscribe();
    };
  }, [attrs.flipped, editor]);

  const handleFlip = useCallback(() => {
    if (!editable) {
      setReadOnlyFlipped((current) => !current);
      return;
    }
    commitFlashcardPatch({ flipped: !attrs.flipped });
  }, [attrs.flipped, commitFlashcardPatch, editable]);

  const isBack = editable ? attrs.flipped : readOnlyFlipped;

  return (
    <NodeViewWrapper className="flashcard-block" data-testid="flashcard-block">
      <div className="flashcard-block__toolbar">
        <Layers size={14} />
        <button
          type="button"
          className={`flashcard-block__mode${mode === "edit" ? " is-active" : ""}`}
          disabled={!editable}
          onClick={() => setMode("edit")}
          data-testid="flashcard-mode-edit"
        >
          <Pencil size={12} /> {t("block.flashcard.edit")}
        </button>
        <button
          type="button"
          className={`flashcard-block__mode${mode === "preview" ? " is-active" : ""}`}
          onClick={() => setMode("preview")}
          data-testid="flashcard-mode-preview"
        >
          <Eye size={12} /> {t("block.flashcard.preview")}
        </button>
        {attrs.card_id && (
          <span
            className="flashcard-block__in-deck"
            data-testid="flashcard-in-deck"
            style={{ fontSize: 10, color: "var(--console-accent, #0D9488)", marginLeft: 6 }}
          >
            {t("block.flashcard.inDeck")}
          </span>
        )}
      </div>
      {mode === "edit" ? (
        <div className="flashcard-block__editor">
          <textarea
            placeholder={t("block.flashcard.frontPlaceholder")}
            value={attrs.front}
            disabled={!editable}
            onChange={(e) => commitFlashcardPatch({ front: e.target.value })}
            data-testid="flashcard-front"
          />
          <textarea
            placeholder={t("block.flashcard.backPlaceholder")}
            value={attrs.back}
            disabled={!editable}
            onChange={(e) => commitFlashcardPatch({ back: e.target.value })}
            data-testid="flashcard-back"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={handleFlip}
          className={`flashcard-block__card${isBack ? " is-flipped" : ""}`}
          aria-label={
            isBack
              ? t("block.flashcard.ariaBack")
              : t("block.flashcard.ariaFront")
          }
          data-testid="flashcard-card"
        >
          <span className="flashcard-block__hint">
            {isBack ? t("block.flashcard.hintAnswer") : t("block.flashcard.hintQuestion")} · {t("block.flashcard.hintFlip")}
          </span>
          <div className="flashcard-block__body">
            {isBack ? attrs.back || "(empty)" : attrs.front || "(empty)"}
          </div>
        </button>
      )}
    </NodeViewWrapper>
  );
}

const FlashcardBlock = Node.create<FlashcardBlockOptions>({
  name: "flashcard",
  group: "block",
  atom: true,
  draggable: true,

  addOptions() {
    return {
      guestMode: false,
    };
  },

  addAttributes() {
    return {
      front: { default: "" },
      back: { default: "" },
      flipped: { default: false },
      card_id: { default: null as string | null },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="flashcard"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "flashcard" })];
  },

  addNodeView() {
    return reactNodeViewWithLivePosition(FlashcardBlockView);
  },
});

export default FlashcardBlock;
