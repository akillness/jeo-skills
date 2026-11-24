"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import {
  OfficeHomeCommand,
  OfficeHomeRibbonGroup,
} from "@mrnote/core/web/components/office-ribbon/OfficeHomeRibbon.tsx";
import {
  normalizePresentationAnimatedBackground,
  presentationAnimatedBackgroundRefusal,
  PRESENTATION_ANIMATED_BACKGROUND_MAX_POINTS,
  type PresentationAnimatedBackground,
  type PresentationFocalPoint,
} from "@mrnote/core/web/lib/presentation-animated-background.ts";
import type { PresentationImageBlock } from "@mrnote/core/web/components/console/editor/native-document/documentCommands.ts";

/** Our drawing: a picture with a viewfinder and the path between two points. */
function AnimatedBackgroundIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none">
      <rect x="2.5" y="4.5" width="19" height="15" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2.5 16.5l5-4.5 4 3.5 3-2.5 7 5" stroke="currentColor" strokeWidth="1.1" opacity="0.55" />
      <path d="M7 8.5h-1.5v1.5M17 8.5h1.5v1.5M7 15.5h-1.5V14M17 15.5h1.5V14" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="9" cy="10.5" r="1.2" fill="currentColor" />
      <circle cx="15" cy="13" r="1.2" fill="currentColor" />
      <path d="M10.2 11l3.6 1.6" stroke="currentColor" strokeWidth="1" strokeDasharray="1.2 1" />
    </svg>
  );
}

/**
 * PowerPoint for Mac's Animate as Background window: the picture, on which
 * each click sets the next point of interest (numbered as placed); Clear,
 * Cancel and Apply. Its strings are PowerPoint's (AnimatedBackgroundDialog).
 */
export function PresentationAnimatedBackgroundDialog({
  open,
  src,
  aspect,
  initial,
  onApply,
  onCancel,
}: {
  readonly open: boolean;
  readonly src: string;
  /** The picture's width over its height, as it fills the slide. */
  readonly aspect: number;
  readonly initial: PresentationAnimatedBackground | undefined;
  /** The points to animate between; empty takes the animation off. */
  readonly onApply: (points: readonly PresentationFocalPoint[]) => void;
  readonly onCancel: () => void;
}): React.JSX.Element {
  const t = useTranslations("console-notebooks");
  const [points, setPoints] = useState<readonly PresentationFocalPoint[]>(initial?.focalPoints ?? []);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const width = 480;
  const height = Math.round(width / (Number.isFinite(aspect) && aspect > 0 ? aspect : 16 / 9));
  const place = (event: MouseEvent<HTMLDivElement>) => {
    if (points.length >= PRESENTATION_ANIMATED_BACKGROUND_MAX_POINTS) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const fraction = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 1e6) / 1e6;
    setPoints([
      ...points,
      {
        x: fraction((event.clientX - rect.left) / rect.width),
        y: fraction((event.clientY - rect.top) / rect.height),
      },
    ]);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // The last point goes with Backspace / Delete (no pointer needed).
    if ((event.key === "Backspace" || event.key === "Delete") && points.length) {
      event.preventDefault();
      setPoints(points.slice(0, -1));
    }
  };
  return (
    <OfficeDialogShell
      open={open}
      title={t("presentation.animatedBackground.window")}
      description={t("presentation.animatedBackground.instruction")}
      defaultActionLabel={t("presentation.animatedBackground.apply")}
      cancelActionLabel={t("presentation.animatedBackground.cancel")}
      onDefaultAction={() => onApply(points)}
      onCancel={onCancel}
      initialFocusRef={surfaceRef}
      testIdPrefix="presentation-animated-background"
      className="sm:max-w-[540px]"
      footerStart={
        <button
          type="button"
          className={officeDialogParts.button}
          disabled={points.length === 0}
          onClick={() => setPoints([])}
          data-testid="presentation-animated-background-clear"
        >
          {t("presentation.animatedBackground.clear")}
        </button>
      }
    >
      <div
        ref={surfaceRef}
        role="application"
        tabIndex={0}
        aria-label={t("presentation.animatedBackground.instruction")}
        data-testid="presentation-animated-background-surface"
        onClick={place}
        onKeyDown={onKeyDown}
        style={{
          position: "relative",
          width,
          maxWidth: "100%",
          aspectRatio: `${width} / ${height}`,
          backgroundImage: `url("${src.replace(/"/g, "%22")}")`,
          backgroundSize: "100% 100%",
          cursor: "crosshair",
          borderRadius: 4,
          outline: "1px solid rgb(0 0 0 / 0.15)",
          margin: "0 auto",
          overflow: "hidden",
        }}
      >
        {points.map((point, index) => (
          <span
            key={`${index}-${point.x}-${point.y}`}
            data-testid="presentation-animated-background-point"
            aria-label={String(index + 1)}
            style={{
              position: "absolute",
              left: `${point.x * 100}%`,
              top: `${point.y * 100}%`,
              transform: "translate(-50%, -50%)",
              minWidth: 22,
              height: 22,
              borderRadius: 11,
              background: "rgb(0 120 212)",
              color: "#fff",
              border: "2px solid #fff",
              boxShadow: "0 1px 3px rgb(0 0 0 / 0.45)",
              font: "600 12px/18px system-ui, sans-serif",
              textAlign: "center",
              pointerEvents: "none",
            }}
          >
            {index + 1}
          </span>
        ))}
      </div>
    </OfficeDialogShell>
  );
}

/**
 * Picture Format > Animate as Background (PowerPoint for Mac, the tab's far
 * right): for one picture that fills the slide; otherwise greyed with why.
 */
export function PresentationAnimatedBackgroundGroup({
  block,
  slide,
  readOnlyReason,
  onApply,
}: {
  readonly block: PresentationImageBlock | null;
  readonly slide: { width: number; height: number };
  readonly readOnlyReason?: string;
  readonly onApply: (blockId: string, background: PresentationAnimatedBackground | null) => void;
}) {
  const t = useTranslations("console-notebooks");
  const [open, setOpen] = useState(false);
  const refusal = presentationAnimatedBackgroundRefusal(block, slide);
  const disabledReason = readOnlyReason ?? (refusal ? t(refusal as "presentation.animatedBackground.fillSlide") : undefined);
  const current = normalizePresentationAnimatedBackground(
    (block as { animatedBackground?: unknown } | null)?.animatedBackground,
  );
  return (
    <OfficeHomeRibbonGroup
      label={t("presentation.animatedBackground.group")}
      size="narrow"
      testId="presentation-ribbon-picture-animated-background-group"
    >
      <OfficeHomeCommand
        variant="large"
        icon={<AnimatedBackgroundIcon size={24} />}
        label={t("presentation.animatedBackground.command")}
        active={Boolean(current)}
        disabled={Boolean(disabledReason)}
        disabledReason={disabledReason}
        onClick={() => setOpen(true)}
        testId="presentation-ribbon-picture-animated-background"
      />
      {open && block ? (
        <PresentationAnimatedBackgroundDialog
          open
          src={String(block.src ?? "")}
          aspect={slide.height > 0 ? slide.width / slide.height : 16 / 9}
          initial={current}
          onCancel={() => setOpen(false)}
          onApply={(points) => {
            setOpen(false);
            onApply(block.id, points.length ? { focalPoints: [...points] } : null);
          }}
        />
      ) : null}
    </OfficeHomeRibbonGroup>
  );
}
