"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The Insert > AI Picture dialog every editor opens: describe the picture,
 * pick its shape, let the server draw it, look at it, insert it. The dialog
 * only produces a File; the host decides where it lands (`onInsert`), exactly
 * as it would for a picture chosen from the device.
 */
import { useEffect, useRef, useState, type RefObject } from "react";
import { useTranslations } from "../../../host/next-intl";

import { OfficeDialogShell } from "../components/office-ribbon/OfficeDialogShell";
import { officeDialogParts } from "../components/office-ribbon/officeDialogChrome";
import { prefersReducedMotion } from "../__cut__/m39a24b3ce5";
import {
  AI_IMAGE_ASPECT_RATIOS,
  AiImageGenerationError,
  generateAiImageFile,
  type AiImageAspectRatio,
  type GeneratedAiImage,
} from "../__cut__/md932c2273a";

const ASPECT_RATIO_CSS: Record<AiImageAspectRatio, string> = {
  "1:1": "1 / 1",
  "16:9": "16 / 9",
  "9:16": "9 / 16",
  "4:3": "4 / 3",
};

/**
 * The painting-in-progress frame a document shows over a picture an AI run
 * is still drawing (native-document/draftPicturePending.ts, styled in
 * note-editor.css): three colour washes drifting on the paper, the AI veil's
 * light sweeping across, a brush caption. The same classes, so the dialog's
 * wait looks like the page's.
 */
function AiPicturePendingFrame({ label }: { readonly label: string }): React.JSX.Element {
  return (
    null
  );
}

const ASPECT_LABEL_KEYS = {
  "1:1": "aiImageDialog.aspectSquare",
  "16:9": "aiImageDialog.aspectWide",
  "9:16": "aiImageDialog.aspectTall",
  "4:3": "aiImageDialog.aspectStandard",
} as const;

export interface OfficeAiImageDialogProps {
  readonly open: boolean;
  /** The notebook the drawn picture is stored in; without one nothing is drawn. */
  readonly notebookId: string | null | undefined;
  readonly onInsert: (image: GeneratedAiImage) => void | Promise<void>;
  readonly onCancel: () => void;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
  readonly returnFocusTarget?: () => HTMLElement | null;
  readonly container?: HTMLElement | null;
  readonly testIdPrefix?: string;
}

export function OfficeAiImageDialog({
  open,
  notebookId,
  onInsert,
  onCancel,
  returnFocusRef,
  returnFocusTarget,
  container,
  testIdPrefix = "office-ai-image",
}: OfficeAiImageDialogProps): React.JSX.Element | null {
  const t = useTranslations("console-notebooks");
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState<AiImageAspectRatio>("1:1");
  const [generating, setGenerating] = useState(false);
  const [inserting, setInserting] = useState(false);
  const [result, setResult] = useState<GeneratedAiImage | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // A closed dialog forgets its draft and frees the preview, so the next
  // opening starts clean and no object URL outlives its picture.
  useEffect(() => {
    if (open) return;
    abortRef.current?.abort();
    abortRef.current = null;
    setPrompt("");
    setAspect("1:1");
    setGenerating(false);
    setInserting(false);
    setResult(null);
    setError(null);
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  }, [open]);
  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  const failureMessage = (failure: unknown): string => {
    if (failure instanceof AiImageGenerationError) {
      switch (failure.code) {
        case "unavailable":
          return t("aiImageDialog.errorUnavailable");
        case "exhausted":
          return t("aiImageDialog.errorExhausted", {
            used: failure.used ?? 0,
            limit: failure.limit ?? 0,
          });
        case "notebook":
          return t("aiImageDialog.errorNotebook");
        case "network":
          return t("aiImageDialog.errorNetwork");
        default:
          return failure.reason
            ? `${t("aiImageDialog.errorFailed")} (${failure.reason})`
            : t("aiImageDialog.errorFailed");
      }
    }
    return t("aiImageDialog.errorFailed");
  };

  const generate = async () => {
    const trimmed = prompt.trim();
    if (!trimmed || generating || inserting) return;
    if (!notebookId) {
      setError(t("aiImageDialog.errorNotebook"));
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setGenerating(true);
    setError(null);
    try {
      const image = await generateAiImageFile({
        notebookId,
        prompt: trimmed,
        aspectRatio: aspect,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setResult(image);
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return URL.createObjectURL(image.file);
      });
    } catch (failure) {
      if (controller.signal.aborted) return;
      setResult(null);
      setError(failureMessage(failure));
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setGenerating(false);
      }
    }
  };

  const insert = async () => {
    if (!result || inserting || generating) return;
    setInserting(true);
    try {
      await onInsert(result);
    } finally {
      setInserting(false);
    }
  };

  const canGenerate = prompt.trim().length > 0 && !generating && !inserting;
  const errorId = `${testIdPrefix}-error`;
  return (
    <OfficeDialogShell
      open={open}
      title={t("aiImageDialog.title")}
      description={t("aiImageDialog.description")}
      defaultActionLabel={t("aiImageDialog.insert")}
      cancelActionLabel={t("toolbar.cancel")}
      defaultActionDisabled={!result || generating}
      onDefaultAction={() => void insert()}
      onCancel={onCancel}
      busy={inserting}
      busyActionLabel={t("aiImageDialog.inserting")}
      initialFocusRef={promptRef}
      returnFocusRef={returnFocusRef}
      returnFocusTarget={returnFocusTarget}
      container={container}
      testIdPrefix={testIdPrefix}
      defaultActionTestId={`${testIdPrefix}-insert`}
      className="sm:max-w-[600px]"
      footerStart={
        <button
          type="button"
          className={officeDialogParts.button}
          disabled={!canGenerate}
          aria-busy={generating || undefined}
          onClick={() => void generate()}
          data-testid={`${testIdPrefix}-generate`}
        >
          {generating
            ? t("aiImageDialog.generating")
            : result
              ? t("aiImageDialog.regenerate")
              : t("aiImageDialog.generate")}
        </button>
      }
    >
      <div className="grid gap-3">
        <label className={`${officeDialogParts.field} grid gap-1.5`}>
          <span className={officeDialogParts.label}>{t("aiImageDialog.prompt")}</span>
          <textarea
            ref={promptRef}
            rows={3}
            maxLength={4000}
            value={prompt}
            disabled={generating || inserting}
            placeholder={t("aiImageDialog.promptPlaceholder")}
            aria-invalid={error ? "true" : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                void generate();
              }
            }}
            data-testid={`${testIdPrefix}-prompt`}
          />
        </label>
        <fieldset className={officeDialogParts.field}>
          <legend className={officeDialogParts.label}>{t("aiImageDialog.aspect")}</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("aiImageDialog.aspect")}>
            {AI_IMAGE_ASPECT_RATIOS.map((ratio) => (
              <label key={ratio} className="inline-flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name={`${testIdPrefix}-aspect`}
                  value={ratio}
                  checked={aspect === ratio}
                  disabled={generating || inserting}
                  onChange={() => setAspect(ratio)}
                  data-testid={`${testIdPrefix}-aspect-${ratio.replace(":", "x")}`}
                />
                {t(ASPECT_LABEL_KEYS[ratio])}
              </label>
            ))}
          </div>
        </fieldset>
        {error ? (
          <p id={errorId} role="alert" className={officeDialogParts.error} data-testid={errorId}>
            {error}
          </p>
        ) : null}
        <div
          className="relative mx-auto flex max-h-[340px] w-full items-center justify-center overflow-hidden rounded-md border border-dashed bg-muted/30"
          style={{ aspectRatio: ASPECT_RATIO_CSS[aspect] }}
          data-testid={`${testIdPrefix}-preview`}
          data-state={generating ? "generating" : result ? "ready" : "empty"}
        >
          {generating ? (
            null
          ) : previewUrl && result ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt={t("aiImageDialog.previewAlt")}
              width={result.width}
              height={result.height}
              className="max-h-[320px] max-w-full object-contain"
            />
          ) : (
            <span className="px-4 text-sm text-muted-foreground">
              {t("aiImageDialog.previewEmpty")}
            </span>
          )}
        </div>
      </div>
    </OfficeDialogShell>
  );
}
