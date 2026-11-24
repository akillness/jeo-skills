"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Film } from "lucide-react";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

import { apiFetchRaw } from "@mrnote/core/web/lib/api.ts";
import { cropToCss, isIdentityCrop, normalizeSignedCropRect } from "@mrnote/core/web/lib/presentation-crop-group.ts";

/**
 * An imported video's poster frame on the slide (PPT-D004). PowerPoint draws
 * a video as its poster frame until it plays; MRAI keeps that picture in the
 * page's own package, so the canvas asks the page's poster route for it (the
 * export's read access, the content's fingerprint) and draws the bytes it
 * gets. Without a poster it draws the video placeholder it always did.
 */
export function PresentationVideoPoster({
  pageId,
  blockId,
  fingerprint,
  title,
  style,
  fallbackLabel,
  placeholder,
  crop,
}: {
  pageId: string;
  blockId: string;
  fingerprint: string;
  title: string;
  style: CSSProperties;
  fallbackLabel: string;
  /** Drawn while the poster loads or when there is none (a thumbnail's
   * dark frame); by default the canvas's video placeholder. */
  placeholder?: ReactNode;
  /** The part of the poster picture PowerPoint shows (the movie's
   * `p:blipFill/a:srcRect`, `posterCrop`): a signed keep rectangle. */
  crop?: unknown;
}) {
  const key = `${pageId}\u0000${blockId}\u0000${fingerprint}`;
  const [poster, setPoster] = useState<{ key: string; url: string } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    void apiFetchRaw(
      `/api/v1/pages/${encodeURIComponent(pageId)}/presentation-video-posters/${encodeURIComponent(blockId)}`,
      {},
      { suppressUnauthorizedHandling: true },
    )
      .then((response) => response.blob())
      .then((blob) => {
        if (cancelled || !/^image\/(png|jpeg|gif)$/.test(blob.type)) {
          if (!cancelled) setFailed(key);
          return;
        }
        url = URL.createObjectURL(blob);
        setPoster({ key, url });
      })
      .catch(() => {
        if (!cancelled) setFailed(key);
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [blockId, key, pageId]);
  // PowerPoint draws only the poster's kept rectangle, stretched over the
  
  // by their `a:srcRect`; the canvas and the print drew the whole picture).
  const normalized = normalizeSignedCropRect(crop);
  const keep = normalized && !isIdentityCrop(normalized) ? normalized : null;
  if (poster?.key === key && failed !== key) {
    return (
      <span
        className="presentation-window__video-poster"
        data-testid="presentation-video-poster"
        style={{ position: "relative", display: "block", ...(keep ? { overflow: "hidden" } : {}), ...style }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={poster.url}
          alt={title}
          draggable={false}
          style={keep ? { ...cropToCss(keep), display: "block", maxWidth: "none", maxHeight: "none" } : { width: "100%", height: "100%", objectFit: "fill", display: "block" }}
        />
      </span>
    );
  }
  if (placeholder !== undefined) return <>{placeholder}</>;
  return (
    <div
      className="presentation-window__embed-fallback"
      data-testid="presentation-embed-fallback"
      role="img"
      aria-label={fallbackLabel}
    >
      <Film size={20} aria-hidden="true" />
      <span>{fallbackLabel}</span>
    </div>
  );
}
