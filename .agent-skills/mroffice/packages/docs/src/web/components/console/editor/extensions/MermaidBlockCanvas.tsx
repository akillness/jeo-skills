"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { officeDialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import styles from "./CodeChartBlock.module.css";
import { EditorLoadingState } from "@mrnote/core/web/components/ui/editor-loading-state.tsx";
import { useEffect, useState } from "react";
import { useInnerHtml } from "@mrnote/core/web/lib/stable-inner-html.tsx";

/**
 * Client-only Mermaid renderer (dynamic-imported by MermaidBlock, mirroring
 * the ChartBlockV2Canvas / Excalidraw pattern so the ~1MB mermaid engine never
 * enters the main bundle).
 *
 * Security posture (non-negotiable, mirrors the spec's "无脚本" requirement):
 * - `securityLevel: "strict"` — mermaid sanitizes text and refuses script
 *   payloads / javascript: links.
 * - `htmlLabels: false` (top level + flowchart) — labels render as SVG text,
 *   never injected HTML.
 * - `bindFunctions` is deliberately never called, so click/callback
 *   directives in the DSL bind nothing.
 *
 * Errors NEVER yield a blank block: parse/render failures render the truthful
 * error message plus the source in a monospace box.
 */

let mermaidPromise: Promise<typeof import("mermaid")> | null = null;
let mermaidInitialized = false;

async function loadMermaid() {
  mermaidPromise ??= import("mermaid");
  const module_ = await mermaidPromise;
  const mermaid = module_.default;
  if (!mermaidInitialized) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      htmlLabels: false,
      flowchart: { htmlLabels: false },
    });
    mermaidInitialized = true;
  }
  return mermaid;
}

let renderSequence = 0;

type CanvasState =
  | { status: "loading" }
  | { status: "ok"; svg: string }
  | { status: "error"; message: string };

function safeMermaidSyntaxMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : "";
  const firstLine = raw
    .split(/\r?\n/u, 1)[0]
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .trim();
  return /^(?:Parse|Lexical|Syntax) error\b/iu.test(firstLine)
    ? firstLine.slice(0, 240)
    : "";
}

export interface MermaidBlockCanvasProps {
  source: string;
  /** UI copy (the node view passes translated strings). */
  loadingLabel: string;
  errorLabel: string;
}

export default function MermaidBlockCanvas({
  source,
  loadingLabel,
  errorLabel,
}: MermaidBlockCanvasProps) {
  const [state, setState] = useState<CanvasState>({ status: "loading" });
  const svgHtml = useInnerHtml(state.status === "ok" ? state.svg : null);

  useEffect(() => {
    let cancelled = false;
    // Small debounce so live editing does not re-render the engine per
    // keystroke; the trailing render always reflects the latest source.
    const timer = window.setTimeout(() => {
      void (async () => {
        let mermaid: Awaited<ReturnType<typeof loadMermaid>>;
        try {
          mermaid = await loadMermaid();
        } catch {
          if (!cancelled) setState({ status: "error", message: "" });
          return;
        }
        try {
          // Parse separately so only a bounded, recognized user syntax line
          // can enter the UI. Loader/renderer internals remain private.
          await mermaid.parse(source);
        } catch (error) {
          if (!cancelled) {
            setState({
              status: "error",
              message: safeMermaidSyntaxMessage(error),
            });
          }
          return;
        }
        try {
          renderSequence += 1;
          const { svg } = await mermaid.render(
            `mermaid-block-render-${renderSequence}`,
            source,
          );
          if (!cancelled) setState({ status: "ok", svg });
        } catch {
          if (!cancelled) setState({ status: "error", message: "" });
        }
      })();
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [source]);

  if (state.status === "loading") {
    return (
      <EditorLoadingState
        kind="graph"
        minimal
        label={loadingLabel}
        testId="mermaid-block-loading"
      />
    );
  }

  if (state.status === "error") {
    return (
      <div
        data-testid="mermaid-block-error"
        className={styles.error}
      >
        <p
          className={styles.canvasErrorTitle}
        >
          {errorLabel}
          {state.message ? `: ${state.message}` : ""}
        </p>
        <pre
          data-testid="mermaid-block-error-source"
          className={`${officeDialogParts.mono} ${styles.canvasErrorSource}`}
        >
          {source}
        </pre>
      </div>
    );
  }

  return (
    <div
      data-testid="mermaid-block-diagram"
      className={styles.diagram}
      // The SVG string comes from mermaid running with securityLevel
      // "strict" (sanitized text, no htmlLabels, no bound click handlers).
      dangerouslySetInnerHTML={svgHtml}
    />
  );
}
