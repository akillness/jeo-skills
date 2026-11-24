"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { reportOfficeExperience } from "../../../lib/office-experience-report";
import { useTranslations } from "../../../../host/next-intl";
import { ApiRequestError } from "../../../lib/api";
import DocumentIssueNotice, {
  type DocumentIssue,
} from "../DocumentIssueNotice";
import { getResource, getResourceVersions, listResources, type ResourceRead, type ResourceVersionRead } from "../../../lib/resources-sdk";
import { NOTEBOOK_PAGES_CHANGED_EVENT } from "../../../lib/notebook-events";
import { getPage, type PageItem } from "../../../lib/notebook-sdk";
import {
  isLosslessDurableNativeSaveReceipt,
  readNativeSaveReceiptSnapshot,
} from "../../../lib/native-save-receipt";
import {
  getDocument,
  type UniversalDocumentRead,
} from "../../../lib/universal-document-sdk";
import {
  importLossMessageKey,
  importLossTotal,
  readPageImportLosses,
} from "../../../lib/import-losses";
import { spreadsheetImportLossLabel } from "../../../lib/spreadsheet/workbook-import-losses";
import { presentationChartPreserveReasonKey } from "../../../lib/presentation-chart-v2";
import { nativeEditLossIssues } from "./universal-document/NativeEditLossReportCard";
import { importRepairLine, readImportRepairs } from "../../../lib/import-repairs";

/**
 * Where a declined change sits, for the editor to take the reader there (as
 * Excel's compatibility checker's "Find" does): a slide and the block on it,
 * a sheet and the chart or shape on it, a document block, a document chart.
 * Every number counts from 1, as the receipt names them.
 */
export type DeclinedChangeTarget =
  | { kind: "slide"; slide: number; shape?: number; control: string }
  | { kind: "sheet"; sheet: string; chart?: string; shape?: string; range?: string; control: string }
  | { kind: "block"; block: number; control: string }
  | { kind: "chart"; chart: number; control: string };

interface ImportedEditableStatusBarProps {
  pageId: string;
  notebookId?: string | null;
  pageType?: string | null;
  contentJson?: Record<string, unknown> | null;
  /** Take the reader to a declined change. With it, each declined change
   * is its own row with a "Go to" action; without it they are one list. */
  onLocate?: (target: DeclinedChangeTarget) => void;
}

type StatusState =
  | { kind: "loading" | "empty" | "error" }
  














  | { kind: "page-only"; page: PageItem }
  | {
      kind: "ready";
      resource: ResourceRead;
      versions: ResourceVersionRead[];
      document: UniversalDocumentRead | null;
      page: PageItem | null;
      verificationFailed: boolean;
    };

const DOCM_MEDIA_TYPE = "application/vnd.ms-word.document.macroenabled.12";

function isMacroEnabledWordResource(resource: ResourceRead): boolean {
  const filename = String(resource.filename || "").toLowerCase();
  const mediaType = String(resource.mime_type || "")
    .split(";", 1)[0]
    .toLowerCase();
  return (
    resource.kind === "docx" &&
    (filename.endsWith(".docm") || mediaType === DOCM_MEDIA_TYPE)
  );
}

/**
 * Fidelity of an imported office file against the editable page it was
 * projected into — which is why the spreadsheet, presentation and document
 * windows mount it and the PDF viewer does not. The bar is keyed on the
 * resource whose `editable_page_id` is this page; a PDF opened in the viewer
 * has no such projection, because the viewer renders the original file
 * rather than a rewritten page. A PDF that IS imported into an editable
 * document reaches this bar through that document's window, and the resource
 * read below handles `kind === "pdf"` for exactly that case.
 *
 * Both surfaces already end in the same primitive: this bar renders
 * DocumentIssueNotice, and so does the PDF window. Only the source of the
 * issues differs, so there is no second notice design to fold in.
 */
/** The status bar's notices that say a change did not reach the file. */
const PARTIAL_ISSUE = /^(patchback$|declined)/u;

export default function ImportedEditableStatusBar(
  props: ImportedEditableStatusBarProps,
) {
  if (!props.pageId || !props.notebookId) return null;
  return (
    <ImportedEditableIssueScope
      key={JSON.stringify([props.notebookId, props.pageId])}
      pageId={props.pageId}
      notebookId={props.notebookId}
      onLocate={props.onLocate}
    />
  );
}

function ImportedEditableIssueScope({
  pageId,
  notebookId,
  onLocate,
}: {
  pageId: string;
  notebookId: string;
  onLocate?: (target: DeclinedChangeTarget) => void;
}) {
  const t = useTranslations("console-notebooks");
  const [state, setState] = useState<StatusState>({ kind: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const retryRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    let cancelled = false;
    let serial = 0;
    let scheduled = false;
    let request: AbortController | null = null;
    // Which resource this page was imported from, once a full search has
    // said so (`null`: not imported). A page's own content save cannot
    // change it, so a save re-reads that one resource — or nothing — instead
    // of walking every resource of the notebook and then of the workspace
    // (12 requests and ~7 s of API time per save on a 1,100-resource
    
    let knownResourceId: string | null | undefined;
    let nextLoadIsContentOnly = false;
    // The answer to this page's own save, when that is what asked for the
    // reload: the server's page as that save left it, so the reload does not
    // read the whole page (content, causal checkpoint) again right after.
    let savedAnswer: PageItem | null = null;
    // The first load runs while the editor reads the same page to open it:
    // this report only displays what it reads, so it takes that answer (its
    // own copy) instead of downloading the page a second time. A reload
    // after a change reads the page itself.
    let firstLoad = true;
    const findImportedResource = (rows: ResourceRead[]) =>
      rows.find(
        (resource) => resource.metadata_json?.editable_page_id === pageId,
      ) ?? null;

    async function load(generation: number, contentOnly: boolean) {
      const controller = new AbortController();
      request = controller;
      const current = () => !cancelled && generation === serial;
      const init = { signal: controller.signal };
      const readPage = firstLoad
        ? (id: string, request: RequestInit) => getPage(id, request, { joinInFlight: true })
        : getPage;
      firstLoad = false;
      setRefreshing(true);
      try {
        let resource: ResourceRead | null = null;
        let searchAll = !contentOnly;
        if (contentOnly && knownResourceId) {
          try {
            const reread = await getResource(knownResourceId, init);
            resource =
              reread.metadata_json?.editable_page_id === pageId ? reread : null;
          } catch (error) {
            // gone since: look again; any other failure is the load's
            if (!(error instanceof ApiRequestError && error.status === 404)) {
              throw error;
            }
          }
          if (!current()) return;
          searchAll = !resource;
        }
        if (searchAll) {
          // Ask for the one resource that names this page instead of
          // walking the notebook (five pages of a hundred) and then the
          // workspace (fourteen more) on every open; a PDF page never had
          
          const scoped = await listResources(
            { notebookId, editablePageId: pageId, limit: 2 },
            init,
          );
          if (!current()) return;
          resource = findImportedResource(scoped);
          if (!resource) {
            resource = findImportedResource(
              await listResources({ editablePageId: pageId, limit: 2 }, init),
            );
          }
        }
        if (!current()) return;
        knownResourceId = resource ? resource.id : null;
        if (!resource) {
          let local: PageItem | null = null;
          const answered = contentOnly && savedAnswer?.id === pageId ? savedAnswer : null;
          savedAnswer = null;
          try {
            local = answered ?? await readPage(pageId, init);
          } catch (error) {
            // A denial still retires the report; anything else simply means
            // there is nothing to say, which is what `empty` already meant.
            if (isAuthorityDenied(error)) throw error;
          }
          if (!current()) return;
          const page = local?.id === pageId ? local : null;
          setState(
            page && readPageImportLosses(undefined, page.content_json).length
              ? { kind: "page-only", page }
              : { kind: "empty" },
          );
          return;
        }
        let verificationFailed = false;
        async function optionalRead<T>(promise: Promise<T>): Promise<T | null> {
          try {
            return await promise;
          } catch (error) {
            if (isAuthorityDenied(error)) throw error;
            verificationFailed = true;
            return null;
          }
        }
        // A definite denial retires the entire report immediately, even when
        // the other metadata request is still pending.
        const answered = contentOnly && savedAnswer?.id === pageId ? savedAnswer : null;
        savedAnswer = null;
        const [pageResult, versionsResult] = await Promise.all([
          optionalRead(answered ? Promise.resolve(answered) : readPage(pageId, init)),
          optionalRead(
            resource.kind === "docx" || resource.kind === "pdf"
              ? getResourceVersions(resource.id, init)
              : Promise.resolve<ResourceVersionRead[]>([]),
          ),
        ] as const);
        if (!current()) return;
        const page = pageResult?.id === pageId ? pageResult : null;
        const versions = versionsResult ?? [];
        verificationFailed ||= !page;
        let document: UniversalDocumentRead | null = null;
        const documentId =
          typeof resource.metadata_json.editable_projection_document_id ===
          "string"
            ? resource.metadata_json.editable_projection_document_id
            : latestProjectionVersion(versions)?.document_id;
        if (documentId) {
          document = await optionalRead(getDocument(documentId));
        }
        if (current()) {
          setState({
            kind: "ready",
            resource,
            versions,
            document,
            page,
            verificationFailed,
          });
        }
      } catch (error) {
        controller.abort();
        if (current()) {
          setState((previous) =>
            previous.kind === "ready" && isTransientReadFailure(error)
              ? { ...previous, verificationFailed: true }
              : { kind: "error" },
          );
        }
      } finally {
        if (current()) {
          request = null;
          setRefreshing(false);
        }
      }
    }

    function scheduleLoad(contentOnly = false) {
      if (cancelled) return;
      serial += 1;
      request?.abort();
      // a structural change in the same tick wins over a content save
      nextLoadIsContentOnly = scheduled
        ? nextLoadIsContentOnly && contentOnly
        : contentOnly;
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        const onlyContent =
          nextLoadIsContentOnly && knownResourceId !== undefined;
        if (!cancelled) void load(serial, onlyContent);
      });
    }

    retryRef.current = () => scheduleLoad(false);
    scheduleLoad(false);
    const handlePagesChanged = (event: Event) => {
      const detail =
        event instanceof CustomEvent && detailObject(event.detail)
          ? event.detail
          : {};
      if (
        (typeof detail.notebookId === "string" &&
          detail.notebookId &&
          detail.notebookId !== notebookId) ||
        (typeof detail.pageId === "string" &&
          detail.pageId &&
          detail.pageId !== pageId)
      ) {
        return;
      }
      // this page's own content save (tagged with its id) versus a
      // structural change of the notebook (untagged)
      const ownSave = typeof detail.pageId === "string" && detail.pageId === pageId;
      const answer = (detail as { savedPage?: unknown }).savedPage;
      savedAnswer = ownSave && answer && typeof answer === "object" && (answer as PageItem).id === pageId
        ? (answer as PageItem) : null;
      scheduleLoad(ownSave);
    };
    window.addEventListener(NOTEBOOK_PAGES_CHANGED_EVENT, handlePagesChanged);
    return () => {
      cancelled = true;
      request?.abort();
      retryRef.current = () => undefined;
      window.removeEventListener(
        NOTEBOOK_PAGES_CHANGED_EVENT,
        handlePagesChanged,
      );
    };
  }, [notebookId, pageId]);

  const issues = useMemo(() => {
    if (state.kind === "ready") return buildIssues(state, t, onLocate);
    if (state.kind !== "page-only") return [];
    // One selector, one notice: the same `projectionLossesIssue` the resource
    // branch ends in, asked of a page nothing else describes.
    const issue = projectionLossesIssue({}, state.page, t);
    const repairs = importRepairsIssue({}, state.page, t);
    return [...(repairs ? [repairs] : []), ...(issue ? [issue] : [])];
  }, [state, t, onLocate]);
  // A partial write-back on the screen (an object or part left out of the
  // file, a save the file did not take): what the 监控 page counts as shown.
  const shownPartial = issues.some((issue) => PARTIAL_ISSUE.test(issue.key));
  const shownPageType = state.kind === "ready" || state.kind === "page-only" ? state.page?.page_type : null;
  const shownReceipt =
    state.kind === "ready" || state.kind === "page-only" ? state.page?.editable_page_patchback ?? null : null;
  useEffect(() => {
    if (!shownPartial) return;
    // Which objects were not written and why, as the server's codes, and
    // the page by a hashed reference: what the 监控 page needs to tell one
    
    const receipt = shownReceipt as { declined_changes?: unknown; status?: unknown; reason?: unknown } | null;
    reportOfficeExperience("partial", {
      pageId,
      pageType: shownPageType,
      code: "write_back_partial",
      detail: {
        declined: Array.isArray(receipt?.declined_changes)
          ? (receipt.declined_changes as Array<{ control?: unknown; reason?: unknown }>)
          : null,
        failure: receipt && receipt.status !== "succeeded" ? receipt.reason : null,
      },
    });
  }, [shownPartial, pageId, shownPageType, shownReceipt]);
  const visibleIssues = [...issues];
  if (
    state.kind === "error" ||
    (state.kind === "ready" && state.verificationFailed)
  ) {
    visibleIssues.push({
      key: "verification",
      label: t("importStatus.verifyFailed"),
      action: {
        label: t("importStatus.retry"),
        onClick: () => retryRef.current(),
        disabled: refreshing,
      },
    });
  }

  return (
    <DocumentIssueNotice
      issues={visibleIssues}
      sourceName={
        state.kind === "ready"
          ? state.resource.filename
          : state.kind === "page-only"
            ? state.page.title || undefined
            : undefined
      }
      scopeKey={JSON.stringify([notebookId, pageId])}
      testId="imported-editable-status"
      triggerTestId="import-status-toggle"
    />
  );
}

function buildIssues(
  {
    resource,
    versions,
    document,
    page,
  }: Extract<StatusState, { kind: "ready" }>,
  t: ReturnType<typeof useTranslations>,
  onLocate?: (target: DeclinedChangeTarget) => void,
): DocumentIssue[] {
  const metadata = {
    ...resource.metadata_json,
    ...latestProjectionVersion(versions)?.metadata_json,
    ...document?.metadata_json,
    ...latestNativeEditExportVersion(versions)?.metadata_json,
  };
  const lossReport = detailObject(metadata.loss_report)
    ? metadata.loss_report
    : null;
  const issues: DocumentIssue[] = nativeEditLossIssues({
    lossReport,
    lossEntries: metadata.loss_entries,
    reportedCount: numberValue(metadata.loss_entry_count),
    t,
  }).map((issue, index) => ({
    ...issue,
    testId: index === 0 ? "import-status-loss" : undefined,
  }));
  // A damaged file opened by repairing it: the repair log comes first, as
  // the open-and-repair report does.
  const importRepairs = importRepairsIssue(metadata, page, t);
  if (importRepairs) issues.unshift(importRepairs);
  const projectionLossIssue = projectionLossesIssue(metadata, page, t);
  if (projectionLossIssue) issues.push(projectionLossIssue);
  const patchbackIssue = patchbackSummaryIssue(page, resource, t);
  if (patchbackIssue) issues.push(patchbackIssue);
  issues.push(...declinedChangesIssues(page, t, onLocate));
  const declinedShapeIssue = declinedShapeChangesIssue(page, t);
  if (declinedShapeIssue) issues.push(declinedShapeIssue);
  const declinedStoryIssue = declinedStoryEditsIssue(page, t);
  if (declinedStoryIssue) issues.push(declinedStoryIssue);
  const repairedIssue = repairedPartsIssue(page, t);
  if (repairedIssue) issues.push(repairedIssue);
  const repairedBins = repairedBinCountIssue(page, t);
  if (repairedBins) issues.push(repairedBins);

  const macroEnabledWord = isMacroEnabledWordResource(resource);
  const allSourceOnlyAnchors = sourceOnlyFidelityAnchors(metadata);
  const sourceOnlyAnchors = allSourceOnlyAnchors.filter(
    (anchor) =>
      !(macroEnabledWord && anchor.includes("macros_preserved_disabled")),
  );
  if (sourceOnlyAnchors.length > 0) {
    // Said by kind, as Word names them: never a package path, an XML
    
    const kinds = sourceOnlyKindCounts(sourceOnlyAnchors);
    const lines = SOURCE_ONLY_KINDS.filter((kind) => kinds[kind] > 0).map((kind) =>
      t(`importStatus.sourceOnlyKind.${kind}`, { count: kinds[kind] }),
    );
    issues.push({
      key: "source-only",
      // The kinds alone would not say where they are (a "Comments" chip):
      // the label says they are kept in the file, the detail which.
      label: t("importStatus.sourceOnlyParts", { count: sourceOnlyAnchors.length }),
      description: t("importStatus.sourceOnlyPartsDetail", { items: lines.join("\n") }),
      testId: "import-status-source-only",
    });
  }
  const unsupportedRemainder = Math.max(
    0,
    numberValue(metadata.unsupported_node_count) - allSourceOnlyAnchors.length,
  );
  if (unsupportedRemainder > 0) {
    issues.push({
      key: "unsupported",
      label: t("importStatus.lossSummary", { count: unsupportedRemainder }),
      testId: issues.some((issue) => issue.testId === "import-status-loss")
        ? "import-status-unsupported"
        : "import-status-loss",
    });
  }
  const allFallbackAnchors = projectionFallbackAnchors(metadata);
  // Word's Open and Repair: blocks the import could not read were left out
  // (the server's open_repair), said the way Word says it, not as a part.
  const unreadable = allFallbackAnchors.filter((anchor) => anchor.startsWith(UNREADABLE_CONTENT_ANCHOR));
  if (unreadable.length > 0) {
    issues.push({
      key: "unreadable-recovered",
      label: t("importStatus.unreadableRecovered", { count: unreadable.length }),
      tone: "warning",
      testId: "import-status-unreadable-recovered",
    });
  }
  const fallbackAnchors = allFallbackAnchors.filter((anchor) => !anchor.startsWith(UNREADABLE_CONTENT_ANCHOR));
  if (fallbackAnchors.length > 0) {
    // Said as Word says it, by kind: never a package path or a font's hash
    
    const kinds = fallbackKindCounts(fallbackAnchors);
    const lines = (Object.entries(kinds) as [FallbackKind, number][])
      .filter(([, count]) => count > 0)
      .map(([kind, count]) => t(`importStatus.fallbackKind.${kind}`, { count }));
    issues.push({
      key: "fallback",
      label: lines.length === 1
        ? lines[0]
        : t("importStatus.compatibilityFallbacks", { count: fallbackAnchors.length }),
      description: t("importStatus.compatibilityFallbacksDetail", { items: lines.join("\n") }),
      testId: "import-status-fallback",
    });
  }
  return issues;
}

/**
 * The repairs the import made to open a damaged file (the server's
 * open-and-repair: page `importRepairs`, resource `import_repairs`), one log
 * line each ("Removed part: /xl/styles.xml (XML error ...)").
 */
function importRepairsIssue(
  metadata: Record<string, unknown>,
  page: PageItem | null,
  t: ReturnType<typeof useTranslations>,
): DocumentIssue | null {
  const content = page?.content_json as Record<string, unknown> | null | undefined;
  const fromPage = readImportRepairs(content?.["importRepairs"]);
  const repairs = fromPage.length ? fromPage : readImportRepairs(metadata.import_repairs);
  if (!repairs.length) return null;
  return {
    key: "import-repairs",
    label: t("importStatus.workbookRepaired", { count: repairs.length }),
    description: [
      t("importStatus.workbookRepairedDetail"),
      ...repairs.map((repair) =>
        importRepairLine(repair, t(`importStatus.repairAction.${repair.action}` as "importStatus.workbookRepairedDetail"))),
    ].join("\n"),
    tone: "warning",
    testId: "import-status-repairs",
  };
}

function latestProjectionVersion(versions: readonly ResourceVersionRead[]) {
  return versions
    .filter((version) => version.version_kind === "projection")
    .reduce<ResourceVersionRead | null>(
      (latest, version) =>
        !latest || version.version_number > latest.version_number
          ? version
          : latest,
      null,
    );
}

function latestNativeEditExportVersion(
  versions: readonly ResourceVersionRead[],
) {
  return versions
    .filter(
      (version) =>
        version.version_kind === "export" &&
        version.metadata_json.editing_path ===
          "native_edit_transaction_patchback",
    )
    .reduce<ResourceVersionRead | null>(
      (latest, version) =>
        !latest || version.version_number > latest.version_number
          ? version
          : latest,
      null,
    );
}

function detailObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function sourceOnlyFidelityAnchors(
  metadata: Record<string, unknown>,
): string[] {
  const manifest = detailObject(metadata.fidelity_manifest)
    ? metadata.fidelity_manifest
    : metadata;
  return [
    ...new Set([
      ...stringList(metadata.package_loss_anchors),
      ...stringList(metadata.unsupported_anchors),
      ...stringList(manifest.package_loss_anchors),
      ...stringList(manifest.unsupported_anchors),
    ]),
  ];
}

/** A body block the import's repair left out (`open_repair`). */
const UNREADABLE_CONTENT_ANCHOR = "package-warning:unreadable_content_recovered";

function projectionFallbackAnchors(
  metadata: Record<string, unknown>,
): string[] {
  const manifest = detailObject(metadata.fidelity_manifest)
    ? metadata.fidelity_manifest
    : metadata;
  return [
    ...new Set([
      ...stringList(metadata.fallback_anchors),
      ...stringList(manifest.fallback_anchors),
    ]),
  ];
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

/** What kind of content an anchor of the source file names, in Word's terms. */
export const SOURCE_ONLY_KINDS = [
  "pictures",
  "shapes",
  "charts",
  "tables",
  "comments",
  "notes",
  "headersFooters",
  "objects",
  "controls",
  "signatures",
  "macros",
  "formatting",
  "citations",
  "other",
] as const;
export type SourceOnlyKind = (typeof SOURCE_ONLY_KINDS)[number];

/** The kind a loss reason (`?loss=<reason>`) names, by its prefix. */
const LOSS_REASON_KINDS: readonly [RegExp, SourceOnlyKind][] = [
  [/^header_footer_/, "headersFooters"],
  [/^(document_media_|picture_)/, "pictures"],
  [/^(document_shape_|document_text_box_)/, "shapes"],
  [/^(document_chart_|document_native_smartart_)/, "charts"],
  [/^table_/, "tables"],
  [/^comment_/, "comments"],
  [/^note_/, "notes"],
  [/^(document_ole_object_|altchunk_|legacy_equation_)/, "objects"],
  [/^document_signature_line_/, "signatures"],
  [/^macros_/, "macros"],
  [/^(hidden_text_|mce_|hyperlink_)/, "formatting"],
];

function sourceOnlyKind(raw: string): SourceOnlyKind {
  const anchor = raw.replaceAll("\\", "/").trim();
  const lower = anchor.toLowerCase();
  const reason = /\?loss=([a-z0-9_]+)/.exec(lower)?.[1];
  if (reason) {
    const named = LOSS_REASON_KINDS.find(([pattern]) => pattern.test(reason));
    if (named) return named[1];
  }
  const path = lower.split("?")[0]!;
  if (path.startsWith("customxml#bibliography")) return "citations";
  if (path.startsWith("_xmlsignatures/")) return "signatures";
  if (/(^|\/)vbaproject\.bin$/.test(path)) return "macros";
  if (/(^|\/)activex\//.test(path)) return "controls";
  if (/(^|\/)embeddings\//.test(path)) return "objects";
  if (/(^|\/)media\//.test(path)) return "pictures";
  if (/(^|\/)(comments[a-z]*|people)\.xml$/.test(path)) return "comments";
  if (/(^|\/)(footnotes|endnotes)\.xml$/.test(path)) return "notes";
  // word/header1.xml, and the projection's word/first_page_header[0].xml
  if (/(^|\/)[a-z_]*(header|footer)\d*(\[\d+\])?\.xml$/.test(path)) return "headersFooters";
  if (/\/(chart|diagram)\[/.test(path)) return "charts";
  if (/\/image\[/.test(path)) return "pictures";
  if (/\/(shape|vml|txbx)\[/.test(path) || /#txbxtbl\[/.test(path)) return "shapes";
  if (/\/object\[/.test(path)) return "objects";
  if (/(#|\/)tbl\[/.test(path)) return "tables";
  if (/\/(field|run)\[/.test(path)) return "formatting";
  return "other";
}

/** How many of each kind of content the source file keeps that the page does not show. */
export function sourceOnlyKindCounts(anchors: readonly string[]): Record<SourceOnlyKind, number> {
  const counts = Object.fromEntries(SOURCE_ONLY_KINDS.map((kind) => [kind, 0])) as Record<SourceOnlyKind, number>;
  for (const anchor of anchors) counts[sourceOnlyKind(anchor)] += 1;
  return counts;
}

type FallbackKind = "fonts" | "pictures" | "links" | "other";

/** How many of each kind of part is shown through a compatible stand-in. */
export function fallbackKindCounts(anchors: readonly string[]): Record<FallbackKind, number> {
  const counts: Record<FallbackKind, number> = { fonts: 0, pictures: 0, links: 0, other: 0 };
  for (const raw of anchors) {
    const anchor = raw.replaceAll("\\", "/").trim();
    if (/(^|\/)fonts\//.test(anchor)) counts.fonts += 1;
    else if (anchor.endsWith("#external")) counts.links += 1;
    else if (/(^|\/)media\//.test(anchor)) counts.pictures += 1;
    else counts.other += 1;
  }
  return counts;
}

/**
 * Objects the source file holds that this page does not.
 *
 * Every host's projection records these the same way, so this reads the same
 * record for a workbook and for a deck (`@/lib/import-losses`). The file keeps
 * all of them — the original package is what the download and the export are —
 * which is exactly why nothing else on the page can say they are missing.
 */
function projectionLossesIssue(
  metadata: Record<string, unknown>,
  page: PageItem | null,
  t: ReturnType<typeof useTranslations>,
): DocumentIssue | null {
  const entries = readPageImportLosses(
    metadata.import_losses,
    page?.content_json,
  );
  if (entries.length === 0) return null;
  const items = entries.map((entry) => {
    const key = importLossMessageKey(entry.code);
    if (key)
      return t(`importStatus.projectionLossItem.${key}`, {
        count: entry.omitted,
      });
    // A workbook code without a shared message still has the browser
    // importer's own words for it; only a code neither place knows shows raw.
    const label = spreadsheetImportLossLabel(entry.code, t);
    return label
      ? `${label} (${entry.omitted})`
      : t("importStatus.projectionLossItem.other", {
          count: entry.omitted,
          code: entry.code,
        });
  });
  return {
    key: "projection-loss",
    label: t("importStatus.projectionLoss", {
      count: importLossTotal(entries),
    }),
    description: t("importStatus.projectionLossDetail", {
      items: items.join("\n"),
    }),
    tone: "warning",
    testId: "import-status-projection-loss",
  };
}

function patchbackSummaryIssue(
  page: PageItem | null,
  resource: ResourceRead,
  t: ReturnType<typeof useTranslations>,
): DocumentIssue | null {
  const snapshot = readNativeSaveReceiptSnapshot(page);
  if (!snapshot) return null;
  // Written by the office worker a few seconds after the save
  // (presentation_package_backlog): waiting is not a failure.
  if (snapshot.status === "pending") return null;
  if (
    snapshot.status === "succeeded" &&
    isLosslessDurableNativeSaveReceipt(snapshot, {
      expectedAdapter: resource.kind,
      expectedResourceId: resource.id,
      minimumPatchedAnchorCount: 1,
    })
  )
    return null;
  if (typeof resource.sha256 === "string" &&
      isLosslessDurableNativeSaveReceipt(snapshot, {
        expectedAdapter: resource.kind,
        expectedResourceId: resource.id,
        expectedOutputSha256: resource.sha256,
        minimumPatchedAnchorCount: 0,
      })) {
    // The current successful export is byte-identical to this source resource.
    // Restoring the original, or a save whose every change the file declined,
    // needs no changed anchor and is not a sync error.
    return null;
  }
  // The writer's own reason code is for the logs and the ledger, not the reader.
  return {
    key: "patchback",
    // A deck's download is then rebuilt from the page, which it should know.
    label: t(resource.kind === "pptx" ? "importStatus.patchbackFailedDeck" : "importStatus.patchbackFailed"),
    tone: "warning",
    testId: "import-status-patchback",
  };
}

/**
 * The controls a save can decline, by the message that names them: a chart
 * pick its part has no place for, or an edit to a SmartArt diagram the page
 * keeps as drawn (only its text reaches the file).
 */
const DECLINED_CONTROL_MESSAGES: Readonly<Record<string, string>> = {
  pictures: "pictures",
  definedNames: "definedNames",
  data: "data",
  title: "title",
  axisTitleX: "axisTitle",
  axisTitleY: "axisTitle",
  legend: "legend",
  legendPosition: "legendPosition",
  showAxisLabels: "axes",
  showGridlines: "gridlines",
  showDataLabels: "dataLabels",
  showDataTable: "dataTable",
  trendline: "trendline",
  chartStyle: "chartStyle",
  smartArtPosition: "smartArtPosition",
  smartArtFormat: "smartArtFormat",
  smartArtText: "smartArtText",
  // A document chart's controls, by their Chart V2 keys.
  chartType: "chartType",
  axisX: "axes",
  axisY: "axes",
  gridlinesX: "gridlines",
  gridlinesY: "gridlines",
  dataLabels: "dataLabels",
  dataTable: "dataTable",
  stylePreset: "chartStyle",
  // A slide whose edits the source file had no in-place writer for.
  slideEdits: "slideEdits",
  // A deck chart's change that could not be merged into its part: the file
  // keeps the chart as it was.
  chartRewrite: "chartRewrite",
  sheetEdits: "sheetEdits",
  // One part of a slide the deck's in-place writer declined on its own.
  background: "background",
  transition: "transition",
  animation: "animation",
  shapeOrder: "shapeOrder",
  visibility: "visibility",
  masterShapes: "masterShapes",
  // One facet of a sheet a workbook planner declined on its own.
  sortFilter: "sortFilter",
  outline: "outline",
  advancedFilter: "advancedFilter",
  sparklines: "sparklines",
  cellControls: "cellControls",
  printSettings: "printSettings",
  tables: "tables",
  pivot: "pivot",
  tabColor: "tabColor",
  scenarios: "scenarios",
  conditionalFormats: "conditionalFormats",
  charts: "charts",
  drawingOrder: "drawingOrder",
};

/** The facets of a sheet a workbook save declines on their own. */
const SHEET_FACET_CONTROLS: ReadonlySet<string> = new Set([
  "sortFilter",
  "outline",
  "advancedFilter",
  "sparklines",
  "cellControls",
  "printSettings",
  "tables",
  "pivot",
  "tabColor",
  "scenarios",
  "conditionalFormats",
  "charts",
  "drawingOrder",
]);

/**
 * What a document block a save declined held: the object the source file has
 * no place for (`object:<kind>` from the server's block decline).
 */
const DECLINED_OBJECT_KINDS: ReadonlySet<string> = new Set([
  "chart",
  "shape",
  "smartArt",
  "dropCap",
  "inlineDrawing",
  "artisticEffect",
  "oleObject",
  "media",
  "citation",
  "reference",
  // A table's or a paragraph's formatting the file kept as it was.
  "formatting",
  "object",
  // A deck's blocks, named by their kind.
  "image",
  "text",
  "video",
  "audio",
  "table",
  "group",
]);

/**
 * The words for one declined control. A deck's chart the one model reads
 * only in part declines every edit as `preserved:<reason>` (the receipt's
 * first `preserveReasons`, or `no-model` for a chart no reading takes), said
 * with that reason; a format key the imported chart's writer gave up comes
 * as `element:<key>` and one the model refuses for the family as
 * `model:<key>`, each named by the control the key is.
 */
const SCRIPT_PART_CATEGORIES: ReadonlySet<string> = new Set([
  "styles", "theme", "masters", "numbering", "settings", "headers", "pictures", "charts", "pivots", "comments", "content",
]);

function declinedControlLabel(
  control: string,
  t: ReturnType<typeof useTranslations>,
): string {
  if (control.startsWith("object:")) {
    const kind = control.slice("object:".length);
    return t(
      `importStatus.declinedObject.${DECLINED_OBJECT_KINDS.has(kind) ? kind : "object"}`,
    );
  }
  if (control.startsWith("preserved:")) {
    const reason = presentationChartPreserveReasonKey(control.slice("preserved:".length));
    return reason
      ? t("importStatus.declinedControl.preserved", {
          reason: t(reason as "presentation.chartPreserved.reason.partGraph"),
        })
      : t("importStatus.declinedControl.preservedGeneric");
  }
  // What a script changed and the file does not hold, said in words.
  if (control.startsWith("scriptPart:")) {
    const part = control.slice("scriptPart:".length);
    return t(`importStatus.scriptPart.${SCRIPT_PART_CATEGORIES.has(part) ? part : "other"}`);
  }
  // A setting of the whole file (the write-back overhaul, stage 3).
  if (control.startsWith("deck:")) return t("importStatus.declinedControl.deckSetting");
  if (control.startsWith("document:")) return t("importStatus.declinedControl.documentSetting");
  const key = control.replace(/^(?:element|model):/, "");
  return t(
    `importStatus.declinedControl.${DECLINED_CONTROL_MESSAGES[key] ?? "formatting"}`,
  );
}

/** Why the write-back declined the object and what the reader can do,
 * when the save says so (`reason` and `remedy`, the write-back overhaul's
 * closed vocabularies, `writeback_declines.py`); null for an older entry. */
const DECLINED_REASONS: ReadonlySet<string> = new Set([
  "no_place", "not_yet", "source_unwritable", "readback_mismatch", "internal_error", "conflict",
]);
const DECLINED_REMEDIES: ReadonlySet<string> = new Set([
  "kept_on_page", "redo_with_command", "download_rebuilt", "retry", "rebuilt_from_page",
]);

function declinedReasonDetail(
  entry: Record<string, unknown>,
  t: ReturnType<typeof useTranslations>,
): string | null {
  const { reason, remedy } = entry;
  if (typeof entry.control === "string" && entry.control.startsWith("scriptPart:")) {
    return t("importStatus.scriptPartDetail");
  }
  if (typeof remedy !== "string" || !DECLINED_REMEDIES.has(remedy)) return null;
  const why = typeof reason === "string" && DECLINED_REASONS.has(reason)
    ? t(`importStatus.declinedReason.${reason}`)
    : null;
  const next = t(`importStatus.declinedRemedy.${remedy}`);
  return why ? `${why} ${next}` : next;
}

/**
 * Picks the source file has no place for. The save declined each one and wrote
 * everything else, so the page shows them while the downloaded file does not.
 * A workbook names each by its sheet (and the chart or shape on it), a
 * document by its chart or its block, counted from 1. A deck's are not listed:
 * its PPTX download rebuilds them from the page.
 *
 * With `onLocate`, each is its own row with a "Go to" action, as the
 * compatibility checker in Office lists one issue per item with "Find";
 * without it they are one list under one count.
 */
interface DeclinedChangeItem {
  text: string;
  target: DeclinedChangeTarget | null;
  notYet: boolean;
  detail: string | null;
}

/** Each change the page's last save kept out of the file, named once. */
function declinedChangeItems(
  declined: readonly unknown[],
  t: ReturnType<typeof useTranslations>,
): DeclinedChangeItem[] {
  const seen = new Set<string>();
  const items: DeclinedChangeItem[] = [];
  for (const entry of declined) {
    if (!detailObject(entry)) continue;
    const { slide, shape, sheet, chart, block, control } = entry;
    const { range, name } = entry;
    if (typeof control !== "string") continue;
    const controlLabel = declinedControlLabel(control, t);
    // A workbook's chart pick the file could hold but the writer could not
    // write into that chart yet (`reason: "not_yet"`, and every chart pick
    // a save declined before the reason was stated) is not one the file has
    // no place for: a Chart Style's legend text, labels and axes are
    
    const notYet =
      typeof sheet === "string" && Boolean(sheet) && typeof chart === "string" && Boolean(chart)
        ? entry.reason !== "no_place"
        : entry.reason === "not_yet";
    let text: string | null = null;
    let target: DeclinedChangeTarget | null = null;
    if (Number.isSafeInteger(block) && (block as number) >= 1) {
      // A document block the file kept as it was, counted from 1.
      text = t("importStatus.declinedBlockItem", { block: block as number, control: controlLabel });
      target = { kind: "block", block: block as number, control };
    } else if (Number.isSafeInteger(slide) && (slide as number) >= 1) {
      // A deck's declined pick of an older save is in its download: the
      // PPTX export rebuilt it from the page, as PowerPoint's .pptx Save
      // writes what is on screen, so saying the file lacks it would be
      // false. A save that declines one object alone and writes the rest
      // into the deck's own file (the write-back overhaul, stage 3) says so
      // with what to do (`remedy`): that object is named.
      if (typeof entry.remedy !== "string") continue;
      const shapeNumber = Number.isSafeInteger(shape) && (shape as number) >= 1 ? (shape as number) : null;
      text = shapeNumber === null
        ? t("importStatus.declinedChangeItem", { slide: slide as number, control: controlLabel })
        : t("importStatus.declinedSlideShapeItem", { slide: slide as number, shape: shapeNumber, control: controlLabel });
      target = { kind: "slide", slide: slide as number, ...(shapeNumber === null ? {} : { shape: shapeNumber }), control };
    } else if (typeof sheet === "string" && sheet && typeof range === "string" && range) {
      // A workbook range the file kept as it was (stage 3).
      text = t("importStatus.declinedSheetRangeItem", { sheet, range, control: controlLabel });
      target = { kind: "sheet", sheet, range, control };
    } else if (typeof sheet === "string" && sheet && typeof chart === "string" && chart) {
      // A workbook names the chart where it sits: its sheet and its own name.
      text = t("importStatus.declinedSheetChangeItem", { sheet, chart, control: controlLabel });
      target = { kind: "sheet", sheet, chart, control };
    } else if (typeof sheet === "string" && sheet && (control === "sheetEdits" || SHEET_FACET_CONTROLS.has(control))) {
      // A workbook sheet whose edits, or one facet of them, the file kept as
      // they were.
      text = t("importStatus.declinedSheetItem", { sheet, control: controlLabel });
      target = { kind: "sheet", sheet, control };
    } else if (Number.isSafeInteger(chart) && (chart as number) >= 1) {
      // A document names the chart by its position, counted from 1.
      text = t("importStatus.declinedChartItem", { chart: chart as number, control: controlLabel });
      target = { kind: "chart", chart: chart as number, control };
    }
    if (text === null && typeof entry.remedy === "string") {
      // Stage 3 names every object it declined, wherever it sits: a workbook's
      // picture, a defined name, a setting of the whole deck or document.
      if (typeof sheet === "string" && sheet && typeof shape === "string" && shape) {
        text = t("importStatus.declinedSheetChangeItem", { sheet, chart: shape, control: controlLabel });
        target = { kind: "sheet", sheet, shape, control };
      } else if (typeof name === "string" && name) {
        text = t("importStatus.declinedNameItem", { name, control: controlLabel });
      } else {
        text = controlLabel;
      }
    }
    if (text === null || seen.has(text)) continue;
    seen.add(text);
    items.push({ text, target, notYet, detail: declinedReasonDetail(entry, t) });
  }
  return items;
}



export function declinedChangeNames(
  page: PageItem | null,
  t: ReturnType<typeof useTranslations>,
): string[] {
  const declined = page?.editable_page_patchback?.declined_changes;
  return Array.isArray(declined) ? declinedChangeItems(declined as readonly unknown[], t).map((item) => item.text) : [];
}

function declinedChangesIssues(
  page: PageItem | null,
  t: ReturnType<typeof useTranslations>,
  onLocate?: (target: DeclinedChangeTarget) => void,
): DocumentIssue[] {
  const declined = page?.editable_page_patchback?.declined_changes;
  if (!Array.isArray(declined)) return [];
  const items = declinedChangeItems(declined as readonly unknown[], t);
  if (!items.length) return [];
  // The server bounds each list and counts what fell past the bound.
  const omitted = (declined as unknown[]).reduce<number>(
    (total, entry) =>
      detailObject(entry) && Number.isSafeInteger(entry.omitted) && (entry.omitted as number) > 0
        ? total + (entry.omitted as number)
        : total,
    0,
  );
  // Said first, in the same words wherever it shows: the save stands and part
  // of it is not in the file.
  const partial: DocumentIssue = {
    key: "declined-partial",
    label: t("importStatus.partialWriteBack", { count: items.length + omitted }),
    description: t("importStatus.partialWriteBackDetail"),
    tone: "warning",
    testId: "import-status-partial-write-back",
  };
  if (onLocate) {
    const issues: DocumentIssue[] = items.map(({ text, target, notYet, detail }, index) => ({
      key: `declined-${index}`,
      label: text,
      description: detail ?? t(notYet ? "importStatus.declinedItemNotYetDetail" : "importStatus.declinedItemDetail"),
      tone: "warning",
      testId: index === 0 ? "import-status-declined" : undefined,
      action: target
        ? { label: t("importStatus.locate"), onClick: () => onLocate(target) }
        : undefined,
    }));
    if (omitted) {
      issues.push({
        key: "declined-more",
        label: t("importStatus.declinedChangesMore", { count: omitted }),
        tone: "warning",
      });
    }
    return [partial, ...issues];
  }
  const lines = items.map((item) => (item.detail ? `${item.text} — ${item.detail}` : item.text));
  return [
    partial,
    {
      key: "declined",
      label: t("importStatus.declinedChanges", { count: items.length + omitted }),
      description: t(items.some((item) => item.notYet) ? "importStatus.declinedChangesNotYetDetail" : "importStatus.declinedChangesDetail", {
        items: omitted
          ? `${lines.join("\n")}\n${t("importStatus.declinedChangesMore", { count: omitted })}`
          : lines.join("\n"),
      }),
      tone: "warning",
      testId: "import-status-declined",
    },
  ];
}

/** The header/footer refusals the band editor already words. */
const DECLINED_STORY_REASONS: ReadonlySet<string> = new Set([
  "native_story_edit_fields_moved",
  "native_story_edit_field_deleted",
  "native_story_edit_table_structure",
  "native_story_edit_paragraph_reordered",
  "native_story_edit_unanchored_text",
  "native_story_edit_unanchored_paragraph",
  "native_story_edit_objects_changed",
  "native_story_edit_unsupported_paragraph_property",
  "native_story_edit_paragraph_not_removable",
  "native_story_edit_split_run",
  "native_story_edit_wrapped_text",
  "native_story_edit_unsupported_run_property",
  "native_story_edit_unsupported_block",
  "native_story_edit_list_changed",
  "native_story_edit_new_field_unsupported",
  "native_story_edit_revision",
]);

/**
 * Header/footer edits Word's part could not take. The page keeps the user's
 * version; the file keeps each story's last writable form. Each is named by
 * its kind and the writer's reason.
 */
function declinedStoryEditsIssue(
  page: PageItem | null,
  t: ReturnType<typeof useTranslations>,
): DocumentIssue | null {
  const declined = page?.native_story_edits_declined;
  if (!Array.isArray(declined) || declined.length === 0) return null;
  const items = declined.map((entry) => {
    const reason =
      typeof entry?.reason === "string" && DECLINED_STORY_REASONS.has(entry.reason)
        ? entry.reason
        : "native_story_edit_invalid";
    return t("importStatus.declinedStoryItem", {
      story: t(
        typeof entry?.kind === "string" && entry.kind.startsWith("footer")
          ? "editor.band.footer"
          : "editor.band.header",
      ),
      reason: t(`editor.band.nativeRefusal.${reason}` as "editor.band.nativeRefusal.native_story_edit_invalid"),
    });
  });
  return {
    key: "declined-stories",
    label: t("importStatus.declinedStoryEdits", { count: items.length }),
    description: t("importStatus.declinedStoryEditsDetail", {
      items: items.join("\n"),
    }),
    tone: "warning",
    testId: "import-status-declined-stories",
  };
}








function repairedPartsIssue(
  page: PageItem | null,
  t: ReturnType<typeof useTranslations>,
): DocumentIssue | null {
  const repairs = page?.editable_page_patchback?.repairs;
  if (!Array.isArray(repairs)) return null;
  const charts = repairs.filter(
    (entry: unknown) =>
      detailObject(entry) && entry.kind === "chart_ex_style_parts",
  ).length;
  if (!charts) return null;
  return {
    key: "repaired-chart-parts",
    label: t("importStatus.repairedChartParts", { count: charts }),
    description: t("importStatus.repairedChartPartsDetail", { count: charts }),
    testId: "import-status-repaired-chart-parts",
  };
}









function repairedBinCountIssue(
  page: PageItem | null,
  t: ReturnType<typeof useTranslations>,
): DocumentIssue | null {
  const repairs = page?.editable_page_patchback?.repairs;
  if (!Array.isArray(repairs)) return null;
  const charts = repairs.filter(
    (entry: unknown) => detailObject(entry) && entry.kind === "chart_ex_bin_count",
  ).length;
  if (!charts) return null;
  return {
    key: "repaired-chart-bins",
    label: t("importStatus.repairedChartBins", { count: charts }),
    description: t("importStatus.repairedChartBinsDetail", { count: charts }),
    testId: "import-status-repaired-chart-bins",
  };
}

/**
 * Shape picks a workbook save declined, each under its own control so the item
 * names what really happened:
 *
 * - `shapeText`: text typed on an Excel connector, which has no text body in
 *   the file (`xdr:cxnSp`) at all;
 * - `shapeTextLayout`: a shape whose text body DOES hold the text, but whose
 *   paragraphs (a numbered list, say) this edit cannot be placed on without
 *   rewriting them.
 *
 * Either way the text stays on this page and the rest of the save is written
 * (SHAPE-IMPORT-AUDIT.md §41).
 */
function declinedShapeChangesIssue(
  page: PageItem | null,
  t: ReturnType<typeof useTranslations>,
): DocumentIssue | null {
  const declined = page?.editable_page_patchback?.declined_changes;
  if (!Array.isArray(declined)) return null;
  const items = [
    ...new Set(
      declined.flatMap((entry: unknown) => {
        if (!detailObject(entry)) return [];
        const { sheet, shape, control } = entry;
        if (
          typeof shape !== "string" ||
          !shape ||
          (control !== "shapeText" && control !== "shapeTextLayout")
        ) {
          return [];
        }
        return [
          t(
            control === "shapeTextLayout"
              ? "importStatus.declinedShapeTextLayoutItem"
              : "importStatus.declinedShapeChangeItem",
            {
              sheet: typeof sheet === "string" ? sheet : "",
              shape,
            },
          ),
        ];
      }),
    ),
  ];
  if (!items.length) return null;
  return {
    key: "declined-shapes",
    label: t("importStatus.declinedShapeChanges", { count: items.length }),
    description: t("importStatus.declinedShapeChangesDetail", {
      items: items.join("\n"),
    }),
    tone: "warning",
    testId: "import-status-declined-shapes",
  };
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : 0;
}

function isAuthorityDenied(error: unknown): boolean {
  return (
    error instanceof ApiRequestError && [401, 403, 404].includes(error.status)
  );
}

function isTransientReadFailure(error: unknown): boolean {
  return (
    !(error instanceof ApiRequestError) ||
    error.status === 0 ||
    [408, 425, 429].includes(error.status) ||
    error.status >= 500
  );
}
