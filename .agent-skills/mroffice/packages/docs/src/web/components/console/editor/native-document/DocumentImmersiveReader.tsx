"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/react";
import {
  Check,
  Minus,
  Plus,
  X,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { useLocale, useTranslations } from "@mrnote/core/host/next-intl.tsx";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type RefObject,
} from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@mrnote/core/web/components/ui/dialog.tsx";
import { OfficeSemanticIcon } from "@mrnote/core/web/components/office-ribbon/icons/OfficeSemanticIcon.tsx";
import { useIsDark } from "@mrnote/core/web/lib/theme.ts";

import type { ReadAloudController } from "@mrnote/core/web/components/console/editor/useReadAloud.ts";
import {
  DEFAULT_LIST_START,
  formatListOrdinal,
  normalizeListStart,
  normalizeListStyleType,
  numFmtForLevel,
} from "@mrnote/core/web/components/console/editor/native-document/listNumbering.ts";
import { resolveDocumentFieldDisplay, withBandDashFormat } from "@mrnote/core/web/components/console/editor/native-document/documentFieldValues.ts";
import { documentFieldViewText } from "./documentFieldExtension";
import { documentListLabels } from "./documentListLabels";
import { PROOFING_LANGUAGE_MARK } from "./proofingLanguageExtension";
import { DELETION_MARK_NAME } from "@mrnote/core/web/components/console/editor/native-document/trackChanges.ts";
import { BOOKMARK_POINT_NODE_NAME } from "@mrnote/core/web/components/console/editor/native-document/bookmarks.ts";
import styles from "./DocumentImmersiveReader.module.css";

const MAX_READER_BLOCKS = 1_500;
const MAX_READER_CHARACTERS = 300_000;
const TEXT_SIZES = [18, 22, 26, 30] as const;
const DECORATIVE_NODE_TYPES = new Set([
  "bookmark",
  // A point bookmark is a place to go to: its name is not text (WUA 032).
  BOOKMARK_POINT_NODE_NAME,
  // An editing exception's marker is no text either.
  "rangePermission",
  "doc",
  "hardPageBreak",
  "horizontalRule",
  "pageBlock",
  "pageBreak",
  "sectionBreak",
]);

export type ImmersiveReaderBlockKind =
  | "code"
  | "heading"
  | "paragraph"
  | "quote"
  | "table";

export interface ImmersiveReaderBlock {
  readonly id: string;
  readonly kind: ImmersiveReaderBlockKind;
  readonly text: string;
  readonly level?: number;
   
  readonly lang?: string;
}

/** Blocks that hold text: one with no content is empty, not unsupported. */
const TEXTBLOCK_TYPES = new Set(["paragraph", "heading", "codeBlock"]);
const LANGUAGE_TAG_RE = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8}){0,5}$/;

 
function fieldDisplayText(node: JSONContent): string {
  // The result the editing page shows, when the reader was given it.
  const live = node.attrs?.[READER_FIELD_TEXT_ATTR];
  if (typeof live === "string") return live.trim();
  try {
    return withBandDashFormat(
      node.attrs,
      resolveDocumentFieldDisplay(node.attrs, {}),
    ).trim();
  } catch {
    return "";
  }
}






function blockLanguage(node: JSONContent): string | undefined {
  let language: string | null | undefined;
  const visit = (child: JSONContent): boolean => {
    if (child.type === "text") {
      if (!(child.text ?? "").trim()) return true;
      const mark = child.marks?.find((item) => item?.type === PROOFING_LANGUAGE_MARK);
      const raw = mark?.attrs?.val;
      const value =
        typeof raw === "string" && LANGUAGE_TAG_RE.test(raw) ? raw : null;
      if (language === undefined) language = value;
      return language === value;
    }
    return (child.content ?? []).every(visit);
  };
  return visit(node) && language ? language : undefined;
}

export interface ImmersiveReaderProjection {
  readonly blocks: readonly ImmersiveReaderBlock[];
  readonly plainText: string;
  readonly unsupportedNodeCount: number;
  readonly truncated: boolean;
}

interface ProjectionBudget {
  characters: number;
  unsupported: number;
  truncated: boolean;
}

function stringAttr(node: JSONContent, ...names: readonly string[]): string {
  for (const name of names) {
    const value = node.attrs?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

 
function carriesTrackedDeletion(node: JSONContent): boolean {
  return (
    Array.isArray(node.marks) &&
    node.marks.some((mark) => mark?.type === DELETION_MARK_NAME)
  );
}

/** Where the reader's copy of the page carries a field's shown result. */
const READER_FIELD_TEXT_ATTR = "__readerText";
/** Where it carries the number a list item or heading shows in front of it. */
const READER_LIST_LABEL_ATTR = "__readerLabel";

/** The number the editing page draws in front of this textblock, if any. */
function readerListLabel(node: JSONContent | undefined): string | null {
  const label = node?.attrs?.[READER_LIST_LABEL_ATTR];
  return typeof label === "string" && label.trim() ? label.trim() : null;
}

/**
 * The page as the reader reads it, each field stating the result the editing
 * page shows: a SEQ copied after another counts on (2), while its stored
 * result is the 1 it was copied with (WUA 225); PAGE, NUMPAGES and the
 * other live fields likewise read their place in the document.
 *
 * Each numbered textblock states the number the editing page draws for it
 * (documentListLabels, the editor's own numbering walk): a list set to
 * Continue from previous list reads on from that list (2, 3), not from its
 * own stored start (WUA 252), as do lists chained across other content,
 * defined (imported) numbering, a nested level's "a)" and numbered headings.
 */
export function documentJsonWithLiveFields(doc: ProseMirrorNode): JSONContent {
  const json = doc.toJSON() as JSONContent;
  const labels = documentListLabels(doc);
  const walk = (node: ProseMirrorNode, target: JSONContent, contentStart: number) => {
    node.forEach((child, offset, index) => {
      const childJson = target.content?.[index];
      if (!childJson) return;
      const pos = contentStart + offset;
      const label = child.isTextblock ? labels.get(pos) : undefined;
      if (label !== undefined) {
        childJson.attrs = { ...(childJson.attrs ?? {}), [READER_LIST_LABEL_ATTR]: label };
      }
      if (child.type.name === "documentField") {
        childJson.attrs = {
          ...(childJson.attrs ?? {}),
          [READER_FIELD_TEXT_ATTR]: documentFieldViewText(doc, pos, child.attrs as Record<string, unknown>),
        };
      } else if (child.childCount > 0) {
        walk(child, childJson, pos + 1);
      }
    });
  };
  walk(doc, json, 0);
  return json;
}

function readableLeafText(node: JSONContent, budget: ProjectionBudget): string {
  if (carriesTrackedDeletion(node)) return "";
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  if (DECORATIVE_NODE_TYPES.has(node.type ?? "")) return "";
  // An object marked decorative (Alt Text > "Mark as decorative") is what a
  
  if (node.attrs?.decorative === true) return "";
  if (node.type === "documentField") {
    const shown = fieldDisplayText(node);
    if (shown) return shown;
  }

  // An object reads as its description or its own words. The name it is
  // given to be found by (a shape's in the Selection Pane, a whiteboard's)
  // and a picture's file name are not text of the document; only an attached
  // file shows its name on the page (WUA 032: a point bookmark's name was
  // read into the sentence it marks).
  const text = stringAttr(
    node,
    "alt",
    "altText",
    "text",
    "title",
    ...(node.type === "file" ? ["filename"] : []),
    "latex",
    "value",
  );
  if (text) return text;

  // An empty paragraph is a blank line, not an object the reader cannot show.
  if (!node.content?.length && !TEXTBLOCK_TYPES.has(node.type ?? "")) {
    budget.unsupported += 1;
  }
  return "";
}

function inlineText(node: JSONContent, budget: ProjectionBudget): string {
  if (!node.content?.length) return readableLeafText(node, budget);
  return node.content.map((child) => inlineText(child, budget)).join("");
}

/**
 * Preserve the readable boundary between top-level blocks inside one table
 * cell. Inline runs and hard breaks remain owned by {@link inlineText}; only
 * sibling cell blocks gain a single separator so two paragraphs can never be
 * spoken or displayed as one fused word.
 */
function tableCellText(node: JSONContent, budget: ProjectionBudget): string {
  if (!node.content?.length) return readableLeafText(node, budget);
  return node.content
    .map((child) => cellBlockText(child, budget).trim())
    .filter(Boolean)
    .join(" ");
}






function cellBlockText(node: JSONContent, budget: ProjectionBudget): string {
  if (
    node.type === "paragraph" ||
    node.type === "heading" ||
    node.type === "codeBlock" ||
    !node.content?.length
  ) {
    return inlineText(node, budget);
  }
  return node.content
    .map((child) => cellBlockText(child, budget).trim())
    .filter(Boolean)
    .join(" ");
}

function boundedText(value: string, budget: ProjectionBudget): string {
  const normalized = value.replace(/\u00a0/gu, " ").trim();
  if (!normalized) return "";
  const available = MAX_READER_CHARACTERS - budget.characters;
  if (available <= 0) {
    budget.truncated = true;
    return "";
  }
  const output = normalized.slice(0, available);
  budget.characters += output.length;
  if (output.length < normalized.length) budget.truncated = true;
  return output;
}

/**
 * Create a bounded, read-only reading projection from the live TipTap JSON.
 * The projection never dispatches a transaction and never invents text for
 * unsupported atoms: accessible labels are retained and unlabeled objects are
 * counted for the visible omission notice.
 */
export function projectDocumentForImmersiveReader(
  document: JSONContent,
): ImmersiveReaderProjection {
  const blocks: ImmersiveReaderBlock[] = [];
  const budget: ProjectionBudget = {
    characters: 0,
    unsupported: 0,
    truncated: false,
  };

  const append = (
    kind: ImmersiveReaderBlockKind,
    rawText: string,
    level?: number,
    lang?: string,
  ) => {
    if (blocks.length >= MAX_READER_BLOCKS) {
      budget.truncated = true;
      return;
    }
    const text = boundedText(rawText, budget);
    if (!text) return;
    blocks.push({
      id: `reader-block-${blocks.length + 1}`,
      kind,
      text,
      level,
      ...(lang ? { lang } : {}),
    });
  };

  const walkListItem = (
    node: JSONContent,
    marker: string,
    quoted: boolean,
    numbered = false,
  ) => {
    let wrotePrimary = false;
    for (const child of node.content ?? []) {
      if (child.type === "bulletList" || child.type === "orderedList") {
        walk(child, quoted);
        continue;
      }
      if (
        child.type === "paragraph" ||
        child.type === "heading" ||
        child.type === "codeBlock"
      ) {
        // The number the editing page draws, when the reader was given it;
        // a bullet keeps reading as one.
        const shown = numbered ? (readerListLabel(child) ?? marker) : marker;
        const prefix = wrotePrimary ? "" : `${shown} `;
        append(
          quoted ? "quote" : child.type === "codeBlock" ? "code" : "paragraph",
          `${prefix}${inlineText(child, budget)}`,
          undefined,
          blockLanguage(child),
        );
        wrotePrimary = true;
        continue;
      }
      walk(child, quoted);
    }
  };

  const walk = (node: JSONContent, quoted = false) => {
    if (budget.truncated && budget.characters >= MAX_READER_CHARACTERS) return;
    switch (node.type) {
      case "heading": {
        const label = readerListLabel(node);
        append(
          "heading",
          `${label ? `${label} ` : ""}${inlineText(node, budget)}`,
          Math.min(6, Math.max(1, Number(node.attrs?.level) || 1)),
          blockLanguage(node),
        );
        return;
      }
      case "paragraph":
        append(
          quoted ? "quote" : "paragraph",
          inlineText(node, budget),
          undefined,
          blockLanguage(node),
        );
        return;
      case "codeBlock":
        append("code", inlineText(node, budget));
        return;
      case "blockquote":
        for (const child of node.content ?? []) walk(child, true);
        return;
      case "bulletList":
        for (const child of node.content ?? [])
          walkListItem(child, "•", quoted);
        return;
      case "taskList":
        // A task keeps its state: a done item reads as checked, an open one
        
        for (const child of node.content ?? [])
          walkListItem(child, child.attrs?.checked === true ? "☑" : "☐", quoted);
        return;
      case "orderedList": {
        // The editor's own numbering: a list may count from 0 and may use
        
        const start = normalizeListStart(node.attrs?.start) ?? DEFAULT_LIST_START;
        const numFmt = numFmtForLevel(
          normalizeListStyleType(node.attrs?.listStyleType),
          0,
        );
        (node.content ?? []).forEach((child, index) =>
          walkListItem(
            child,
            `${formatListOrdinal(numFmt, start + index)}.`,
            quoted,
            true,
          ),
        );
        return;
      }
      case "table":
        for (const row of node.content ?? []) {
          // An empty cell keeps its place in the row (an em dash), so a
          
          const cells = (row.content ?? []).map(
            (cell) =>
              tableCellText(cell, budget).replace(/\s+/gu, " ").trim() || "—",
          );
          if (cells.some((cell) => cell !== "—")) append("table", cells.join("  ·  "));
        }
        return;
      case "image":
      case "file":
      case "documentShape":
      case "chart":
      case "visualMath":
      case "mathBlock":
      case "equation": {
        const text = readableLeafText(node, budget);
        if (text) append(quoted ? "quote" : "paragraph", text);
        return;
      }
      default:
        if (node.content?.length) {
          for (const child of node.content) walk(child, quoted);
        } else {
          // A leaf that reads as text is read (a display equation's latex
          
          const text = readableLeafText(node, budget);
          if (text) append(quoted ? "quote" : "paragraph", text);
        }
    }
  };

  walk(document);
  return {
    blocks,
    plainText: blocks.map((block) => block.text).join("\n\n"),
    unsupportedNodeCount: budget.unsupported,
    truncated: budget.truncated,
  };
}

export function hasImmersiveReaderText(document: JSONContent): boolean {
  return projectDocumentForImmersiveReader(document).blocks.length > 0;
}

type ReaderTheme = "dark" | "light" | "sepia";
type ReaderFont = "sans" | "serif";

interface DocumentImmersiveReaderCommonProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly readAloud: ReadAloudController;
  readonly returnFocusRef: RefObject<HTMLButtonElement | null>;
  /** Editor-specific close target; Docs defaults to the ribbon trigger. */
  readonly resolveReturnFocusTarget?: () => HTMLElement | null;
}

export type DocumentImmersiveReaderProps = DocumentImmersiveReaderCommonProps &
  (
    | { readonly editor: Editor; readonly projection?: never }
    | {
        readonly editor?: never;
        readonly projection: ImmersiveReaderProjection;
      }
  );

export function DocumentImmersiveReader({
  editor,
  projection: suppliedProjection,
  open,
  onOpenChange,
  readAloud,
  returnFocusRef,
  resolveReturnFocusTarget,
}: DocumentImmersiveReaderProps): React.JSX.Element {
  const t = useTranslations("console-notebooks");
  const locale = useLocale();
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const [textSizeIndex, setTextSizeIndex] = useState(1);
  const [textSpacing, setTextSpacing] = useState(false);
  // Until the reader picks a page colour, it opens in the app's own theme: a
  // dark-mode user is not met by a full-screen white sheet.
  const appDark = useIsDark();
  const [pickedTheme, setTheme] = useState<ReaderTheme | null>(null);
  const theme: ReaderTheme = pickedTheme ?? (appDark ? "dark" : "light");
  const [font, setFont] = useState<ReaderFont>("sans");
  const {
    playing: readAloudPlaying,
    stop: stopReadAloud,
    supported: readAloudSupported,
    toggle: toggleReadAloud,
  } = readAloud;
  const projection = useMemo((): ImmersiveReaderProjection => {
    if (open && suppliedProjection) return suppliedProjection;
    if (open && editor) {
      return projectDocumentForImmersiveReader(documentJsonWithLiveFields(editor.state.doc));
    }
    return {
      blocks: [],
      plainText: "",
      unsupportedNodeCount: 0,
      truncated: false,
    };
  }, [editor, open, suppliedProjection]);

  useEffect(() => {
    if (!open) stopReadAloud();
  }, [open, stopReadAloud]);

  const requestOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) stopReadAloud();
      onOpenChange(nextOpen);
    },
    [onOpenChange, stopReadAloud],
  );

  const startAtBlock = useCallback(
    (index: number) => {
      if (!readAloudSupported) return;
      const text = projection.blocks
        .slice(index)
        .map((block) => block.text)
        .join("\n\n");
      stopReadAloud();
      toggleReadAloud(text);
    },
    [projection.blocks, readAloudSupported, stopReadAloud, toggleReadAloud],
  );

  const handleBlockKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>, index: number) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      startAtBlock(index);
    },
    [startAtBlock],
  );

  const readerStyle = {
    "--immersive-reader-font-size": `${TEXT_SIZES[textSizeIndex]}px`,
  } as CSSProperties;

  return (
    <Dialog open={open} onOpenChange={requestOpenChange}>
      <DialogContent
        showCloseButton={false}
        touchScale={false}
        className={styles.dialog}
        data-reader-theme={theme}
        data-reader-spacing={textSpacing ? "wide" : "normal"}
        data-reader-font={font}
        data-testid="document-immersive-reader"
        style={readerStyle}
        onEscapeKeyDown={stopReadAloud}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          closeRef.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          const target = resolveReturnFocusTarget?.() ?? returnFocusRef.current;
          if (!target?.isConnected) return;
          event.preventDefault();
          target.focus();
        }}
      >
        <DialogTitle className={styles.srOnly}>
          {t("toolbar.immersiveReader")}
        </DialogTitle>
        <DialogDescription className={styles.srOnly}>
          {t("toolbar.immersiveReaderDescription")}
        </DialogDescription>

        <header className={styles.header}>
          <button
            ref={closeRef}
            type="button"
            className={styles.closeButton}
            onClick={() => requestOpenChange(false)}
            data-testid="document-immersive-reader-close"
            aria-label={t("toolbar.immersiveReaderExit")}
          >
            <X size={20} aria-hidden />
            <span>{t("toolbar.immersiveReaderExit")}</span>
          </button>
          <div className={styles.titleCluster} aria-hidden="true">
            <OfficeSemanticIcon semanticId="view.immersiveReader" size={24} />
            <span>{t("toolbar.immersiveReader")}</span>
          </div>
          <div
            className={styles.preferences}
            role="group"
            aria-label={t("toolbar.immersiveReaderTextPreferences")}
          >
            <span className={styles.preferenceGroup}>
              <button
                type="button"
                className={styles.preferenceButton}
                disabled={textSizeIndex === 0}
                onClick={() =>
                  setTextSizeIndex((value) => Math.max(0, value - 1))
                }
                aria-label={t("toolbar.immersiveReaderDecreaseTextSize")}
                data-testid="document-immersive-reader-text-smaller"
              >
                <Minus size={16} aria-hidden />
                <span aria-hidden="true">A</span>
              </button>
              <button
                type="button"
                className={styles.preferenceButton}
                disabled={textSizeIndex === TEXT_SIZES.length - 1}
                onClick={() =>
                  setTextSizeIndex((value) =>
                    Math.min(TEXT_SIZES.length - 1, value + 1),
                  )
                }
                aria-label={t("toolbar.immersiveReaderIncreaseTextSize")}
                data-testid="document-immersive-reader-text-larger"
              >
                <Plus size={16} aria-hidden />
                <span aria-hidden="true">A</span>
              </button>
            </span>
            <button
              type="button"
              className={styles.preferenceButton}
              aria-pressed={textSpacing}
              onClick={() => setTextSpacing((value) => !value)}
              data-testid="document-immersive-reader-spacing"
            >
              <span aria-hidden="true">A ↔ A</span>
              <span className={styles.controlLabel}>
                {t("toolbar.immersiveReaderTextSpacing")}
              </span>
            </button>
            <span className={styles.preferenceGroup}>
              {(["sans", "serif"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={styles.preferenceButton}
                  aria-pressed={font === value}
                  onClick={() => setFont(value)}
                  data-testid={`document-immersive-reader-font-${value}`}
                >
                  {t(`toolbar.immersiveReaderFont.${value}`)}
                </button>
              ))}
            </span>
            <span
              className={styles.themeGroup}
              role="group"
              aria-label={t("toolbar.immersiveReaderTextPreferences")}
            >
              {(["light", "sepia", "dark"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={styles.themeButton}
                  data-theme-choice={value}
                  aria-label={t(`toolbar.immersiveReaderTheme.${value}`)}
                  aria-pressed={theme === value}
                  onClick={() => setTheme(value)}
                  data-testid={`document-immersive-reader-theme-${value}`}
                >
                  {theme === value ? <Check size={14} aria-hidden /> : null}
                </button>
              ))}
            </span>
          </div>
        </header>

        <main className={styles.viewport} lang={locale}>
          <article
            className={styles.page}
            role="document"
            aria-label={t("toolbar.immersiveReaderDocument")}
            data-testid="document-immersive-reader-document"
          >
            {projection.blocks.length ? (
              projection.blocks.map((block, index) => {
                const commonProps = {
                  className: styles.block,
                  "data-reader-block-index": index,
                  "data-reader-block-kind": block.kind,
                  lang: block.lang,
                  tabIndex: readAloudSupported ? 0 : undefined,
                  title: readAloudSupported
                    ? t("toolbar.immersiveReaderStartHere")
                    : undefined,
                  onClick: readAloudSupported
                    ? () => startAtBlock(index)
                    : undefined,
                  onKeyDown: readAloudSupported
                    ? (event: KeyboardEvent<HTMLElement>) =>
                        handleBlockKeyDown(event, index)
                    : undefined,
                };
                if (block.kind === "heading") {
                  const HeadingTag = `h${block.level ?? 2}` as
                    | "h1"
                    | "h2"
                    | "h3"
                    | "h4"
                    | "h5"
                    | "h6";
                  return (
                    <HeadingTag key={block.id} {...commonProps}>
                      {block.text}
                    </HeadingTag>
                  );
                }
                if (block.kind === "code") {
                  return (
                    <pre key={block.id} {...commonProps}>
                      {block.text}
                    </pre>
                  );
                }
                if (block.kind === "quote") {
                  return (
                    <blockquote key={block.id} {...commonProps}>
                      {block.text}
                    </blockquote>
                  );
                }
                return (
                  <p key={block.id} {...commonProps}>
                    {block.text}
                  </p>
                );
              })
            ) : (
              <p
                className={styles.empty}
                data-testid="document-immersive-reader-empty"
              >
                {t("toolbar.immersiveReaderEmpty")}
              </p>
            )}
            {projection.unsupportedNodeCount > 0 ? (
              <p className={styles.notice} role="note">
                {t("toolbar.immersiveReaderUnsupportedNotice", {
                  count: projection.unsupportedNodeCount,
                })}
              </p>
            ) : null}
            {projection.truncated ? (
              <p className={styles.notice} role="note">
                {t("toolbar.immersiveReaderTruncated")}
              </p>
            ) : null}
          </article>
        </main>

        <footer className={styles.footer}>
          <button
            type="button"
            className={styles.playButton}
            disabled={!readAloudSupported || projection.plainText.length === 0}
            onClick={() => toggleReadAloud(projection.plainText)}
            aria-pressed={readAloudPlaying}
            title={
              readAloudSupported
                ? undefined
                : t("toolbar.immersiveReaderSpeechUnavailable")
            }
            data-testid="document-immersive-reader-read-aloud"
          >
            <OfficeSemanticIcon semanticId="review.readAloud" size={22} />
            <span>
              {readAloudPlaying
                ? t("toolbar.readAloudStop")
                : t("toolbar.readAloud")}
            </span>
          </button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
