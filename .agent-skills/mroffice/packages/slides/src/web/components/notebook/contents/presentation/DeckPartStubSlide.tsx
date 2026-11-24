"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A slide of a deck held as parts whose part the editor does not hold yet
 * (lib/deck-page-parts): drawn as the slide's empty frame saying so, in the
 * thumbnail rail, the slide sorter and on the stage. A part the import could
 * not read says that instead, with Retry on the stage.
 */

import { memo } from "react";

import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import type { DeckCommitRefusal } from "@mrnote/core/web/lib/deck-page-parts.ts";

type Translate = ReturnType<typeof useTranslations<"console-notebooks">>;

export type DeckStubState = "pending" | "loading" | "failed" | "retrying";

/** What a refused edit of a deck held as parts tells the member. */
export function deckPartsLockMessage(
  t: Translate,
  reason: DeckCommitRefusal["reason"],
  ordinal: number,
  /** For `structure-pending`: the slides still being read. */
  count = 0,
): string {
  switch (reason) {
    case "pending":
      return t("presentation.deckParts.lockedPending", { ordinal });
    case "loading":
      return t("presentation.deckParts.lockedLoading", { ordinal });
    case "failed":
      return t("presentation.deckParts.lockedFailed", { ordinal });
    case "read-only":
      return t("presentation.deckParts.lockedReadOnly", { ordinal });
    case "stub-copy":
      return t("presentation.deckParts.stubCopy");
    case "empty-part":
      return t("presentation.deckParts.emptyPart");
    case "structure-pending":
      return t("presentation.deckParts.structurePending", { count });
  }
}

export const DeckPartStubSlide = memo(function DeckPartStubSlide({
  t,
  ordinal,
  state,
  size,
  onRetry,
}: {
  t: Translate;
  ordinal: number;
  state: DeckStubState;
  /** `mini` in the rail and the sorter, `stage` on the slide itself. */
  size: "mini" | "stage";
  onRetry?: () => void;
}) {
  const label =
    state === "failed"
      ? t("presentation.deckParts.failedSlide")
      : state === "loading"
        ? t("presentation.deckParts.loadingSlide", { ordinal })
        : t("pages.localPreviewPendingSlide", { ordinal });
  const stage = size === "stage";
  return (
    <span
      data-testid={stage ? "presentation-deck-stub-stage" : "presentation-deck-stub-mini"}
      className="presentation-window__deck-stub"
      data-deck-stub-state={state}
      role={stage ? "status" : undefined}
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: stage ? 16 : 0,
        padding: stage ? 24 : 4,
        boxSizing: "border-box",
        background:
          "linear-gradient(110deg, color-mix(in srgb, currentColor 4%, transparent) 30%, color-mix(in srgb, currentColor 9%, transparent) 50%, color-mix(in srgb, currentColor 4%, transparent) 70%)",
        backgroundSize: "220% 100%",
        color: "#8A949E",
        textAlign: "center",
        fontSize: stage ? 28 : 7,
        lineHeight: 1.3,
        pointerEvents: stage ? "auto" : "none",
        userSelect: "none",
        overflow: "hidden",
      }}
    >
      <span>{state === "retrying" ? t("presentation.deckParts.retrying") : label}</span>
      {stage && state === "failed" && onRetry ? (
        <button
          type="button"
          className="presentation-window__deck-stub-retry"
          data-testid="presentation-deck-stub-retry"
          onClick={onRetry}
          style={{
            fontSize: 18,
            padding: "6px 18px",
            borderRadius: 6,
            border: "1px solid currentColor",
            background: "transparent",
            color: "inherit",
            cursor: "pointer",
          }}
        >
          {t("presentation.deckParts.retry")}
        </button>
      ) : null}
    </span>
  );
});
