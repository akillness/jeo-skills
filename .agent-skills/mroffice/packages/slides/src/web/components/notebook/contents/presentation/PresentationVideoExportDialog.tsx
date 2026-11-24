"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * File > Export > Create a Video and Create an Animated GIF: PowerPoint's
 * two panes as one dialog (Microsoft Support, "Turn your presentation into a
 * video"; "Make an animated GIF from a slide show"):
 * - Video: Ultra HD (4K) 3840 x 2160, Full HD (1080p), HD (720p), Standard
 *   (480p); Use Recorded Timings, else 5 seconds spent on each slide.
 * - GIF: Extra Large, Large, Medium (the default), Small; 1 second on each
 *   slide at least; Make background transparent; slides from / to.
 * The recording is `PresentationVideoExporter`; the file downloads when it
 * is made.
 */

import { useMemo, useRef, useState, type RefObject } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { downloadBlobFile, startDownloadWhenAllowed } from "@mrnote/core/web/lib/download-file.ts";
import { toast } from "@mrnote/core/web/hooks/use-toast.ts";
import type { DeckHeaderFooter } from "@mrnote/core/web/lib/presentation-header-footer.ts";
import type { SlideMaster } from "@mrnote/core/web/lib/presentation-master.ts";
import type { DeckTheme } from "@mrnote/core/web/lib/presentation-theme.ts";
import type { SlideModel } from "@mrnote/core/web/lib/presentation/deck-model.ts";
import { isTransitionAdvanceAfterMs } from "@mrnote/core/web/lib/presentation-transitions.ts";
import {
  GIF_EXPORT_QUALITIES,
  VIDEO_EXPORT_QUALITIES,
  videoExportSupported,
  type VideoExportFormat,
} from "../../../../lib/presentation-export-video/recorder";
import { PresentationVideoExporter, type VideoExportSettings } from "./PresentationVideoExporter";

const MAX_SECONDS_PER_SLIDE = 3600;

export function PresentationVideoExportDialog({
  open,
  format,
  slides,
  theme,
  masters,
  headerFooter,
  deckSlideIds,
  title,
  returnFocusRef,
  onClose,
  peekSlideTexture,
  prefetchSlideTextures,
}: {
  readonly open: boolean;
  readonly format: VideoExportFormat;
  readonly slides: SlideModel[];
  readonly theme?: DeckTheme;
  readonly masters?: readonly SlideMaster[];
  readonly headerFooter?: DeckHeaderFooter;
  readonly deckSlideIds?: readonly string[];
  /** The deck's name: the file is called after it. */
  readonly title: string;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
  readonly peekSlideTexture?: (slide: SlideModel) => ImageBitmap | null;
  readonly prefetchSlideTextures?: (slides: readonly SlideModel[]) => void;
}): React.JSX.Element {
  const t = useTranslations("console-notebooks");
  const video = format === "mp4";
  const qualities = video ? VIDEO_EXPORT_QUALITIES : GIF_EXPORT_QUALITIES;
  const [quality, setQuality] = useState<string>(video ? "fhd" : "medium");
  const recorded = useMemo(
    () => slides.some((slide) => isTransitionAdvanceAfterMs(slide.transitionAdvanceAfterMs)),
    [slides],
  );
  const [useRecordedTimings, setUseRecordedTimings] = useState(recorded);
  const [secondsDraft, setSecondsDraft] = useState(video ? "5" : "1");
  const [transparent, setTransparent] = useState(false);
  const [fromDraft, setFromDraft] = useState("1");
  const [toDraft, setToDraft] = useState(String(Math.max(1, slides.length)));
  const [running, setRunning] = useState<VideoExportSettings | null>(null);
  const [progress, setProgress] = useState(0);
  const [failure, setFailure] = useState<string | null>(null);
  const cancelRef = useRef(false);
  const qualityRef = useRef<HTMLSelectElement | null>(null);

  const seconds = Number(secondsDraft.replace(",", "."));
  const from = Number(fromDraft);
  const to = Number(toDraft);
  const valid =
    Number.isFinite(seconds) &&
    seconds >= 0 &&
    seconds <= MAX_SECONDS_PER_SLIDE &&
    Number.isInteger(from) &&
    Number.isInteger(to) &&
    from >= 1 &&
    to >= from &&
    to <= slides.length;
  const supported = !video || videoExportSupported();
  const height = qualities.find((item) => item.id === quality)?.height ?? qualities[1]!.height;

  const close = () => {
    cancelRef.current = true;
    setRunning(null);
    onClose();
  };

  return (
    <OfficeDialogShell
      open={open}
      description=""
      title={t(video ? "presentation.videoExport.videoTitle" : "presentation.videoExport.gifTitle")}
      defaultActionLabel={t(video ? "presentation.videoExport.createVideo" : "presentation.videoExport.createGif")}
      cancelActionLabel={t("toolbar.cancel")}
      defaultActionDisabled={!valid || !supported || running !== null}
      busy={running !== null}
      busyActionLabel={t("presentation.videoExport.creating", { percent: Math.round(progress * 100) })}
      onDefaultAction={() => {
        if (!valid || !supported) return;
        cancelRef.current = false;
        setFailure(null);
        setProgress(0);
        setRunning({
          format,
          height,
          secondsPerSlide: seconds,
          useRecordedTimings: video && useRecordedTimings,
          transparent: !video && transparent,
          fromSlide: from,
          toSlide: to,
        });
      }}
      onCancel={close}
      initialFocusRef={qualityRef}
      returnFocusRef={returnFocusRef}
      testIdPrefix="presentation-video-export"
      className="sm:max-w-[420px]"
    >
      <div className="grid gap-3">
        <label className={officeDialogParts.field}>
          <span className={officeDialogParts.label}>{t("presentation.videoExport.qualityLabel")}</span>
          <select
            ref={qualityRef}
            value={quality}
            disabled={running !== null}
            onChange={(event) => setQuality(event.target.value)}
            data-testid="presentation-video-export-quality"
          >
            {qualities.map((item) => (
              <option key={item.id} value={item.id}>
                {t(`presentation.videoExport.quality.${item.id}` as "presentation.videoExport.quality.fhd")}
              </option>
            ))}
          </select>
        </label>
        {video ? (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={useRecordedTimings}
              disabled={!recorded || running !== null}
              onChange={(event) => setUseRecordedTimings(event.target.checked)}
              data-testid="presentation-video-export-recorded"
            />
            <span>{t("presentation.videoExport.useRecordedTimings")}</span>
          </label>
        ) : null}
        <label className={officeDialogParts.field}>
          <span className={officeDialogParts.label}>{t("presentation.videoExport.secondsPerSlide")}</span>
          <input
            type="number"
            min={0}
            max={MAX_SECONDS_PER_SLIDE}
            step={0.25}
            value={secondsDraft}
            disabled={running !== null}
            onChange={(event) => setSecondsDraft(event.target.value)}
            data-testid="presentation-video-export-seconds"
          />
        </label>
        {!video ? (
          <>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={transparent}
                disabled={running !== null}
                onChange={(event) => setTransparent(event.target.checked)}
                data-testid="presentation-video-export-transparent"
              />
              <span>{t("presentation.videoExport.transparent")}</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className={officeDialogParts.field}>
                <span className={officeDialogParts.label}>{t("presentation.videoExport.fromSlide")}</span>
                <input
                  type="number"
                  min={1}
                  max={slides.length}
                  value={fromDraft}
                  disabled={running !== null}
                  onChange={(event) => setFromDraft(event.target.value)}
                  data-testid="presentation-video-export-from"
                />
              </label>
              <label className={officeDialogParts.field}>
                <span className={officeDialogParts.label}>{t("presentation.videoExport.toSlide")}</span>
                <input
                  type="number"
                  min={1}
                  max={slides.length}
                  value={toDraft}
                  disabled={running !== null}
                  onChange={(event) => setToDraft(event.target.value)}
                  data-testid="presentation-video-export-to"
                />
              </label>
            </div>
          </>
        ) : null}
        {running !== null ? (
          <progress max={1} value={progress} className="w-full" data-testid="presentation-video-export-progress" />
        ) : null}
        {!supported ? (
          <p role="alert" className="text-sm">{t("presentation.videoExport.unsupported")}</p>
        ) : null}
        {failure ? (
          <p role="alert" className="text-sm" data-testid="presentation-video-export-error">
            {t("presentation.videoExport.failed")}
          </p>
        ) : null}
      </div>
      {running !== null ? (
        <PresentationVideoExporter
          slides={slides}
          theme={theme}
          masters={masters}
          headerFooter={headerFooter}
          deckSlideIds={deckSlideIds}
          settings={running}
          t={(key, values) => t(key as "presentation.export", values)}
          cancelRef={cancelRef}
          peekSlideTexture={peekSlideTexture}
          prefetchSlideTextures={prefetchSlideTextures}
          onProgress={setProgress}
          onDone={(file) => {
            setRunning(null);
            // A video takes far longer than a click's activation lasts: where
            // the browser holds the download back (iPad Safari), the shell
            // offers Save; where no download can start at all, say so rather
            // than close as if the file had been saved.
            const filename = `${(title || "Presentation").replace(/[\\/:*?"<>|]+/g, "_")}.${video ? "mp4" : "gif"}`;
            if (!startDownloadWhenAllowed(filename, () => downloadBlobFile(filename, file))) {
              toast({ title: t("presentation.videoExport.downloadFailed"), variant: "destructive" });
              return;
            }
            onClose();
          }}
          onError={(error) => {
            setRunning(null);
            if (error.message !== "cancelled") setFailure(error.message);
          }}
        />
      ) : null}
    </OfficeDialogShell>
  );
}
