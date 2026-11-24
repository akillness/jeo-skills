/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The paged document surface: the page sheets (ProseMirror's own nodes),
 * the handwriting cover, the watermark stamps, parity blanks, line numbers,
 * the design character styles, the header/footer bands and the footnote
 * zones, laid over the sheets from the layout state of
 * useDocumentPagedSurface.
 *
 * One component for the editor (NoteEditor) and the print surface: the
 * editor hands in its editing layers (the page-name input, the parts
 * sentinel, an AI run's live draft, the band edit layer, the follow pill)
 * as slots; the print surface hands in none. Moved unchanged out of
 * NoteEditor.tsx.
 */
"use client";

import { editorViewDom } from "@mrnote/core/web/components/console/editor/native-document/editorViewDom.ts";
import { useId, useRef, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { useOfficePatternAnchor } from "@mrnote/core/web/components/office-pattern/useOfficePatternAnchor.ts";
import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { EditorContent } from "@tiptap/react";
import { EMPTY_DOCUMENT_DEFAULT_INDENTS } from "@mrnote/core/web/components/console/editor/native-document/paragraphSetAsDefault.ts";
import { sanitizeNotePosition } from "@mrnote/core/web/components/console/editor/native-document/footnotes.ts";
import { zoomTransform } from "@mrnote/core/web/lib/editor-zoom.ts";
import { HandwritingCoverFace } from "@mrnote/core/web/components/notebook/HandwritingCoverFace.tsx";
import { handwritingPageIsDark } from "@mrnote/core/web/lib/handwriting-paper.ts";
import { normalizeSectionLayouts } from "@mrnote/core/web/components/console/editor/native-document/sectionLayouts.ts";
import ParityBlankOverlay from "./ParityBlankOverlay";
import LineNumberOverlay from "./LineNumberOverlay";
import { buildFootnoteZoneDom } from "@mrnote/core/web/components/console/editor/native-document/paged/pagedEditingExtension.ts";
import { footnoteTextStyleFromDocAttrs } from "@mrnote/core/web/components/console/editor/native-document/noteTextStyle.ts";
import type { DocumentSurfaceAttrState } from "./documentSurfaceAttrs";
import { isUsableEditor, type MaybeNoteEditor, type NoteEditorRuntime } from "./editorRuntime";
import type { UseDocumentPagedSurfaceResult as DocumentPagedSurfaceLayout } from "./useDocumentPagedSurface";
import { washoutPictureStyle } from "@mrnote/core/web/components/console/editor/native-document/watermark.ts";
import { PAPER_UNDERLAY_ATTR, paperBoxesPlaced, paperUnderlayOff, paperUnderlaySheetRule } from "@mrnote/core/web/components/console/editor/native-document/paged/paperUnderlay.ts";

/**
 * The editor's sheet at an index, read once per render: every page's note
 * zone asks for its sheet in its ref callback, which runs on every render of
 * the editor, and each asked the whole list of sheets for it. R492-D04's
 * print (1 900 sheets, 2 332 notes): 139 s of 850 s in querySelectorAll. The
 * list is kept until the end of the task that read it; the sheets do not
 * change while React calls the callbacks of one commit.
 */
let sheetsRead: { root: HTMLElement; children: number; sheets: NodeListOf<HTMLElement> } | null = null;
function editorSheetAt(root: HTMLElement | null | undefined, index: number): HTMLElement | undefined {
  if (!root) return undefined;
  const kept = sheetsRead;
  // A list read before the editor's pages changed in the same task (a sheet
  // added, taken away or drawn again) is read again.
  if (kept && kept.root === root && kept.children === root.childElementCount) {
    const sheet = kept.sheets[index];
    if (!sheet || sheet.parentElement === root) return sheet;
  }
  const read = { root, children: root.childElementCount, sheets: root.querySelectorAll<HTMLElement>(":scope > article[data-page-sheet]") };
  if (!sheetsRead) queueMicrotask(() => { sheetsRead = null; });
  sheetsRead = read;
  return read.sheets[index];
}


export interface DocumentPagedSurfaceProps {
  bandEditScope: DocumentPagedSurfaceLayout["bandEditScope"];
  bandEditing: DocumentPagedSurfaceLayout["bandEditing"];
  bandEditingSheetRule: DocumentPagedSurfaceLayout["bandEditingSheetRule"];
  bandOwnsPageNumber: DocumentPagedSurfaceLayout["bandOwnsPageNumber"];
  bestEffortSheetLayout: DocumentPagedSurfaceLayout["bestEffortSheetLayout"];
  columnSeparator: DocumentSurfaceAttrState["columnSeparator"];
  columnSeparatorStyle: DocumentPagedSurfaceLayout["columnSeparatorStyle"];
  columns: DocumentSurfaceAttrState["columns"];
  columnsStyle: DocumentPagedSurfaceLayout["columnsStyle"];
  designCharacterStyleRule: DocumentPagedSurfaceLayout["designCharacterStyleRule"];
  detachedPagePreviewActive: boolean;
  docDefaultIndents: DocumentSurfaceAttrState["docDefaultIndents"];
  docDefaultKinsoku: DocumentSurfaceAttrState["docDefaultKinsoku"];
  docDefaultTextAlign: DocumentSurfaceAttrState["docDefaultTextAlign"];
  docGridInTables: DocumentPagedSurfaceLayout["docGridInTables"];
  docGridLinePitchPx: DocumentPagedSurfaceLayout["docGridLinePitchPx"];
  docPageViewMode: "single" | "multiple-pages";
  docStrictKinsoku: DocumentSurfaceAttrState["docStrictKinsoku"];
  docZoom: number;
  documentLayoutViewMode: "print" | "web" | "outline" | "draft";
  editor: MaybeNoteEditor;
  effectiveCharacterSpacingControl: DocumentPagedSurfaceLayout["effectiveCharacterSpacingControl"];
  enableGuestBandEditing: boolean;
  footerText: DocumentSurfaceAttrState["footerText"];
  guestMode: boolean;
  handlePageSurfaceMouseDown: ((event: ReactMouseEvent<HTMLDivElement>) => void) | undefined;
  handwriting: DocumentSurfaceAttrState["handwriting"];
  handwritingCoverRef: DocumentSurfaceAttrState["handwritingCoverRef"];
  headerFooterDocumentTextVisible: DocumentPagedSurfaceLayout["headerFooterDocumentTextVisible"];
  headerText: DocumentSurfaceAttrState["headerText"];
  manuscriptGrid: DocumentSurfaceAttrState["manuscriptGrid"];
  manuscriptGridOn: DocumentPagedSurfaceLayout["manuscriptGridOn"];
  manuscriptGridStyle: DocumentPagedSurfaceLayout["manuscriptGridStyle"];
  pageMargins: DocumentSurfaceAttrState["pageMargins"];
  pageOrientation: DocumentSurfaceAttrState["pageOrientation"];
  pageSize: DocumentSurfaceAttrState["pageSize"];
  pageSurfaceStyle: DocumentPagedSurfaceLayout["pageSurfaceStyle"];
  pictureWatermark: DocumentSurfaceAttrState["pictureWatermark"];
  plainFooterTokens: DocumentPagedSurfaceLayout["plainFooterTokens"];
  plainHeaderTokens: DocumentPagedSurfaceLayout["plainHeaderTokens"];
  richBands: DocumentPagedSurfaceLayout["richBands"];
  sectionBands: DocumentPagedSurfaceLayout["sectionBands"];
  sheetBandBoxes: DocumentPagedSurfaceLayout["sheetBandBoxes"];
  sheetBandOverlay: DocumentPagedSurfaceLayout["sheetBandOverlay"];
  sheetFootnoteHooksRef: DocumentPagedSurfaceLayout["sheetFootnoteHooksRef"];
  sheetFootnoteZones: DocumentPagedSurfaceLayout["sheetFootnoteZones"];
  sheetNoteContinuationPages: DocumentPagedSurfaceLayout["sheetNoteContinuationPages"];
  sheetPageNumbering: DocumentPagedSurfaceLayout["sheetPageNumbering"];
  showPageNumbers: DocumentSurfaceAttrState["showPageNumbers"];
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  title: string;
  usableEditor: NoteEditorRuntime | null;
  verticalText: DocumentPagedSurfaceLayout["verticalText"];
  watermark: DocumentSurfaceAttrState["watermark"];
  watermarkStyle: DocumentPagedSurfaceLayout["watermarkStyle"];
  writingMode: DocumentSurfaceAttrState["writingMode"];
  /** The page-name input (the editor's accessible name and autosave source). */
  titleInput?: ReactNode;
  /** A document held as parts: the sentinel that loads the next part. */
  partsSentinel?: ReactNode;
  /** An AI run's live draft (sections still to come). */
  liveDraft?: ReactNode;
  /** The header/footer edit layer. */
  bandEditLayer?: ReactNode;
  /** The live-draft follow pill. */
  followPill?: ReactNode;
}

export function DocumentPagedSurface({
  bandEditScope,
  bandEditing,
  bandEditingSheetRule,
  bandOwnsPageNumber,
  bestEffortSheetLayout,
  columnSeparator,
  columnSeparatorStyle,
  columns,
  columnsStyle,
  designCharacterStyleRule,
  detachedPagePreviewActive,
  docDefaultIndents,
  docDefaultKinsoku,
  docDefaultTextAlign,
  docGridInTables,
  docGridLinePitchPx,
  docPageViewMode,
  docStrictKinsoku,
  docZoom,
  documentLayoutViewMode,
  editor,
  effectiveCharacterSpacingControl,
  enableGuestBandEditing,
  footerText,
  guestMode,
  handlePageSurfaceMouseDown,
  handwriting,
  handwritingCoverRef,
  headerFooterDocumentTextVisible,
  headerText,
  manuscriptGrid,
  manuscriptGridOn,
  manuscriptGridStyle,
  pageMargins,
  pageOrientation,
  pageSize,
  pageSurfaceStyle,
  pictureWatermark,
  plainFooterTokens,
  plainHeaderTokens,
  richBands,
  sectionBands,
  sheetBandBoxes,
  sheetBandOverlay,
  sheetFootnoteHooksRef,
  sheetFootnoteZones,
  sheetNoteContinuationPages,
  sheetPageNumbering,
  showPageNumbers,
  t,
  title,
  usableEditor,
  verticalText,
  watermark,
  watermarkStyle,
  writingMode,
  titleInput,
  partsSentinel,
  liveDraft,
  bandEditLayer,
  followPill,
}: DocumentPagedSurfaceProps) {
  // Pattern fills on their page's grid, one bit a CSS pixel at every zoom
  // (lib/office-pattern-anchor; PowerPoint's window, the measured truth).
  const patternAnchorRef = useRef<HTMLDivElement>(null);
  useOfficePatternAnchor(patternAnchorRef, docZoom, 1, "article[data-page-sheet]");
  // The paper as its own layer under the header, footer and watermark, which
  // are drawn under the content (paperUnderlay.ts). Paged print layout only,
  // and not on a handwriting document's paper (its sheets draw their own).
  const paperUnderlayScope = useId();
  const watermarkShown = Boolean((watermark && watermarkStyle) || pictureWatermark);
  const paperUnderlay =
    documentLayoutViewMode === "print" &&
    !handwriting &&
    (Boolean(sheetBandOverlay) || watermarkShown) &&
    sheetBandBoxes.length > 0 &&
    !paperUnderlayOff();
  const paperPlaced = paperUnderlay && paperBoxesPlaced(sheetBandBoxes);
  return (
    <div
            ref={patternAnchorRef}
            // Document content keeps its own left-to-right geometry under an
            // rtl interface (postcss-rtl-mirror.cjs mirrors only the chrome).
            dir="ltr"
            className={`note-editor-body-main${
              detachedPagePreviewActive ? " note-editor-body-main--hidden" : ""
            } note-editor-body-main--sheeted`}
            data-testid="note-editor-page-surface"
            // A shared window's pointers are placed on these pages
            // (lib/collaboration-windows/pointer-anchor).
            data-collab-pointer-surface="article[data-page-sheet]"
            onMouseDown={handlePageSurfaceMouseDown}
            data-page-size={pageSize}
            data-page-margins={pageMargins}
            data-page-orientation={pageOrientation}
            data-handwriting-paper={handwriting?.paper}
            data-handwriting-color={handwriting?.paperColor}
            data-handwriting-cover={handwriting?.cover ? "true" : undefined}
            // the first page (the cover, or the first page of paper) is dark under the pen
            data-handwriting-first-dark={handwritingPageIsDark(handwriting, 0) ? "true" : undefined}
            // A pen held on a handwriting document's page -- on its paper,
            // a picture or converted text's box -- is the pen's (held still
            // it becomes the eraser), never the platform's press and hold
            // that opens an object's menu or selects its words; a finger's
            // hold still opens the object's menu (lib/touch-hold).
            data-touch-hold-pen={handwriting ? "off" : undefined}
            data-pagination-mode={
              documentLayoutViewMode !== "print"
                ? documentLayoutViewMode
                : detachedPagePreviewActive
                  ? "preview-cards"
                  : "continuous"
            }
            data-page-view-mode={docPageViewMode}
            data-document-view-mode={documentLayoutViewMode}
            data-doc-grid={docGridLinePitchPx ? "lines" : undefined}
            data-doc-grid-tables={docGridLinePitchPx && docGridInTables ? "snap" : undefined}
            data-band-editing={bandEditing ? "true" : undefined}
            data-band-edit-scope={bandEditScope}
            data-band-document-text={
              bandEditing && !headerFooterDocumentTextVisible
                ? "hidden"
                : undefined
            }
            data-guest-band-editing={
              guestMode && enableGuestBandEditing ? "true" : undefined
            }
            data-show-page-numbers={
              showPageNumbers && !bandOwnsPageNumber ? "true" : undefined
            }
            data-sheet-header={
              (headerText || "").trim() && !richBands?.header && !sectionBands && !plainHeaderTokens
                ? "true"
                : undefined
            }
            data-sheet-footer={
              (footerText || "").trim() && !richBands?.footer && !sectionBands && !plainFooterTokens
                ? "true"
                : undefined
            }
            style={{
              ...pageSurfaceStyle,
              // One page or a two-page spread, the surface scales about its
              // top centre: every body layout centres it (flex, the split
              // grid, the narrow column), so the scaled pages stay centred.
              // The spread used to shift itself by left: 50% and
              // translateX(-50%), which assumed a start-aligned surface; in
              // the centring flex body that moved the spread left by half its
              // overflow and cut off the left page's outer edge.
              transform: zoomTransform(docZoom),
              transformOrigin: "top center",
            }}
          >
            {/* Honest notice for 竖排 / 稿纸方格 documents: the sheet
                surface renders them BEST-EFFORT (attrs preserved, no data
                loss) until the paged engine models them; the layout menu
                toggles are disabled with the same message. */}
            {bestEffortSheetLayout ? (
              <div
                className="note-editor-layout-notice"
                data-testid="note-editor-layout-notice"
                contentEditable={false}
                role="note"
              >
                {t("editor.bestEffortLayoutNotice")}
              </div>
            ) : null}
            {/* Physical sheets own their bands through the sheet pseudo-
                elements or the rich/section overlay below. The legacy flat
                header/footer would duplicate them outside the paper. */}
            {/* The page NAME is workspace metadata, owned by the window
                titlebar — never a heading printed above the paper. Keep the
                input in the DOM as the accessible page name and autosave
                source of truth, including guest demos, without reviving the
                retired outside-page title treatment. */}
            {titleInput}
            <div
              className={[
                "note-editor-content-columns",
                verticalText ? "note-editor-content-vertical" : "",
                manuscriptGridOn ? "note-editor-content-manuscript" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              data-testid="note-editor-content-columns"
              data-columns={columns}
              data-column-separator={columnSeparator ? "true" : undefined}
              data-writing-mode={writingMode}
              data-manuscript-grid={manuscriptGrid}
              data-doc-default-text-align={docDefaultTextAlign ?? undefined}
              data-doc-default-indent={
                docDefaultIndents === EMPTY_DOCUMENT_DEFAULT_INDENTS
                  ? undefined
                  : "true"
              }
              data-character-spacing-control={
                effectiveCharacterSpacingControl ?? undefined
              }
              data-doc-default-kinsoku={
                docDefaultKinsoku === null
                  ? undefined
                  : String(docDefaultKinsoku)
              }
              data-doc-strict-kinsoku={docStrictKinsoku ? "true" : undefined}
              {...(paperUnderlay ? { [PAPER_UNDERLAY_ATTR]: paperUnderlayScope } : {})}
              style={{
                ...columnsStyle,
                ...columnSeparatorStyle,
                ...manuscriptGridStyle,
                position: "relative",
              }}
            >
              {/* A handwriting document's cover, the first page: drawn under
                  that sheet (whose own paper stands aside for it), behind
                  its text and ink, and copied into it for print. */}
              {handwriting?.cover && sheetBandBoxes[0] ? (
                <div
                  className="handwriting-cover-overlay"
                  data-testid="note-editor-handwriting-cover"
                  contentEditable={false}
                  aria-hidden
                >
                  <div
                    ref={handwritingCoverRef}
                    className="handwriting-cover-overlay__page"
                    style={{
                      top: sheetBandBoxes[0].top,
                      left: sheetBandBoxes[0].left,
                      width: sheetBandBoxes[0].width,
                      height: sheetBandBoxes[0].height,
                    }}
                  >
                    <HandwritingCoverFace
                      cover={handwriting.cover}
                      title={title || t("handwriting.untitled")}
                      typeLabel={t("pages.createHandwriting")}
                      aspect={sheetBandBoxes[0].height / Math.max(1, sheetBandBoxes[0].width)}
                    />
                  </div>
                </div>
              ) : null}
              {paperUnderlay ? (
                // Each measured sheet's paper (its colour and fill), under the
                // watermark and the header and footer, which are under the
                // content; those sheets' own paper is cleared by the rule.
                <div
                  className="sheet-paper-underlay"
                  data-testid="sheet-paper-underlay"
                  contentEditable={false}
                  aria-hidden
                >
                  {paperPlaced
                    ? sheetBandBoxes.map((box, index) => (
                        <div
                          key={index}
                          className="sheet-paper"
                          data-sheet-index={index}
                          style={{ top: box.top, left: box.left, width: box.width, height: box.height }}
                        />
                      ))
                    : null}
                  {paperPlaced ? (
                    <style>{paperUnderlaySheetRule(paperUnderlayScope, sheetBandBoxes.length)}</style>
                  ) : null}
                </div>
              ) : null}
              <EditorContent editor={usableEditor} />
              {/* A document held as parts: the next part loads as this
                  comes near the viewport (useDocumentPageParts). */}
              {partsSentinel}
              {/* A page an AI run is writing: the sections still to come, as
                  ghosts on the page flow; presentation only, never saved. */}
              {liveDraft}
              {/* Word keeps a watermark in each section's header, so every
                  printed page has one, centred on that page, behind the text
                  and on the paper. The sheets are ProseMirror's own nodes, so
                  the stamps are drawn over them, one per page (a sheet a tall
                  block stretched stands for several), and blended so the
                  text stays on top (note-editor.css). */}
              {(watermark && watermarkStyle) || pictureWatermark ? (
                <div
                  className="sheet-watermark-overlay"
                  data-testid="note-editor-watermark-overlay"
                  contentEditable={false}
                  aria-hidden
                >
                  {sheetBandBoxes.flatMap((box, sheetIndex) => {
                    const edges = [box.top, ...box.seamTops, box.top + box.height];
                    return edges.slice(1).map((bottom, pageIndex) => (
                      <div
                        key={`${sheetIndex}:${pageIndex}`}
                        className="note-editor-watermark"
                        data-testid="note-editor-watermark"
                        data-sheet-index={sheetIndex}
                        data-watermark-kind={
                          watermark && watermarkStyle ? "text" : "picture"
                        }
                        style={{
                          top: edges[pageIndex],
                          left: box.left,
                          width: box.width,
                          height: bottom - edges[pageIndex],
                        }}
                      >
                        {watermark && watermarkStyle ? (
                          <span
                            className="note-editor-watermark__text"
                            style={watermarkStyle}
                          >
                            {watermark.text}
                          </span>
                        ) : pictureWatermark ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            className="note-editor-watermark__picture"
                            src={pictureWatermark.src}
                            alt=""
                            draggable={false}
                            style={{
                              width: `${pictureWatermark.widthPt}pt`,
                              height: `${pictureWatermark.heightPt}pt`,
                              // Word's Washout (gain 0.3, black level 0.35):
                              // the Washout correction, as Word prints it.
                              ...(pictureWatermark.washout ? washoutPictureStyle() : { opacity: 1 }),
                            }}
                          />
                        ) : null}
                      </div>
                    ));
                  })}
                </div>
              ) : null}
              <ParityBlankOverlay
                sheets={sheetBandBoxes}
                gapsBefore={sheetPageNumbering.gapsBefore}
                physicalStarts={sheetPageNumbering.starts}
              />
              <LineNumberOverlay
                editor={usableEditor}
                viewMode={documentLayoutViewMode}
              />
              {bandEditingSheetRule ? <style>{bandEditingSheetRule}</style> : null}
              {designCharacterStyleRule ? (
                <style data-document-design-character-styles="">
                  {designCharacterStyleRule}
                </style>
              ) : null}
              {sheetBandOverlay}
              {sheetFootnoteZones.size > 0 && sheetBandBoxes.length > 0 ? (
                // V3.4 Word 脚注区: one anchored zone per sheet carrying
                // notes, bottom of the content box (above the footer band).
                // The zone DOM is the SAME builder the painted seams use —
                // labels navigate to the in-text marker, bodies edit in
                // place and commit through the footnote store on blur. It
                // lives OUTSIDE the ProseMirror tree (sibling overlay), so
                // its events never reach PM.
                <div
                  className="sheet-footnote-overlay"
                  data-testid="sheet-footnote-overlay"
                  contentEditable={false}
                >
                  {(() => {
                    type ZoneBox = (typeof sheetBandBoxes)[number];
                    const renderZone = (planPage: number, box: ZoneBox, sheetIndex: number | null) => {
                    const notes = sheetFootnoteZones.get(planPage);
                    if (!notes || notes.length === 0) return null;
                    const zoneKey = notes
                      .map((note) => `${note.id}:${note.label}:${note.body}`)
                      .join("|");
                    return (
                      <div
                        key={`fnzone-${planPage}-${zoneKey}`}
                        data-testid={`sheet-footnote-zone-${planPage}`}
                        style={{
                          position: "absolute",
                          top: box.top,
                          left: box.left + box.paddingLeft,
                          width: Math.max(
                            0,
                            box.width - box.paddingLeft - box.paddingRight,
                          ),
                          height: box.height,
                          pointerEvents: "none",
                        }}
                      >
                        <div
                          style={{
                            position: "absolute",
                            left: 0,
                            right: 0,
                            bottom: box.paddingBottom,
                            pointerEvents: "auto",
                          }}
                          ref={(host) => {
                            if (!host) return;
                            const docAttrs = isUsableEditor(editor)
                              ? editor.state.doc.attrs
                              : null;
                            const textStyle = footnoteTextStyleFromDocAttrs(docAttrs);
                            // This callback is a new function on every render
                            // of the editor, so React calls it on every
                            // render. It used to empty the host and build the
                            // zone again each time: the render that a click
                            // into a note causes (focus, selection) replaced
                            // the note body the click had just focused, and
                            // the caret blinked once and was gone. The zone
                            // is built again only when what it shows has
                            // changed, and never under a caret that is in it.
                            const signature = JSON.stringify([
                              notes,
                              textStyle,
                              sheetFootnoteHooksRef.current.canEdit(),
                            ]);
                            const caretInside = host.contains(
                              host.ownerDocument.activeElement,
                            );
                            if (
                              host.dataset.noteZoneSignature !== signature &&
                              !caretInside
                            ) {
                              host.innerHTML = "";
                              const zone = buildFootnoteZoneDom(
                                notes,
                                sheetFootnoteHooksRef.current,
                                textStyle,
                              );
                              if (zone) {
                                // The seam class positions absolutely; inside
                                // this anchored host it must flow normally.
                                zone.style.position = "static";
                                zone.style.transform = "none";
                                host.appendChild(zone);
                              }
                              host.dataset.noteZoneSignature = signature;
                            }
                            // Word's Footnotes > "Below text": the zone
                            // follows the page's last line instead of the
                            
                            host.style.top = "";
                            host.style.bottom = `${box.paddingBottom}px`;
                            if (sheetIndex === null || !isUsableEditor(editor)) return;
                            const sheet = editorSheetAt(editorViewDom(editor), sheetIndex);
                            // A page of newspaper columns sets its notes in
                            // them (the column projection names them on the
                            // sheet; this zone is not inside it).
                            for (const name of ["--note-columns", "--note-column-gap"]) {
                              const value = sheet?.style.getPropertyValue(name) ?? "";
                              if (value) host.style.setProperty(name, value);
                              else host.style.removeProperty(name);
                            }
                            // Location is a SECTION property in Word (a
                            // section's own w:footnotePr/w:pos over the
                            // document's): read it for this sheet's section.
                            const attrsRecord = (docAttrs ?? {}) as Record<string, unknown>;
                            const sheetSection = Number(sheet?.dataset.sectionLayoutIndex);
                            const sectionPosition = Number.isInteger(sheetSection)
                              ? normalizeSectionLayouts(attrsRecord.sectionLayouts)?.[sheetSection]
                                  ?.footnotePr?.position
                              : undefined;
                            const beneathText =
                              (sectionPosition ??
                                sanitizeNotePosition("footnote", attrsRecord.footnotePosition)) ===
                              "beneathText";
                            if (!beneathText || !sheet) return;
                            const sheetRect = sheet.getBoundingClientRect();
                            const scale =
                              sheet.offsetHeight > 0 && sheetRect.height > 0
                                ? sheetRect.height / sheet.offsetHeight
                                : 1;
                            let textBottom = 0;
                            for (const child of Array.from(sheet.children)) {
                              if (!(child instanceof HTMLElement)) continue;
                              const rect = child.getBoundingClientRect();
                              if (rect.height <= 0) continue;
                              textBottom = Math.max(
                                textBottom,
                                (rect.bottom - sheetRect.top) / scale,
                              );
                            }
                            if (!(textBottom > 0)) return;
                            const maxTop =
                              box.height - box.paddingBottom - host.offsetHeight;
                            host.style.bottom = "auto";
                            host.style.top = `${Math.max(0, Math.min(textBottom, maxTop))}px`;
                          }}
                        />
                      </div>
                    );
                    };
                    const nodes = sheetBandBoxes.map((box, sheetIndex) => renderZone(sheetIndex, box, sheetIndex));
                    // Pages of continued footnote rows after the last sheet
                    
                    // the rows the ledger continued onto them.
                    const last = sheetBandBoxes[sheetBandBoxes.length - 1];
                    if (last && sheetNoteContinuationPages > 0) {
                      const gutter =
                        sheetBandBoxes.length > 1
                          ? Math.max(0, sheetBandBoxes[1].top - (sheetBandBoxes[0].top + sheetBandBoxes[0].height))
                          : 28;
                      for (let extra = 0; extra < sheetNoteContinuationPages; extra += 1) {
                        const top = last.top + (extra + 1) * (last.height + gutter);
                        const planPage = sheetBandBoxes.length + extra;
                        nodes.push(
                          <div
                            key={`fncont-sheet-${planPage}`}
                            className="note-editor-footnote-continuation-sheet"
                            data-testid="sheet-footnote-continuation-sheet"
                            data-plan-page={planPage}
                            style={{ top, left: last.left, width: last.width, height: last.height }}
                          />,
                        );
                        nodes.push(renderZone(planPage, { ...last, top }, null));
                      }
                    }
                    return nodes;
                  })()}
                </div>
              ) : null}
              {bandEditLayer}
            </div>
            {/* The reader scrolled away from the writing point: one pill
                brings them back (the window's status line says the rest). */}
            {followPill}
            {




}
          </div>
  );
}
