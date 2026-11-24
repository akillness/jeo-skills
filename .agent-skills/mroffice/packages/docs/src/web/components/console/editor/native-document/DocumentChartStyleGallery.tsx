"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { memo, useEffect, useMemo, useState, useSyncExternalStore, type ReactElement, type ReactNode } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { OfficeStyleGallery } from "@mrnote/core/web/components/office-ribbon/OfficeStyleGallery.tsx";
import type { ChartBlockAttrsV2 } from "@mrnote/core/web/components/console/editor/extensions/chartBlockShared.ts";
import type { ChartNativeLook } from "@mrnote/core/web/lib/office-chart-native-look.ts";
import { requestChartGalleryTile } from "@mrnote/core/web/lib/office-charts/chart-picture-client.ts";
import { EngineUnavailableError } from "@mrnote/core/web/lib/engine-host/client.ts";
import { namespaceChartPictureIds, sanitizeChartPicture } from "@mrnote/core/web/lib/office-charts/chart-picture-sanitize.ts";
import {
  activeDocumentChartStyle,
  documentChartQuickStylesFor,
  documentChartStyleAttrs,
  documentChartStyleLabel,
  documentChartStylesFor,
  type DocumentChartStyleId,
} from "@mrnote/core/web/components/console/editor/native-document/documentChartStyles.ts";
import styles from "./DocumentChartStyleGallery.module.css";

/** What a tile shows: the chart itself, or the style's own colours. */
type StylePicture =
  | { kind: "image"; markup: string }
  | { kind: "swatch"; background: string; colors: readonly string[] };

/** The size a chart is drawn at on its page (px). */
export interface ChartStyleGallerySize {
  readonly width: number;
  readonly height: number;
}

let tileSerial = 0;

// Whether the last tile asked for could not be drawn for want of a
// connection: the gallery then says so once (WAVE2-COMMON's "needs a
// connection" word), and the tiles keep an empty frame.
let galleryOffline = false;
const offlineListeners = new Set<() => void>();
function setGalleryOffline(value: boolean): void {
  if (galleryOffline === value) return;
  galleryOffline = value;
  for (const listener of offlineListeners) listener();
}
function useGalleryOffline(): boolean {
  return useSyncExternalStore(
    (listener) => {
      offlineListeners.add(listener);
      return () => offlineListeners.delete(listener);
    },
    () => galleryOffline,
    () => false,
  );
}

const pictures = new Map<string, Promise<StylePicture>>();
function chartStylePicture(
  attrs: ChartBlockAttrsV2,
  look: ChartNativeLook | undefined,
  lookKey: string,
  themeAccents: readonly string[] | undefined,
  size: ChartStyleGallerySize | undefined,
): Promise<StylePicture> {
  const key = `${lookKey}|${themeAccents?.join(",") ?? ""}|${size ? `${size.width}x${size.height}` : ""}|${JSON.stringify(attrs)}`;
  const existing = pictures.get(key);
  if (existing) return existing;
  const pending = (async (): Promise<StylePicture> => {
    // The tile is the chart as the canvas draws it (its imported look, and
    // the host document's theme a Change Colors pick resolves against),
    // drawn by the server's chart engine: every tile of one gallery open in
    // one request. A 3-D chart's tile is the style's own colours.
    // Office's gallery is the chart itself in each style: laid out at the
    // size it has on the page and shown smaller. Laid out at the tile's own
    // 576 x 328, a slide chart's words stood three times as large against
    // its plot and crowded it.
    const tile = await requestChartGalleryTile({
      attrs: attrs as unknown as Record<string, unknown>,
      ...(look ? { nativeLook: look as unknown as Record<string, unknown> } : {}),
      ...(themeAccents?.length ? { themeAccents } : {}),
      ...(size ? { width: size.width, height: size.height } : {}),
    });
    if (!tile) throw new Error("chart_gallery_tile_refused");
    if (tile.kind === "swatch") return tile;
    // Inline, as the canvas shows the chart (`sanitizeChartPicture`): an
    // <img> of the SVG cannot reach the page's fonts, and every tile's words
    // fell back to the system's serif. Its ids are its own; it keeps its
    // proportions inside the tile.
    const width = tile.width ?? size?.width ?? 576;
    const height = tile.height ?? size?.height ?? 328;
    tileSerial += 1;
    // Its size is stated inline: the gallery's icon rule (`.preview svg`:
    // 24px, max 24px) won over the root's width="100%", and the chart shrank
    // to a 24px square in the tile's corner once the tile stopped being an
    // <img>; its max sizes are lifted too.
    const markup = namespaceChartPictureIds(sanitizeChartPicture(tile.svg, width, height), `chart-style-tile-${tileSerial}`)
      .replace(/preserveAspectRatio="none"/, 'preserveAspectRatio="xMidYMid meet"')
      .replace(/^(\s*<svg\b)/, '$1 style="display:block;width:100%;height:100%;max-width:none;max-height:none"');
    return { kind: "image", markup };
  })();
  if (pictures.size >= 36) pictures.delete(pictures.keys().next().value!);
  pictures.set(key, pending);
  pending.catch(() => {
    if (pictures.get(key) === pending) pictures.delete(key);
  });
  return pending;
}

/** A stable, cheap identity for a look, so one chart's tiles share a cache entry. */
function nativeLookKey(look: ChartNativeLook | undefined): string {
  if (!look) return "";
  let hash = 2166136261;
  const text = JSON.stringify(look);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${text.length}:${(hash >>> 0).toString(36)}`;
}

/** "WxH" to a size, `undefined` for "" or anything else. */
function sizeOf(key: string): ChartStyleGallerySize | undefined {
  const match = /^(\d{2,5})x(\d{2,5})$/.exec(key);
  return match ? { width: Number(match[1]), height: Number(match[2]) } : undefined;
}

/** A chart size as a stable key, rounded to whole px. */
function sizeKeyOf(size: ChartStyleGallerySize | undefined): string {
  return size && size.width >= 1 && size.height >= 1 ? `${Math.round(size.width)}x${Math.round(size.height)}` : "";
}

const Preview = memo(function Preview({
  serialized,
  look,
  lookKey,
  accentsKey,
  sizeKey,
}: {
  /** The chart's size on its page, "WxH" ("" when the host does not say). */
  sizeKey: string;
  serialized: string;
  look?: ChartNativeLook;
  lookKey: string;
  /** The host theme's accents, comma-joined ("" when the host states none). */
  accentsKey: string;
}) {
  const [picture, setPicture] = useState<
    { key: string; value: StylePicture | null } | null
  >(null);
  const key = `${lookKey}|${accentsKey}|${sizeKey}|${serialized}`;
  useEffect(() => {
    let cancelled = false;
    void chartStylePicture(
      JSON.parse(serialized) as ChartBlockAttrsV2,
      look,
      lookKey,
      accentsKey ? accentsKey.split(",") : undefined,
      sizeOf(sizeKey),
    )
      .then((value) => {
        setGalleryOffline(false);
        if (!cancelled) setPicture({ key, value });
      })
      .catch((error: unknown) => {
        if (error instanceof EngineUnavailableError && error.reason === "offline") setGalleryOffline(true);
        if (!cancelled) setPicture({ key, value: null });
      });
    return () => {
      cancelled = true;
    };
    // `serialized` and `lookKey` are the identity of `look`; the object itself
    // is rebuilt on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, serialized, lookKey, accentsKey, sizeKey]);
  if (picture?.key !== key)
    return (
      <span className={styles.loading} aria-hidden="true">
        …
      </span>
    );
  // Not drawn (no connection, or refused): an empty frame, never a tile
  // that pretends to load forever.
  if (picture.value === null)
    return <span className={styles.picture} aria-hidden="true" data-testid="document-chart-style-undrawn" />;
  if (picture.value.kind === "image")
    return (
      <span
        className={styles.picture}
        aria-hidden="true"
        data-testid="document-chart-style-picture"
        // Sanitized and id-namespaced (`chartStylePicture`).
        dangerouslySetInnerHTML={{ __html: picture.value.markup }}
      />
    );
  const { background, colors } = picture.value;
  return (
    <svg
      className={styles.picture}
      viewBox="0 0 576 328"
      role="img"
      aria-hidden="true"
      data-testid="document-chart-style-swatch"
      preserveAspectRatio="none"
    >
      <rect x="0" y="0" width="576" height="328" fill={background} />
      {colors.map((color, index) => (
        <rect
          key={`${color}-${index}`}
          x={72 + index * ((432 - 24) / Math.max(1, colors.length))}
          y={104 + index * 36}
          width={(432 - 24) / Math.max(1, colors.length) - 24}
          height={224 - 104 - index * 36}
          fill={color}
        />
      ))}
    </svg>
  );
});

/** Read-only renderer shared by host galleries with their own native recipes. */
export function DocumentChartStylePreview({
  attrs,
  nativeLook,
  themeAccents,
  chartSize,
}: {
  /** The chart's size on its page: the tile is that chart, shown smaller. */
  chartSize?: ChartStyleGallerySize;
  attrs: ChartBlockAttrsV2;
  /** The look an imported Office chart carries, so a tile draws what the canvas draws. */
  nativeLook?: ChartNativeLook;
  /** The host document's theme accents, which a Change Colors pick paints in. */
  themeAccents?: readonly string[];
}) {
  return (
    <Preview
      serialized={JSON.stringify(attrs)}
      look={nativeLook}
      lookKey={nativeLookKey(nativeLook)}
      accentsKey={themeAccents?.join(",") ?? ""}
      sizeKey={sizeKeyOf(chartSize)}
    />
  );
}

export function DocumentChartStyleGallery({
  attrs,
  previewAttrs = attrs,
  nativeLook,
  themeAccents,
  chartSize,
  application = "docs",
  testIdPrefix = "document-toolbar-chart-style-gallery",
  labels,
  labelFor,
  disabledReason,
  onPreview,
  onCommit,
  menuTrigger,
  menuHeader,
  menuBody,
}: {
  /** Open the gallery's menu from another control (the Chart Styles button
   * beside a chart), with Office's Style / Color tabs. */
  menuTrigger?: ReactElement;
  menuHeader?: ReactNode;
  menuBody?: ReactNode;
  attrs: ChartBlockAttrsV2;
  /** A host may bound preview-only data without truncating its editable model. */
  previewAttrs?: ChartBlockAttrsV2;
  /** The look an imported Office chart carries: a filled map's tiles need its
   * own outlines, exactly as the canvas does. */
  nativeLook?: ChartNativeLook;
  /** The host document's theme accents, which a Change Colors pick paints in. */
  themeAccents?: readonly string[];
  /**
   * The size the chart is drawn at on its page (px): each tile is the chart
   * laid out at that size and shown smaller, as Office's gallery previews
   * the chart itself. Without it the tile is laid out at the tile's own size.
   */
  chartSize?: ChartStyleGallerySize;
  application?: "docs" | "spreadsheet" | "presentation";
  testIdPrefix?: string;
  /** Hosts may supply their own copy; by default the catalogue's. */
  labels?: { title: string; more: string; unavailable: string };
  labelFor?: (id: DocumentChartStyleId) => string;
  disabledReason: string | null;
  onPreview: (id: DocumentChartStyleId | null) => void;
  onCommit: (id: DocumentChartStyleId) => void;
}) {
  const t = useTranslations("console-notebooks");
  const offline = useGalleryOffline();
  const lookKey = useMemo(() => nativeLookKey(nativeLook), [nativeLook]);
  // Each style paints the chart's own colours (a Change Colors pick against
  // the host theme's accents, an imported look's colours), so a tile shows
  // the chart as it is, in that style.
  const accentsKey = themeAccents?.join(",") ?? "";
  const sizeKey = sizeKeyOf(chartSize);
  const paint = useMemo(
    () => ({
      ...(themeAccents?.length ? { accents: themeAccents } : {}),
      ...(nativeLook ? { look: nativeLook } : {}),
    }),
    // `lookKey` and `accentsKey` are the identities of `nativeLook` and
    // `themeAccents`, which hosts rebuild on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lookKey, accentsKey],
  );
  // The chart type's own gallery: Excel's numbered styles, or MRAI's looks
  // where Excel has none for the type here.
  const choices = useMemo(
    () =>
      documentChartStylesFor(previewAttrs).map((id) => ({
        id,
        attrs: documentChartStyleAttrs(previewAttrs, id, paint),
      })),
    [previewAttrs, paint],
  );
  return (
    <OfficeStyleGallery<DocumentChartStyleId>
      application={application}
      ariaLabel={labels?.title ?? t("spreadsheet.sharedStyleCopy.chart.title")}
      className={styles.gallery}
      // Office's Chart Styles sheet: four chart thumbnails a row.
      menuGrid={{ columns: 4, thumbnail: [112, 64] }}
      menuMode="preview-only"
      disabled={disabledReason !== null}
      items={choices.map((style) => ({
        id: style.id,
        label: labelFor?.(style.id) ?? documentChartStyleLabel(t, style.id),
        disabled: !style.attrs,
        disabledReason:
          disabledReason ??
          labels?.unavailable ??
          t("spreadsheet.sharedStyleCopy.chart.unavailable"),
      }))}
      labels={{
        more: labels?.more ?? t("spreadsheet.sharedStyleCopy.chart.more"),
      }}
      quickIds={documentChartQuickStylesFor(previewAttrs)}
      menuTrigger={menuTrigger}
      menuHeader={
        offline ? (
          <>
            <div role="status" data-testid={`${testIdPrefix}-needs-connection`} className={styles.notice}>
              {t("engineHost.needsConnection")}
            </div>
            {menuHeader}
          </>
        ) : (
          menuHeader
        )
      }
      menuBody={menuBody}
      value={activeDocumentChartStyle(previewAttrs, paint)}
      renderPreview={(item) => {
        const next = choices.find((style) => style.id === item.id)?.attrs;
        return next ? (
          <Preview
            serialized={JSON.stringify(next)}
            look={nativeLook}
            lookKey={lookKey}
            accentsKey={accentsKey}
            sizeKey={sizeKey}
          />
        ) : null;
      }}
      onPreviewChange={onPreview}
      onCommit={onCommit}
      testIdPrefix={testIdPrefix}
    />
  );
}
