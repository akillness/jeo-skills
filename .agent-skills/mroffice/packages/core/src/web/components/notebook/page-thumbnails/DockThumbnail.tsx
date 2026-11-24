"use client";

















/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";

import { PageTypeArtwork } from "../PageTypeArtwork";
import { requestDockThumbnailTurn, usePageContentVersion } from "../../../lib/dock-thumbnails";
import {
  PageThumbnail,
  loadPageThumbnail,
  pageThumbnailStatus,
  type PageThumbnailPage,
} from "./PageThumbnail";
import styles from "./DockThumbnail.module.css";

export interface DockThumbnailPage {
  id: string;
  title: string;
  page_type: string;
  page_variant?: string | null;
  /** The caller's own row's version, when it has one. */
  content_version?: number | null;
}

export function DockThumbnail({
  page,
  fallback,
  className,
}: {
  page: DockThumbnailPage;
  /** What the tile shows while there is no picture: its format icon. */
  fallback: ReactNode;
  className?: string;
}) {
  const version = usePageContentVersion(page.id, page.content_version);
  const wanted: PageThumbnailPage = {
    id: page.id,
    title: page.title,
    page_type: page.page_type,
    content_version: version,
  };
  const status = pageThumbnailStatus(wanted);
  // the last picture made here: shown while a newer version's is made
  const [made, setMade] = useState<PageThumbnailPage | null>(null);
  const shown =
    status === "picture" ? wanted : status === "blank" || made?.id !== page.id ? null : made;
  const hostRef = useRef<HTMLSpanElement>(null);
  const visible = useOnScreen(hostRef);

  const needed = visible && status === "none";
  useEffect(() => {
    if (!needed) return;
    const target = { ...wanted };
    let alive = true;
    const cancel = requestDockThumbnailTurn((done) => {
      if (!alive) {
        done();
        return;
      }
      void loadPageThumbnail(target)
        .catch(() => false)
        .then((picture) => {
          if (alive) setMade(picture ? target : null);
        })
        .finally(done);
    });
    return () => {
      alive = false;
      cancel();
    };
    // the page's identity, type and version are what a picture is of
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needed, page.id, page.page_type, version]);

  return (
    <span
      ref={hostRef}
      className={[styles.host, className].filter(Boolean).join(" ")}
      data-state={shown ? "picture" : "icon"}
      data-testid="dock-thumbnail"
      aria-hidden="true"
    >
      {shown ? (
        <DockStack
          badge={
            <PageTypeArtwork
              pageType={page.page_type}
              variant={page.page_variant}
              className={styles.badge}
            />
          }
        >
          <PageThumbnail page={shown} variant="dock" className={styles.card} />
        </DockStack>
      ) : (
        fallback
      )}
    </span>
  );
}

/**
 * Whether a tile is on screen (or about to be), as it scrolls in and out of
 * its list: a picture is asked for only while it is, so a long list scrolled
 * past leaves no queue of pictures behind it. A list that is not laid out
 * (the sidebar's other layout) never intersects, so nothing is read for it.
 */
export function useOnScreen(hostRef: RefObject<Element | null>): boolean {
  const [visible, setVisible] = useState(() => typeof IntersectionObserver !== "function");
  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof IntersectionObserver !== "function") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const last = entries[entries.length - 1];
        if (last) setVisible(last.isIntersecting);
      },
      { rootMargin: "96px" },
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, [hostRef]);
  return visible;
}

/** The little stack of paper a file's picture stands on, its format in the
 *  corner: `children` is the picture, `badge` the format's glyph (given
 *  styles.badge's class: dockBadgeClass). */
export function DockStack({ children, badge }: { children: ReactNode; badge: ReactNode }) {
  return (
    <span className={styles.stack}>
      {children}
      {badge}
    </span>
  );
}

/** The class a picture (dockCardClass) and a badge (dockBadgeClass) take on
 *  a DockStack. */
export const dockCardClass = styles.card;
/** With dockCardClass, an <img> as the picture, fitted to the box. */
export const dockImageClass = styles.image;
export const dockBadgeClass = styles.badge;
export const dockHostClass = styles.host;

/**
 * A saved page in a file list, drawn as itself (DockThumbnail) with its
 * format icon (`artworkClassName`, the row's own icon size) until then and
 * wherever it cannot be; a page still on its way in (`pending`, an import's
 * placeholder) or with no saved page behind it keeps the icon.
 */
export function PageMiniature({
  page,
  pending = false,
  artworkClassName,
  className,
}: {
  page: DockThumbnailPage | null;
  pending?: boolean;
  artworkClassName?: string;
  /** Sets the row's --dock-box (and --dock-badge). */
  className?: string;
}) {
  const icon = (
    <PageTypeArtwork
      pageType={page?.page_type ?? "document"}
      variant={page?.page_variant}
      className={artworkClassName}
    />
  );
  if (!page?.id || pending) return icon;
  return <DockThumbnail page={page} fallback={icon} className={className} />;
}
