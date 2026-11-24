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
import dynamic from "@mrnote/core/host/next/dynamic.tsx";
import { useLocale, useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { updateCurrentNodeViewAttributes } from "./nodeViewWriteAuthority";
import { translatedMermaidSources } from "./starterSourceWords";
import { officeDrawingSelectionStyles } from "@mrnote/core/web/components/office-ribbon/OfficeDrawingSelection.tsx";
import {
  officeDialogClassName,
  officeDialogParts,
} from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
// The same card, editor and caption as Docs' code chart block (shared
// dialog chrome, document tone).
import styles from "./CodeChartBlock.module.css";

// ---------------------------------------------------------------------------
// Shared bounds + sanitizers (mirror the server's fail-closed write
// validation in apps/api — MAX_MERMAID_* in markdown_directives.py — exactly)
// ---------------------------------------------------------------------------

export const MAX_MERMAID_SOURCE_CHARS = 20_000;
export const MAX_MERMAID_CAPTION_CHARS = 300;

/** Normalize line endings (the markdown fence codec forbids \r) and clamp. */
export function clampMermaidSource(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\r\n?/g, "\n")
    .slice(0, MAX_MERMAID_SOURCE_CHARS)
    .replace(/\n+$/, "");
}

export function clampMermaidCaption(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\r\n]+/g, " ").slice(0, MAX_MERMAID_CAPTION_CHARS);
}

// ---------------------------------------------------------------------------
// Starter + template sources (zh samples; comments use mermaid's %% syntax)
// ---------------------------------------------------------------------------

/** Inserted by the 插入 ▸ 插图 ▸ Mermaid 图 toolbar button. */
export const MERMAID_STARTER_SOURCE = `flowchart TD
    %% 示例流程图：点击下方“编辑源码”修改
    A[开始] --> B{审核通过?}
    B -- 是 --> C[执行下一步]
    B -- 否 --> D[退回修改]
    C --> E[结束]
    D --> B`;

export interface MermaidTemplate {
  id: "flowchart" | "sequence" | "gantt" | "state" | "er" | "pie";
  source: string;
}

export const MERMAID_TEMPLATES: readonly MermaidTemplate[] = [
  { id: "flowchart", source: MERMAID_STARTER_SOURCE },
  {
    id: "sequence",
    source: `sequenceDiagram
    %% 示例时序图
    participant 用户
    participant 系统
    用户->>系统: 发送请求
    系统-->>用户: 返回结果`,
  },
  {
    id: "gantt",
    source: `gantt
    %% 示例甘特图
    title 项目计划
    dateFormat YYYY-MM-DD
    section 阶段一
    需求分析 :a1, 2026-07-01, 7d
    方案设计 :after a1, 5d
    section 阶段二
    开发实现 :2026-07-13, 10d
    测试验收 :3d`,
  },
  {
    id: "state",
    source: `stateDiagram-v2
    %% 示例状态图
    [*] --> 待处理
    待处理 --> 进行中: 开始
    进行中 --> 已完成: 完成
    已完成 --> [*]`,
  },
  {
    id: "er",
    source: `erDiagram
    %% 示例ER图（实体关系）
    CUSTOMER ||--o{ ORDER : "下单"
    ORDER ||--|{ ORDER_ITEM : "包含"
    CUSTOMER {
        string name
        string phone
    }`,
  },
  {
    id: "pie",
    source: `pie
    %% 示例饼图
    title 市场份额
    "产品甲" : 45
    "产品乙" : 30
    "其他" : 25`,
  },
];

/**
 * The templates in the viewer's interface language: the Chinese sources
 * above as they are, every other language's built from the same diagrams
 * (`starterSourceWords`).
 */
export function mermaidTemplates(locale: string | null | undefined): readonly MermaidTemplate[] {
  const translated = translatedMermaidSources(locale);
  return translated
    ? MERMAID_TEMPLATES.map((template) => ({ id: template.id, source: translated[template.id] }))
    : MERMAID_TEMPLATES;
}

/** The starter the toolbar inserts, in the viewer's interface language. */
export function mermaidStarterSource(locale: string | null | undefined): string {
  return translatedMermaidSources(locale)?.flowchart ?? MERMAID_STARTER_SOURCE;
}

// ---------------------------------------------------------------------------
// Dynamic mermaid canvas (client-only, fetched on first diagram render —
// same pattern as ChartBlockV2Canvas / Excalidraw)
// ---------------------------------------------------------------------------

const MermaidBlockCanvas = dynamic(() => import("./MermaidBlockCanvas"), {
  ssr: false,
});

// ---------------------------------------------------------------------------
// Source editor (编辑源码) — exported for isolated unit tests, mirroring
// SmartArt's items editor + a small template picker
// ---------------------------------------------------------------------------

export interface MermaidSourceEditorLabels {
  /** The source field's accessible name (WUA 255: it had none). */
  sourceLabel: string;
  sourceHint: string;
  captionLabel: string;
  templateLabel: string;
  templateName: (id: MermaidTemplate["id"]) => string;
  done: string;
  cancel: string;
}

export interface MermaidSourceEditorProps {
  source: string;
  caption: string;
  labels: MermaidSourceEditorLabels;
  /** The templates offered, in the viewer's language (`mermaidTemplates`). */
  templates?: readonly MermaidTemplate[];
  disabled?: boolean;
  /** Every edit reports the full clamped draft (the host renders it live). */
  onChange: (next: { source: string; caption: string }) => void;
  onCancel: () => void;
  onDone: () => void;
}

export function MermaidSourceEditor({
  source,
  caption,
  labels,
  templates = MERMAID_TEMPLATES,
  disabled = false,
  onChange,
  onCancel,
  onDone,
}: MermaidSourceEditorProps) {
  const hintId = useId();
  return (
    <div
      className={`mermaid-block__editor ${styles.editor}`}
      data-testid="mermaid-editor"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      }}
    >
      <div
        data-testid="mermaid-editor-templates"
        className={styles.templates}
      >
        <span className={officeDialogParts.hint}>
          {labels.templateLabel}
        </span>
        {templates.map((template) => (
          <button
            key={template.id}
            type="button"
            disabled={disabled}
            data-testid={`mermaid-editor-template-${template.id}`}
            className={officeDialogParts.compactButton}
            onClick={() =>
              onChange({ source: clampMermaidSource(template.source), caption })
            }
          >
            {labels.templateName(template.id)}
          </button>
        ))}
      </div>
      <textarea
        rows={Math.min(16, Math.max(6, source.split("\n").length + 1))}
        value={source}
        className={officeDialogParts.mono}
        data-testid="mermaid-editor-textarea"
        aria-label={labels.sourceLabel}
        aria-describedby={hintId}
        disabled={disabled}
        onChange={(event) =>
          onChange({ source: clampMermaidSource(event.target.value), caption })
        }
      />
      <p id={hintId} className={officeDialogParts.hint}>
        {labels.sourceHint}
      </p>
      <label className={officeDialogParts.field}>
        <span className={officeDialogParts.label}>{labels.captionLabel}</span>
        <input
          type="text"
          value={caption}
          maxLength={MAX_MERMAID_CAPTION_CHARS}
          data-testid="mermaid-editor-caption"
          disabled={disabled}
          onChange={(event) =>
            onChange({ source, caption: clampMermaidCaption(event.target.value) })
          }
        />
      </label>
      <div className={styles.editorFooter}>
        <button
          type="button"
          className={officeDialogParts.compactButton}
          data-testid="mermaid-editor-cancel"
          onClick={onCancel}
        >
          {labels.cancel}
        </button>
        <button
          type="button"
          className={`${officeDialogParts.primaryButton} office-dialog__button--compact`}
          data-testid="mermaid-editor-done"
          disabled={disabled}
          onClick={onDone}
        >
          {labels.done}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Node view
// ---------------------------------------------------------------------------

function MermaidBlockView(props: NodeViewProps) {
  const t = useTranslations("console-notebooks");
  const locale = useLocale();
  const templates = useMemo(() => mermaidTemplates(locale), [locale]);
  const { editor, getPos, node, selected } = props;
  const attrs = node.attrs as { source?: unknown; caption?: unknown };
  const source = clampMermaidSource(attrs.source);
  const caption = clampMermaidCaption(attrs.caption);

  // While editing, the preview renders the DRAFT (live re-render); the attrs
  // are committed once on 完成 so undo stays a single history step.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ source: "", caption: "" });
  const [editable, setEditable] = useState(
    () => !editor.isDestroyed && editor.isEditable,
  );

  const openEditor = useCallback(() => {
    if (!editable || !editor.isEditable) return;
    setDraft({ source, caption });
    setEditing(true);
  }, [caption, editable, editor, source]);

  const cancelEditor = useCallback(() => {
    setDraft({ source: "", caption: "" });
    setEditing(false);
  }, []);

  useEffect(() => {
    const syncEditable = () => {
      const next = !editor.isDestroyed && editor.isEditable;
      setEditable(next);
      if (!next) cancelEditor();
    };
    const unsubscribe = subscribeEditorSurfaceEditable(editor, syncEditable);
    return () => {
      unsubscribe();
    };
  }, [cancelEditor, editor]);

  const applyEditor = useCallback(() => {
    const changed = updateCurrentNodeViewAttributes(
      editor,
      getPos,
      node,
      "mermaid",
      {
        source: clampMermaidSource(draft.source),
        caption: clampMermaidCaption(draft.caption),
      },
    );
    if (changed) setEditing(false);
  }, [draft, editor, getPos, node]);

  const shownSource = editing ? draft.source : source;
  const shownCaption = editing ? draft.caption : caption;

  return (
    <NodeViewWrapper
      // Selected, it wears the selection outline pictures, shapes and charts
      // wear (OfficeDrawingSelection); the card border itself never changes.
      className={`mermaid-block-wrapper ${styles.host} ${officeDrawingSelectionStyles.selectedHost}`}
      data-testid="mermaid-block"
      data-selected={selected || undefined}
    >
      <div
        className={`${officeDialogClassName({ tone: "document" })} office-dialog--embedded ${styles.card}`}
      >
      {typeof window !== "undefined" && (
        <MermaidBlockCanvas
          source={shownSource}
          loadingLabel={t("block.mermaid.loading")}
          errorLabel={t("block.mermaid.renderError")}
        />
      )}
      {shownCaption ? (
        <p
          className={`mermaid-block__caption ${styles.caption}`}
          data-testid="mermaid-block-caption"
        >
          {shownCaption}
        </p>
      ) : null}
      {editing ? (
        <MermaidSourceEditor
          source={draft.source}
          caption={draft.caption}
          labels={{
            sourceLabel: t("block.mermaid.sourceLabel"),
            sourceHint: t("block.mermaid.sourceHint"),
            captionLabel: t("block.mermaid.captionLabel"),
            templateLabel: t("block.mermaid.template"),
            templateName: (id) => t(`block.mermaid.template_${id}`),
            done: t("block.mermaid.done"),
            cancel: t("common.cancel"),
          }}
          templates={templates}
          disabled={!editable}
          onChange={setDraft}
          onCancel={cancelEditor}
          onDone={applyEditor}
        />
      ) : (
        <div className={styles.actions}>
          <button
            type="button"
            className={`mermaid-block__edit ${officeDialogParts.compactButton}`}
            data-testid="mermaid-edit-source"
            disabled={!editable}
            onClick={openEditor}
          >
            {t("block.mermaid.editSource")}
          </button>
        </div>
      )}
      </div>
    </NodeViewWrapper>
  );
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------













const MermaidBlock = Node.create({
  name: "mermaid",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      source: { default: MERMAID_STARTER_SOURCE },
      caption: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="mermaid"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "mermaid" })];
  },

  addNodeView() {
    return reactNodeViewWithLivePosition(MermaidBlockView);
  },
});

export default MermaidBlock;
