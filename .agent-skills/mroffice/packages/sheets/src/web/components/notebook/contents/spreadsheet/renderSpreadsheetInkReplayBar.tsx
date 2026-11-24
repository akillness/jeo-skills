"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { OfficeSemanticIcon } from "@mrnote/core/web/components/office-ribbon/icons/OfficeSemanticIcon.tsx";
import { inkReplayStep, type InkReplayTimeline } from "@mrnote/core/web/lib/office-ink-replay.ts";
import { type Dispatch, type SetStateAction } from "react";

/** What renderSpreadsheetInkReplayBar reads from SpreadsheetWindow's render scope. */
export interface RenderSpreadsheetInkReplayBarInputs {
  inkReplay: { position: number; playing: boolean; } | null;
  inkReplayTimelineValue: InkReplayTimeline | null;
  setInkReplay: Dispatch<SetStateAction<{ position: number; playing: boolean; } | null>>;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
}

/** Moved verbatim from SpreadsheetWindow's JSX: a render function (not a component), so the element tree React reconciles is unchanged. */
export function renderSpreadsheetInkReplayBar({
  inkReplay,
  inkReplayTimelineValue,
  setInkReplay,
  t,
}: RenderSpreadsheetInkReplayBarInputs) {
  return (
       inkReplay && inkReplayTimelineValue ? (
        // XLS-A032: Ink Replay's playback bar — Rewind and Forward step a
        // stroke, Play/Pause, a scrubber to start from any point, Close.
        <div
          role="toolbar"
          aria-label={t("toolbar.drawInkReplay")}
          data-testid="spreadsheet-ink-replay-bar"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              setInkReplay(null);
            }
          }}
          style={{
            position: "absolute",
            bottom: 44,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 60,
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 10px",
            background: "var(--surface, #ffffff)",
            border: "1px solid var(--border, #e5e7eb)",
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
          }}
        >
          {(
            [
              ["rewind", "spreadsheet.inkReplay.rewind", "media.next", () =>
                setInkReplay({ position: inkReplayStep(inkReplayTimelineValue, inkReplay.position, -1), playing: false })],
              [inkReplay.playing ? "pause" : "play", inkReplay.playing ? "spreadsheet.inkReplay.pause" : "spreadsheet.inkReplay.play",
                inkReplay.playing ? "media.pause" : "media.play", () =>
                setInkReplay((current) =>
                  current
                    ? current.playing
                      ? { ...current, playing: false }
                      : { position: current.position >= inkReplayTimelineValue.duration ? 0 : current.position, playing: true }
                    : current,
                )],
              ["forward", "spreadsheet.inkReplay.forward", "media.next", () =>
                setInkReplay({ position: inkReplayStep(inkReplayTimelineValue, inkReplay.position, 1), playing: false })],
            ] as const
          ).map(([id, labelKey, icon, run]) => (
            <button
              key={id}
              type="button"
              aria-label={t(labelKey)}
              title={t(labelKey)}
              data-testid={`spreadsheet-ink-replay-${id}`}
              onClick={run}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-black/5"
              style={id === "rewind" ? { transform: "scaleX(-1)" } : undefined}
            >
              <OfficeSemanticIcon semanticId={icon} size={16} />
            </button>
          ))}
          <input
            type="range"
            min={0}
            max={Math.max(1, Math.round(inkReplayTimelineValue.duration))}
            step={1}
            value={Math.round(inkReplay.position)}
            aria-label={t("spreadsheet.inkReplay.position")}
            data-testid="spreadsheet-ink-replay-position"
            onChange={(event) =>
              setInkReplay({ position: Number(event.currentTarget.value), playing: false })
            }
            style={{ width: 180 }}
          />
          <button
            type="button"
            aria-label={t("spreadsheet.inkReplay.close")}
            title={t("spreadsheet.inkReplay.close")}
            data-testid="spreadsheet-ink-replay-close"
            onClick={() => setInkReplay(null)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-black/5"
          >
            <OfficeSemanticIcon semanticId="window.close" size={14} />
          </button>
        </div>
      ) : null
  );
}
