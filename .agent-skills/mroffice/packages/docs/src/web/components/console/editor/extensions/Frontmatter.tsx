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
import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { Code, Edit3 } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import yaml from "js-yaml";
import { updateCurrentNodeViewAttributes } from "./nodeViewWriteAuthority";
import { isDoubleTap } from "@mrnote/core/web/lib/double-tap.ts";

interface FrontmatterAttrs {
  yaml: string;
}

function FrontmatterView(props: NodeViewProps) {
  const t = useTranslations("console-notebooks");
  const { editor, getPos, node, selected } = props;
  const yamlText: string = (node.attrs as FrontmatterAttrs).yaml ?? "";
  const initiallyEditable = !editor.isDestroyed && editor.isEditable;
  const initiallyEditing = initiallyEditable && yamlText.trim() === "";
  const [editing, setEditing] = useState(initiallyEditing);
  const [editable, setEditable] = useState(initiallyEditable);
  const [draft, setDraft] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const editableRef = useRef(initiallyEditable);
  const authorityGenerationRef = useRef(0);
  const editingGenerationRef = useRef<number | null>(
    initiallyEditing ? 0 : null,
  );
  const value = draft ?? yamlText;

  useEffect(() => {
    const syncEditable = () => {
      const next = !editor.isDestroyed && editor.isEditable;
      editableRef.current = next;
      setEditable(next);
      if (next) return;
      authorityGenerationRef.current += 1;
      editingGenerationRef.current = null;
      setEditing(false);
      setDraft(null);
    };
    const unsubscribe = subscribeEditorSurfaceEditable(editor, syncEditable);
    syncEditable();
    return () => {
      unsubscribe();
    };
  }, [editor]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.selectionStart = inputRef.current.value.length;
    }
  }, [editing]);

  const handleBlur = useCallback(() => {
    const generation = editingGenerationRef.current;
    editingGenerationRef.current = null;
    setEditing(false);
    if (
      !editableRef.current ||
      editor.isDestroyed ||
      !editor.isEditable ||
      generation === null ||
      generation !== authorityGenerationRef.current
    ) {
      setDraft(null);
      return;
    }
    updateCurrentNodeViewAttributes(editor, getPos, node, "frontmatter", {
      yaml: value,
    });
    setDraft(null);
  }, [editor, getPos, node, value]);

  const cancelEditing = useCallback(() => {
    editingGenerationRef.current = null;
    setEditing(false);
    setDraft(null);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleBlur();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        cancelEditing();
      }
    },
    [cancelEditing, handleBlur],
  );

  let parsedSummary = "";
  try {
    const parsed = yaml.load(value || "");
    if (parsed && typeof parsed === "object") {
      const keys = Object.keys(parsed as object);
      parsedSummary = keys.slice(0, 3).join(", ");
      if (keys.length > 3) parsedSummary += `, +${keys.length - 3}`;
    }
  } catch {
    parsedSummary = t("frontmatter.invalid");
  }

  const startEditing = () => {
    if (!editableRef.current || !editor.isEditable) return;
    editingGenerationRef.current = authorityGenerationRef.current;
    setDraft(yamlText);
    setEditing(true);
  };

  return (
    <NodeViewWrapper
      className="frontmatter-block"
      data-selected={selected || undefined}
    >
      <div className="frontmatter-header">
        <span className="frontmatter-label">
          {editing ? <Edit3 size={14} /> : <Code size={14} />}
          {t("frontmatter.label")}
        </span>
        {!editing && parsedSummary ? (
          <span className="frontmatter-summary">{parsedSummary}</span>
        ) : null}
      </div>
      {editing ? (
        <textarea
          ref={inputRef}
          className="frontmatter-input"
          data-testid="frontmatter-input"
          value={value}
          disabled={!editable}
          onChange={(event) => {
            if (!editableRef.current || !editor.isEditable) return;
            setDraft(event.target.value);
          }}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={t("frontmatter.placeholder")}
          aria-label={t("frontmatter.label")}
          rows={Math.max(3, value.split("\n").length)}
          spellCheck={false}
        />
      ) : (
        <pre
          className="frontmatter-preview"
          data-testid="frontmatter-preview"
          onDoubleClick={startEditing}
          // A finger's double tap edits as a double-click does (an iPad does
          // not dependably send dblclick, and nothing else opens the block).
          onClick={(event) => {
            if (isDoubleTap(event.nativeEvent)) startEditing();
          }}
          title={t("frontmatter.doubleClickEdit")}
        >
          {yamlText || t("frontmatter.placeholder")}
        </pre>
      )}
    </NodeViewWrapper>
  );
}

const Frontmatter = Node.create({
  name: "frontmatter",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      yaml: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="frontmatter"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "frontmatter" }),
    ];
  },

  addNodeView() {
    return reactNodeViewWithLivePosition(FrontmatterView);
  },
});

export default Frontmatter;
