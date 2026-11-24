"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Node, mergeAttributes } from "@tiptap/core";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import { reactNodeViewWithLivePosition } from "@mrnote/core/web/components/console/editor/extensions/reactNodeViewPosition.tsx";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import {
  captionListBuiltinKind,
  captionsForListLabel,
  isCaptionBuiltinKind,
  generatedCaptionListEntries,
  LIST_OF_FIGURES_NODE_NAME,
  normalizeCaptionListLabel,
  normalizeGeneratedCaptionListEntries,
  type CaptionListLabel,
  type GeneratedCaptionListEntry,
} from "@mrnote/core/web/components/console/editor/native-document/captions.ts";
import { collectAllCaptions } from "@mrnote/core/web/components/console/editor/native-document/fieldCaptions.ts";
import { findCrossRefTargetPos } from "@mrnote/core/web/components/console/editor/native-document/crossReferenceExtension.tsx";
import { referenceStyleCss } from "@mrnote/core/web/components/console/editor/native-document/referenceStyles.ts";
import {
  layoutTocLeaders,
  layoutTocWordLines,
  nativeGeneratedListFieldEndCss,
  nativeGeneratedListRowCss,
  TOC_LEADER_CHARACTER,
  TOC_LEADER_RUN,
} from "@mrnote/core/web/components/console/editor/extensions/TableOfContents.tsx";
import { useReferenceStyles } from "@mrnote/core/web/components/console/editor/native-document/useReferenceStyles.ts";
import {
  normalizeGeneratedListSettings,
  type GeneratedListSettings,
} from "@mrnote/core/web/components/console/editor/native-document/referenceSettings.ts";
import {
  PAGE_ROW_ATTR,
  PAGE_ROW_SLICE_ATTR,
  rowSliceStamp,
  rowSliceView,
} from "@mrnote/core/web/components/console/editor/native-document/paged/atomRowSlices.ts";
import { updateRowSlicedNodeView } from "@mrnote/core/web/components/console/editor/native-document/paged/rowSliceNodeView.ts";

/**
 * Document LIST OF FIGURES / LIST OF TABLES (Word/WPS "Insert Table of Figures")
 * — TipTap wiring. The block stores the bounded field result authored by the
 * last explicit update and lists captions of ONE kind as click-to-jump rows.
 *
 * MIRRORS the in-body Table of Contents: page-number-only refresh preserves the
 * cached caption text/membership, while an entire-table refresh rebuilds from
 * the current kind-filtered caption authority. Legacy nodes without a cache
 * retain the former live-derived fallback until their first explicit update.
 *
 * ADDITIVE: registering this adds ONE block node ("listOfFigures") carrying a
 * whitelisted `kind` plus bounded `cachedEntries`. It rides the document schema's open
 * content/attrs passthrough, so EXISTING documents — which carry none — still
 * validate and load unchanged. There is no flag: opt-in per Insert action; a
 * document with no listOfFigures node behaves (and exports) exactly as before.
 *
 * SECURITY: entry labels come from `collectCaptionsOfKind`, which funnels every
 * value through the ./captions + ./tableOfContents sanitizers, and are rendered
 * as TEXT (React/TipTap escape them) — a forged/imported caption value can never
 * break out of the DOM attribute surface or inject markup.
 */

/** Compact, order-sensitive signature of a generated field result. */
function listSignature(entries: GeneratedCaptionListEntry[]): string {
  return entries
    .map((entry) => [entry.id, entry.text, entry.pageNumber].join("|"))
    .join("\n");
}

function liveEntries(
  editor: NodeViewProps["editor"],
  kind: CaptionListLabel,
  includeLabel: boolean,
): GeneratedCaptionListEntry[] {
  return generatedCaptionListEntries(
    captionsForListLabel(collectAllCaptions(editor.state.doc), kind),
    { includeLabel },
  );
}

function GeneratedListEntryContent({
  entry,
  settings,
}: {
  entry: GeneratedCaptionListEntry;
  settings: GeneratedListSettings;
}) {
  return (
    <>
      <span className="note-editor-lof__label note-editor-toc__entry-label">
        {entry.text}
      </span>
      {settings.showPageNumbers ? (
        // Word's Table of Figures line: the words, a right tab with its
        // leader and the page number, which travel together as in a TOC row.
        <span className="note-editor-toc__tail">
          {settings.rightAlignPageNumbers ? (
            <span
              className="note-editor-lof__leader note-editor-toc__leader"
              data-leader={settings.tabLeader}
              aria-hidden
            >
              {(TOC_LEADER_CHARACTER[settings.tabLeader] ?? "").repeat(TOC_LEADER_RUN)}
            </span>
          ) : (
            <span className="note-editor-toc__separator" aria-hidden>
              {" "}
            </span>
          )}
          <span
            className="note-editor-lof__page-number note-editor-toc__page-number"
            data-testid="document-lof-page-number"
          >
            {entry.pageNumber}
          </span>
        </span>
      ) : null}
    </>
  );
}

function ListOfFiguresView(props: NodeViewProps) {
  const t = useTranslations("console-notebooks");
  const { editor, node } = props;
  const kind: CaptionListLabel = normalizeCaptionListLabel(node.attrs?.kind);
  const settings = normalizeGeneratedListSettings(node.attrs);
  const includeLabel = settings.includeLabel;
  // Word's Modify Style on "Table of Figures" (doc.attrs.referenceStyles).
  const modifiedStyle = useReferenceStyles(editor)?.TableofFigures;

  const cachedEntries = useMemo(
    () => normalizeGeneratedCaptionListEntries(node.attrs?.cachedEntries),
    [node.attrs?.cachedEntries],
  );
  const [legacyEntries, setLegacyEntries] = useState<
    GeneratedCaptionListEntry[]
  >(() => liveEntries(editor, kind, includeLabel));
  const entries = cachedEntries ?? legacyEntries;
  // Each line's leader runs from its words to the page number at the right
  // margin, measured as a table of contents row's is.
  const leadersOn = settings.showPageNumbers && settings.rightAlignPageNumbers;
  const listRef = useRef<HTMLUListElement | null>(null);
  // An imported list keeps its rows' look: their paragraphs' spacing and
  // size, on Word's single line (as a table of contents row is).
  const nativeRow = useMemo(() => nativeGeneratedListRowCss(node.attrs?.source), [node.attrs?.source]);
  const fieldEnd = useMemo(() => nativeGeneratedListFieldEndCss(node.attrs?.source), [node.attrs?.source]);
  const wordLines = nativeRow !== null;
  const layoutRows = useCallback(() => {
    if (wordLines) layoutTocWordLines(listRef.current);
    if (leadersOn) layoutTocLeaders(listRef.current);
  }, [leadersOn, wordLines]);
  useLayoutEffect(() => {
    layoutRows();
  });
  const hasRows = entries.length > 0;
  useEffect(() => {
    const list = listRef.current;
    if (!hasRows || !list) return;
    const relayout = () => layoutRows();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(relayout);
    observer?.observe(list);
    const fonts = typeof document === "undefined" ? null : document.fonts;
    fonts?.addEventListener?.("loadingdone", relayout);
    return () => {
      observer?.disconnect();
      fonts?.removeEventListener?.("loadingdone", relayout);
    };
  }, [layoutRows, hasRows]);
  // A list longer than its page flows on, entry by entry, as Word's does:
  // the page ledger repeats this node on every page the list reaches and
  // gives each copy its rows (atomRowSlices). Only the copy holding the
  // first entry draws the list's header.
  const slice = rowSliceView(entries, node.attrs);
  const opensList = slice.position === "whole" || slice.position === "head";

  // Backward compatibility only: old nodes without an authored field result
  // keep their live view until their first explicit update.
  useEffect(() => {
    if (cachedEntries !== null) return;
    const refresh = () => {
      const next = liveEntries(editor, kind, includeLabel);
      setLegacyEntries((prev) =>
        listSignature(prev) === listSignature(next) ? prev : next,
      );
    };
    refresh();
    editor.on("update", refresh);
    return () => {
      editor.off("update", refresh);
    };
  }, [cachedEntries, editor, includeLabel, kind]);

  const handleEntryClick = useCallback(
    (anchorId: string) => {
      // Resolve the caption's position exactly like a figure/table
      // cross-reference does — by index against the SAME `collectCaptions`
      // derivation — so the jump target always lines up with the displayed
      // number, even for de-duplicated ids.
      const pos = findCrossRefTargetPos(
        editor.state.doc,
        // Any caption (a custom label too) resolves as a caption target.
        isCaptionBuiltinKind(kind) ? kind : "figure",
        anchorId,
      );
      if (pos === null) return;
      // A caption is an atom; +1 lands past it, which still scrolls it into view
      // (mirrors the cross-reference jump).
      editor
        .chain()
        .focus()
        .setTextSelection(pos + 1)
        .scrollIntoView()
        .run();
    },
    [editor, kind],
  );

  // Word's table of figures has no heading of its own, and with nothing to
  // list its field reads "No table of figures entries found." in bold.
  const emptyText =
    captionListBuiltinKind(kind) === "table"
      ? t("listOfFigures.tableEmpty")
      : t("listOfFigures.figureEmpty");

  return (
    <NodeViewWrapper
      className="note-editor-lof note-editor-toc"
      data-testid="document-lof"
      data-lof-kind={kind}
      data-lof-format={settings.format}
      data-lof-include-label={includeLabel ? "true" : "false"}
      data-show-page-numbers={settings.showPageNumbers ? "true" : "false"}
      data-right-align-page-numbers={
        settings.rightAlignPageNumbers ? "true" : "false"
      }
      data-tab-leader={settings.tabLeader}
      contentEditable={false}
      {...{ [PAGE_ROW_SLICE_ATTR]: rowSliceStamp(slice.position) }}
    >
      {entries.length === 0 ? (
        opensList ? (
          <p
            className="note-editor-lof__empty note-editor-toc__empty"
            data-testid="document-lof-empty"
          >
            <strong>{emptyText}</strong>
          </p>
        ) : null
      ) : (
        <ul
          ref={listRef}
          className="note-editor-lof__list note-editor-toc__list"
          data-testid="document-lof-list"
        >
          {slice.rows.map(({ row: entry, index }) => (
            <li
              key={entry.id}
              className="note-editor-lof__item note-editor-toc__item"
              data-caption-kind={kind}
              {...{ [PAGE_ROW_ATTR]: index }}
              data-modified-style={modifiedStyle ? "true" : undefined}
              style={{ ...nativeRow, ...referenceStyleCss(modifiedStyle) }}
            >
              {settings.hyperlinks ? (
                <button
                  type="button"
                  className="note-editor-lof__link note-editor-toc__link"
                  data-toc-tail={leadersOn ? "leader" : undefined}
                  data-testid="document-lof-link"
                  data-anchor-id={entry.id}
                  onClick={() => handleEntryClick(entry.id)}
                >
                  <GeneratedListEntryContent
                    entry={entry}
                    settings={settings}
                  />
                </button>
              ) : (
                <span
                  className="note-editor-lof__link note-editor-toc__link"
                  data-toc-tail={leadersOn ? "leader" : undefined}
                  data-testid="document-lof-label"
                  data-anchor-id={entry.id}
                >
                  <GeneratedListEntryContent
                    entry={entry}
                    settings={settings}
                  />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {fieldEnd && entries.length > 0 && (slice.position === "whole" || slice.position === "tail") ? (
        <p className="note-editor-toc__field-end" aria-hidden style={fieldEnd}>
          {"\u200b"}
        </p>
      ) : null}
    </NodeViewWrapper>
  );
}

const ListOfFigures = Node.create({
  name: LIST_OF_FIGURES_NODE_NAME,
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      // The caption kind this list surfaces. Whitelisted on every edge so a
      // forged/imported value can never reach the renderer as anything but
      // "figure"/"table"; defaults to "figure" (Word's "Table of Figures").
      kind: {
        default: "figure" as CaptionListLabel,
        parseHTML: (element: HTMLElement) =>
          normalizeCaptionListLabel(element.getAttribute("data-lof-kind")),
        renderHTML: (attrs: Record<string, unknown>) => ({
          "data-lof-kind": normalizeCaptionListLabel(attrs.kind),
        }),
      },
      // Word's "Include label and number" (off = the TOC field's `\a`).
      includeLabel: {
        default: true,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-lof-include-label") !== "false",
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.includeLabel === false
            ? { "data-lof-include-label": "false" }
            : {},
      },
      // Word's Table of Figures Formats (the "table of figures" style).
      format: {
        default: "template",
        parseHTML: (element: HTMLElement) =>
          normalizeGeneratedListSettings({
            format: element.getAttribute("data-lof-format"),
          }).format,
        renderHTML: (attrs: Record<string, unknown>) => {
          const format = normalizeGeneratedListSettings(attrs).format;
          return format === "template" ? {} : { "data-lof-format": format };
        },
      },
      hyperlinks: {
        default: true,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-lof-hyperlinks") !== "false",
        renderHTML: (attrs: Record<string, unknown>) => ({
          "data-lof-hyperlinks": normalizeGeneratedListSettings(attrs)
            .hyperlinks
            ? "true"
            : "false",
        }),
      },
      showPageNumbers: {
        default: true,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-lof-show-page-numbers") !== "false",
        renderHTML: (attrs: Record<string, unknown>) => ({
          "data-lof-show-page-numbers": normalizeGeneratedListSettings(attrs)
            .showPageNumbers
            ? "true"
            : "false",
        }),
      },
      rightAlignPageNumbers: {
        default: true,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-lof-right-align-page-numbers") !== "false",
        renderHTML: (attrs: Record<string, unknown>) => ({
          "data-lof-right-align-page-numbers":
            normalizeGeneratedListSettings(attrs).rightAlignPageNumbers
              ? "true"
              : "false",
        }),
      },
      tabLeader: {
        default: "dot",
        parseHTML: (element: HTMLElement) =>
          normalizeGeneratedListSettings({
            tabLeader: element.getAttribute("data-lof-tab-leader"),
          }).tabLeader,
        renderHTML: (attrs: Record<string, unknown>) => ({
          "data-lof-tab-leader": normalizeGeneratedListSettings(attrs)
            .tabLeader,
        }),
      },
      cachedEntries: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const serialized = element.getAttribute("data-lof-entries");
          if (serialized === null || serialized.length > 1_000_000) return null;
          try {
            return normalizeGeneratedCaptionListEntries(JSON.parse(serialized));
          } catch {
            return null;
          }
        },
        renderHTML: (attrs: Record<string, unknown>) => {
          const entries = normalizeGeneratedCaptionListEntries(
            attrs.cachedEntries,
          );
          return entries === null
            ? {}
            : { "data-lof-entries": JSON.stringify(entries) };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="list-of-figures"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const kind = normalizeCaptionListLabel(
      (HTMLAttributes as { "data-lof-kind"?: unknown })["data-lof-kind"],
    );
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "list-of-figures",
        "data-lof-kind": kind,
      }),
    ];
  },

  addNodeView() {
    return reactNodeViewWithLivePosition(ListOfFiguresView, {
      // A copy whose row range the page ledger changed draws its rows at
      // once: the ledger reads them in the same frame.
      update: updateRowSlicedNodeView,
    });
  },
});

export default ListOfFigures;
