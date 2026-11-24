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
import { useLocale, useTranslations } from "@mrnote/core/host/next-intl.tsx";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { updateCurrentNodeViewAttributes } from "./nodeViewWriteAuthority";
import { translatedCodeChartSources } from "./starterSourceWords";
import { officeDrawingSelectionStyles } from "@mrnote/core/web/components/office-ribbon/OfficeDrawingSelection.tsx";
import {
  officeDialogClassName,
  officeDialogParts,
} from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import styles from "./CodeChartBlock.module.css";

import {
  DEFAULT_PYTHON_TIMEOUT_MS,
  hasPythonKernel,
  interruptPython,
  runPython,
} from "@mrnote/core/web/lib/code-runner/python-runner.ts";
import type { RunResult } from "@mrnote/core/web/lib/code-runner/js-runner.ts";

// ---------------------------------------------------------------------------
// Shared bounds + sanitizers (mirror the server's fail-closed write
// validation in apps/api — MAX_CODE_CHART_* in markdown_directives.py and
// the outputPng contract of DOCUMENT_DATA_IMAGE_RE in notebooks.py — exactly)
// ---------------------------------------------------------------------------

export const MAX_CODE_CHART_SOURCE_CHARS = 20_000;
export const MAX_CODE_CHART_CAPTION_CHARS = 300;
/**
 * outputPng is "" or a data:image/png;base64 URI bounded by the SERVER's
 * existing data-image contract (MAX_DOCUMENT_DATA_IMAGE_URL_LENGTH +
 * DOCUMENT_DATA_IMAGE_RE in apps/api/app/routers/notebooks.py).
 */
export const MAX_CODE_CHART_OUTPUT_PNG_CHARS = 2_000_000;
export const CODE_CHART_OUTPUT_PNG_RE =
  /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/;

/** Normalize line endings (the markdown fence codec forbids \r) and clamp. */
export function clampCodeChartSource(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\r\n?/g, "\n")
    .slice(0, MAX_CODE_CHART_SOURCE_CHARS)
    .replace(/\n+$/, "");
}

export function clampCodeChartCaption(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\r\n]+/g, " ").slice(0, MAX_CODE_CHART_CAPTION_CHARS);
}

/** "" unless the value is a well-formed, in-bounds PNG data URI. */
export function sanitizeCodeChartOutputPng(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > MAX_CODE_CHART_OUTPUT_PNG_CHARS ||
    !CODE_CHART_OUTPUT_PNG_RE.test(value)
  ) {
    return "";
  }
  return value;
}

// ---------------------------------------------------------------------------
// Starter + template sources (zh comments; the capture convention is any
// matplotlib figure left open at the end of the script — the sandboxed
// worker renders open figures to PNG with the headless Agg backend)
// ---------------------------------------------------------------------------

/** Inserted by the 插入 ▸ 插图 ▸ 代码图表 toolbar button. */
export const CODE_CHART_STARTER_SOURCE = `# 柱状图示例：点击「运行」在沙箱中执行，脚本结束时保持
# figure 打开，运行器会自动把它捕获为 PNG 嵌入文档。
import matplotlib.pyplot as plt

x = ["Q1", "Q2", "Q3", "Q4"]
y = [120, 150, 90, 180]

fig, ax = plt.subplots(figsize=(6, 4))
ax.bar(x, y, color="#2563eb")
ax.set_title("Quarterly Sales")
ax.set_ylabel("Amount")
# 不要调用 plt.close()：打开的 figure 才会被捕获`;

export interface CodeChartTemplate {
  id: "bar" | "line" | "scatter" | "pie";
  source: string;
}

export const CODE_CHART_TEMPLATES: readonly CodeChartTemplate[] = [
  { id: "bar", source: CODE_CHART_STARTER_SOURCE },
  {
    id: "line",
    source: `# 折线图示例：多序列趋势对比
import matplotlib.pyplot as plt

x = [2021, 2022, 2023, 2024, 2025]
a = [3.2, 4.1, 4.8, 6.0, 7.4]
b = [2.5, 2.9, 3.6, 4.2, 5.1]

fig, ax = plt.subplots(figsize=(6, 4))
ax.plot(x, a, marker="o", label="Series A")
ax.plot(x, b, marker="s", label="Series B")
ax.set_title("Yearly Trend")
ax.legend()
ax.grid(True, alpha=0.3)
# 打开的 figure 会被自动捕获为 PNG`,
  },
  {
    id: "scatter",
    source: `# 散点图示例：两个变量的相关性
import matplotlib.pyplot as plt
import random

random.seed(7)  # 固定随机种子，保证可复现
x = [random.gauss(50, 12) for _ in range(80)]
y = [v * 0.8 + random.gauss(10, 6) for v in x]

fig, ax = plt.subplots(figsize=(6, 4))
ax.scatter(x, y, alpha=0.6, color="var(--console-success, #059669)")
ax.set_title("Correlation")
ax.set_xlabel("X")
ax.set_ylabel("Y")
# 打开的 figure 会被自动捕获为 PNG`,
  },
  {
    id: "pie",
    source: `# 饼图示例：占比分布
import matplotlib.pyplot as plt

labels = ["A", "B", "C", "Other"]
sizes = [45, 30, 15, 10]

fig, ax = plt.subplots(figsize=(5, 5))
ax.pie(sizes, labels=labels, autopct="%1.0f%%", startangle=90)
ax.set_title("Share")
# 打开的 figure 会被自动捕获为 PNG`,
  },
];

/**
 * The templates with comments in the viewer's interface language: the
 * Chinese sources above as they are, every other language's from
 * `starterSourceWords` (the code and the plot titles are the same).
 */
export function codeChartTemplates(
  locale: string | null | undefined,
): readonly CodeChartTemplate[] {
  const translated = translatedCodeChartSources(locale);
  return translated
    ? CODE_CHART_TEMPLATES.map((template) => ({
        id: template.id,
        source: translated[template.id],
      }))
    : CODE_CHART_TEMPLATES;
}

/** The starter the toolbar inserts, in the viewer's interface language. */
export function codeChartStarterSource(
  locale: string | null | undefined,
): string {
  return translatedCodeChartSources(locale)?.bar ?? CODE_CHART_STARTER_SOURCE;
}

// ---------------------------------------------------------------------------
// Execution: reuse the EXISTING sandboxed Python worker runtime (no new
// engine, no network from code). The worker collects every open matplotlib
// figure as base64 PNG after the run (COLLECT_RICH in public/python-worker.js)
// and the transport already bounds each image at 1M base64 chars.
// ---------------------------------------------------------------------------

/** All code-chart blocks share one kernel namespace (like notebook cells). */
export const CODE_CHART_NAMESPACE = "__mrn_code_chart__";
export const CODE_CHART_TIMEOUT_MS = DEFAULT_PYTHON_TIMEOUT_MS;
/**
 * The FIRST run pays the one-off runtime boot inside its own timeout budget:
 * Pyodide wasm download+compile plus the matplotlib/numpy package install
 * routinely exceed the standard 20s on a cold cache, which would make the
 * first click always fail truthfully-but-uselessly. Warm runs (a live kernel
 * exists) keep the standard anti-freeze budget.
 */
export const CODE_CHART_FIRST_RUN_TIMEOUT_MS = 90_000;

export type CodeChartRunner = (
  code: string,
  options: { namespace?: string; timeoutMs?: number },
) => Promise<RunResult>;

export interface CodeChartRunOutcome {
  /** A validated data:image/png;base64 URI, or "" when the run failed. */
  outputPng: string;
  /**
   * Truthful failure kind ("" = success):
   *  - "error": the script raised / timed out (message in `detail`)
   *  - "no-image": the script finished but left no capturable figure
   *  - "oversized": the captured PNG exceeds the 2M-char attr bound
   */
  failure: "" | "error" | "no-image" | "oversized";
  detail: string;
}

/**
 * Run a code-chart script in the sandboxed worker and capture the first
 * matplotlib figure as a PNG data URI. Never throws — every failure mode maps
 * to a truthful outcome the block renders (spec: never blank, never fake).
 */
export async function executeCodeChart(
  source: string,
  runner: CodeChartRunner = runPython,
): Promise<CodeChartRunOutcome> {
  let result: RunResult;
  try {
    result = await runner(clampCodeChartSource(source), {
      namespace: CODE_CHART_NAMESPACE,
      timeoutMs: hasPythonKernel(CODE_CHART_NAMESPACE)
        ? CODE_CHART_TIMEOUT_MS
        : CODE_CHART_FIRST_RUN_TIMEOUT_MS,
    });
  } catch {
    return {
      outputPng: "",
      failure: "error",
      detail: "",
    };
  }
  if (result.error) {
    return { outputPng: "", failure: "error", detail: result.error };
  }
  const first = result.images?.[0];
  const firstMime = result.imageMimes?.[0] ?? "image/png";
  if (typeof first !== "string" || first.length === 0) {
    return { outputPng: "", failure: "no-image", detail: "" };
  }
  if (firstMime !== "image/png") {
    // The figure-capture path always emits PNG; anything else is a foreign
    // payload and must not be persisted as outputPng.
    return { outputPng: "", failure: "no-image", detail: "" };
  }
  const dataUri = `data:image/png;base64,${first}`;
  if (dataUri.length > MAX_CODE_CHART_OUTPUT_PNG_CHARS) {
    return { outputPng: "", failure: "oversized", detail: "" };
  }
  const sanitized = sanitizeCodeChartOutputPng(dataUri);
  if (!sanitized) {
    return { outputPng: "", failure: "no-image", detail: "" };
  }
  return { outputPng: sanitized, failure: "", detail: "" };
}

// ---------------------------------------------------------------------------
// Source editor (编辑源码) — exported for isolated unit tests, mirroring
// MermaidBlock's editor panel + template picker
// ---------------------------------------------------------------------------

export interface CodeChartSourceEditorLabels {
  /** The code field's accessible name. */
  sourceLabel: string;
  sourceHint: string;
  captionLabel: string;
  templateLabel: string;
  templateName: (id: CodeChartTemplate["id"]) => string;
  done: string;
  cancel: string;
}

export interface CodeChartSourceEditorProps {
  source: string;
  caption: string;
  labels: CodeChartSourceEditorLabels;
  /** The templates offered, in the viewer's language (`codeChartTemplates`). */
  templates?: readonly CodeChartTemplate[];
  disabled?: boolean;
  /** Every edit reports the full clamped draft. */
  onChange: (next: { source: string; caption: string }) => void;
  onCancel: () => void;
  onDone: () => void;
}

export function CodeChartSourceEditor({
  source,
  caption,
  labels,
  templates = CODE_CHART_TEMPLATES,
  disabled = false,
  onChange,
  onCancel,
  onDone,
}: CodeChartSourceEditorProps) {
  const hintId = useId();
  return (
    <div
      className={`code-chart-block__editor ${styles.editor}`}
      data-testid="code-chart-editor"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      }}
    >
      <div
        data-testid="code-chart-editor-templates"
        className={styles.templates}
      >
        <span className={officeDialogParts.hint}>{labels.templateLabel}</span>
        {templates.map((template) => (
          <button
            key={template.id}
            type="button"
            disabled={disabled}
            data-testid={`code-chart-editor-template-${template.id}`}
            className={officeDialogParts.compactButton}
            onClick={() =>
              onChange({
                source: clampCodeChartSource(template.source),
                caption,
              })
            }
          >
            {labels.templateName(template.id)}
          </button>
        ))}
      </div>
      <textarea
        rows={Math.min(20, Math.max(8, source.split("\n").length + 1))}
        value={source}
        className={officeDialogParts.mono}
        data-testid="code-chart-editor-textarea"
        aria-label={labels.sourceLabel}
        aria-describedby={hintId}
        disabled={disabled}
        onChange={(event) =>
          onChange({
            source: clampCodeChartSource(event.target.value),
            caption,
          })
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
          maxLength={MAX_CODE_CHART_CAPTION_CHARS}
          data-testid="code-chart-editor-caption"
          disabled={disabled}
          onChange={(event) =>
            onChange({
              source,
              caption: clampCodeChartCaption(event.target.value),
            })
          }
        />
      </label>
      <div className={styles.editorFooter}>
        <button
          type="button"
          data-testid="code-chart-editor-cancel"
          className={officeDialogParts.compactButton}
          onClick={onCancel}
        >
          {labels.cancel}
        </button>
        <button
          type="button"
          data-testid="code-chart-editor-done"
          className={`${officeDialogParts.primaryButton} office-dialog__button--compact`}
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
// Output panel — exported for isolated unit tests (未运行 / 成功 / 失败).
// Renders the PNG or a truthful status; NEVER a blank area, NEVER a fake
// chart (spec: 代码可复现，图像走既有导出).
// ---------------------------------------------------------------------------

export interface CodeChartOutputLabels {
  notRun: string;
  running: string;
  runFailedPrefix: string;
  noImage: string;
  oversized: string;
}

export interface CodeChartOutputProps {
  outputPng: string;
  caption: string;
  running: boolean;
  failure: CodeChartRunOutcome["failure"];
  failureDetail: string;
  labels: CodeChartOutputLabels;
}

export function CodeChartOutput({
  outputPng,
  caption,
  running,
  failure,
  failureDetail,
  labels,
}: CodeChartOutputProps) {
  if (running) {
    return (
      <p
        data-testid="code-chart-running"
        className={`${officeDialogParts.message} ${styles.status}`}
      >
        {labels.running}
      </p>
    );
  }
  if (failure === "error") {
    return (
      <div
        data-testid="code-chart-error"
        className={`${officeDialogParts.error} ${officeDialogParts.mono} ${styles.error}`}
      >
        {labels.runFailedPrefix}
        {failureDetail ? `: ${failureDetail}` : ""}
      </div>
    );
  }
  if (failure === "no-image" || failure === "oversized") {
    return (
      <p
        data-testid="code-chart-no-image"
        data-tone="warning"
        className={`${officeDialogParts.message} ${styles.status}`}
      >
        {failure === "oversized" ? labels.oversized : labels.noImage}
      </p>
    );
  }
  const sanitized = sanitizeCodeChartOutputPng(outputPng);
  if (!sanitized) {
    return (
      <p
        data-testid="code-chart-not-run"
        className={`${officeDialogParts.message} ${styles.status}`}
      >
        {labels.notRun}
      </p>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      data-testid="code-chart-image"
      src={sanitized}
      alt={caption}
      className={styles.image}
    />
  );
}

// ---------------------------------------------------------------------------
// Node view
// ---------------------------------------------------------------------------

function CodeChartBlockView(props: NodeViewProps) {
  const t = useTranslations("console-notebooks");
  const locale = useLocale();
  const templates = useMemo(() => codeChartTemplates(locale), [locale]);
  const { editor, getPos, node, selected } = props;
  const attrs = node.attrs as {
    source?: unknown;
    outputPng?: unknown;
    caption?: unknown;
  };
  const source = clampCodeChartSource(attrs.source);
  const outputPng = sanitizeCodeChartOutputPng(attrs.outputPng);
  const caption = clampCodeChartCaption(attrs.caption);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ source: "", caption: "" });
  const [codeOpen, setCodeOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [editable, setEditable] = useState(
    () => !editor.isDestroyed && editor.isEditable,
  );
  const runGenerationRef = useRef(0);
  const runningRef = useRef(false);
  const [failure, setFailure] = useState<CodeChartRunOutcome["failure"]>("");
  const [failureDetail, setFailureDetail] = useState("");

  const openEditor = useCallback(() => {
    if (!editable || !editor.isEditable) return;
    setDraft({ source, caption });
    setEditing(true);
  }, [caption, editable, editor, source]);

  const cancelEditor = useCallback(() => {
    setDraft({ source: "", caption: "" });
    setEditing(false);
  }, []);

  // The chart's result is written to the node as it is when the run ends,
  // found by position: the node object a run started with is often replaced
  // meanwhile (a save's read-back, the room, pagination), and a write keyed
  
  // A result whose script was changed meanwhile is stale and not written.
  const nodeRef = useRef(node);
  useLayoutEffect(() => {
    nodeRef.current = node;
  }, [node]);
  const writeResult = useCallback((ranSource: string, patch: Record<string, unknown>): boolean => {
    const current = nodeRef.current;
    if (clampCodeChartSource(current.attrs.source) !== ranSource && !("source" in patch)) return true;
    return Boolean(updateCurrentNodeViewAttributes(editor, getPos, current, "codeChart", patch));
  }, [editor, getPos]);

  useEffect(() => {
    const syncEditable = () => {
      const next = !editor.isDestroyed && editor.isEditable;
      setEditable(next);
      if (next) return;
      cancelEditor();
      runGenerationRef.current += 1;
      if (runningRef.current) interruptPython(CODE_CHART_NAMESPACE);
      runningRef.current = false;
      setRunning(false);
    };
    const unsubscribe = subscribeEditorSurfaceEditable(editor, syncEditable);
    return () => {
      unsubscribe();
    };
  }, [cancelEditor, editor]);

  useEffect(
    () => () => {
      runGenerationRef.current += 1;
      if (runningRef.current) interruptPython(CODE_CHART_NAMESPACE);
      runningRef.current = false;
    },
    [],
  );

  const applyEditor = useCallback(() => {
    const changed = updateCurrentNodeViewAttributes(
      editor,
      getPos,
      node,
      "codeChart",
      {
        source: clampCodeChartSource(draft.source),
        caption: clampCodeChartCaption(draft.caption),
      },
    );
    if (changed) setEditing(false);
  }, [draft, editor, getPos, node]);

  const run = useCallback(async () => {
    if (runningRef.current || !editable || !editor.isEditable) return;
    const generation = runGenerationRef.current + 1;
    runGenerationRef.current = generation;
    runningRef.current = true;
    setRunning(true);
    setFailure("");
    setFailureDetail("");
    const activeSource = editing ? clampCodeChartSource(draft.source) : source;
    const outcome = await executeCodeChart(activeSource);
    if (
      runGenerationRef.current !== generation ||
      editor.isDestroyed ||
      !editor.isEditable
    ) {
      return;
    }
    runningRef.current = false;
    setRunning(false);
    if (outcome.failure) {
      setFailure(outcome.failure);
      setFailureDetail(outcome.detail);
      return;
    }
    // Persist source + captured PNG together so the stored pair is always
    // the reproducible (code, image) unit the spec requires.
    const patch = editing
      ? {
          source: activeSource,
          caption: clampCodeChartCaption(draft.caption),
          outputPng: outcome.outputPng,
        }
      : { outputPng: outcome.outputPng };
    if (!writeResult(activeSource, patch)) {
      setFailure("error");
      setFailureDetail("");
    }
  }, [draft, editable, editing, editor, source, writeResult]);

  const shownSource = editing ? draft.source : source;
  const shownCaption = editing ? draft.caption : caption;

  return (
    <NodeViewWrapper
      // Selected, it wears the selection outline pictures, shapes and charts
      // wear (OfficeDrawingSelection); the card border itself never changes.
      className={`code-chart-block-wrapper ${styles.host} ${officeDrawingSelectionStyles.selectedHost}`}
      data-testid="code-chart-block"
      data-selected={selected || undefined}
    >
      <div
        className={`${officeDialogClassName({ tone: "document" })} office-dialog--embedded ${styles.card}`}
      >
        <CodeChartOutput
          outputPng={outputPng}
          caption={shownCaption}
          running={running}
          failure={failure}
          failureDetail={failureDetail}
          labels={{
            notRun: t("block.codeChart.notRun"),
            running: t("block.codeChart.running"),
            runFailedPrefix: t("block.codeChart.runFailed"),
            noImage: t("block.codeChart.noImage"),
            oversized: t("block.codeChart.oversized"),
          }}
        />
        {shownCaption ? (
          <p
            className={`code-chart-block__caption ${styles.caption}`}
            data-testid="code-chart-block-caption"
          >
            {shownCaption}
          </p>
        ) : null}
        {codeOpen || editing ? (
          <pre
            data-testid="code-chart-source-panel"
            className={`${officeDialogParts.mono} ${styles.source}`}
          >
            <code>{shownSource}</code>
          </pre>
        ) : null}
        {editing ? (
          <CodeChartSourceEditor
            source={draft.source}
            caption={draft.caption}
            labels={{
              sourceLabel: t("block.codeChart.sourceLabel"),
              sourceHint: t("block.codeChart.sourceHint"),
              captionLabel: t("block.codeChart.captionLabel"),
              templateLabel: t("block.codeChart.template"),
              templateName: (id) => t(`block.codeChart.template_${id}`),
              done: t("block.codeChart.done"),
              cancel: t("common.cancel"),
            }}
            templates={templates}
            disabled={!editable}
            onChange={setDraft}
            onCancel={cancelEditor}
            onDone={applyEditor}
          />
        ) : null}
        <div className={styles.actions}>
          <button
            type="button"
            className={`code-chart-block__run ${officeDialogParts.primaryButton} office-dialog__button--compact`}
            data-testid="code-chart-run"
            disabled={running || !editable}
            onClick={run}
          >
            {running ? t("block.codeChart.running") : t("block.codeChart.run")}
          </button>
          <button
            type="button"
            data-testid="code-chart-toggle-source"
            className={officeDialogParts.compactButton}
            onClick={() => setCodeOpen((value) => !value)}
          >
            {codeOpen
              ? t("block.codeChart.hideSource")
              : t("block.codeChart.showSource")}
          </button>
          {!editing ? (
            <button
              type="button"
              className={`code-chart-block__edit ${officeDialogParts.compactButton}`}
              data-testid="code-chart-edit-source"
              disabled={!editable}
              onClick={openEditor}
            >
              {t("block.codeChart.editSource")}
            </button>
          ) : null}
        </div>
      </div>
    </NodeViewWrapper>
  );
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

















const CodeChartBlock = Node.create({
  name: "codeChart",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      source: { default: CODE_CHART_STARTER_SOURCE },
      outputPng: { default: "" },
      caption: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="codeChart"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "codeChart" }),
    ];
  },

  addNodeView() {
    return reactNodeViewWithLivePosition(CodeChartBlockView);
  },
});

export default CodeChartBlock;
