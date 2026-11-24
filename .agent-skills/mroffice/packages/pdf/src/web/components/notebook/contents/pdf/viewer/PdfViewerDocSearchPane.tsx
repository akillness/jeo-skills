"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { RefObject } from "react";
import PdfDocSearchPanel from "../PdfDocSearchPanel";
import { PdfDockedPane, type PdfTaskPaneDocks } from "../pdfTaskPaneDock";
import type { PdfTextMatch } from "@mrnote/core/web/lib/pdf/text-search.ts";
import type { PdfDocSearchResult } from "@mrnote/core/web/lib/pdf/doc-search.ts";
import type { PdfNavigationPanel } from "../PdfNavigationRail";

export interface PdfViewerDocSearchPaneProps {
  dataItemId: string | undefined;
  loading: boolean;
  findMatches: PdfTextMatch[];
  findTruncated: boolean;
  findActiveIndex: number;
  docSearchOpen: boolean;
  docSearchResults: PdfDocSearchResult[];
  docSearchReady: boolean;
  docSearchRedactMode: boolean;
  docSearchRedactChecked: ReadonlySet<number>;
  docSearchRedactBusy: boolean;
  redactionBulkRecoveryRequired: boolean;
  pdfTaskPaneDocks: PdfTaskPaneDocks;
  selectDocSearchResult: (index: number) => void;
  docSearchPageNumber: (pageIndex: number) => number | null;
  docSearchMatchMeasurable: (index: number) => boolean;
  toggleDocSearchRedactMode: (open: boolean) => void;
  toggleDocSearchRedactChecked: (index: number) => void;
  confirmDocSearchRedact: () => Promise<void>;
  closeNavigationPanel: (panel: PdfNavigationPanel) => void;
  findTerm: string;
  setFindTerm: (term: string) => void;
  findInputRef: RefObject<HTMLInputElement | null>;
}

export function PdfViewerDocSearchPane({
  dataItemId,
  loading,
  findMatches,
  findTruncated,
  findActiveIndex,
  docSearchOpen,
  docSearchResults,
  docSearchReady,
  docSearchRedactMode,
  docSearchRedactChecked,
  docSearchRedactBusy,
  redactionBulkRecoveryRequired,
  pdfTaskPaneDocks,
  selectDocSearchResult,
  docSearchPageNumber,
  docSearchMatchMeasurable,
  toggleDocSearchRedactMode,
  toggleDocSearchRedactChecked,
  confirmDocSearchRedact,
  closeNavigationPanel,
  findTerm,
  setFindTerm,
  findInputRef,
}: PdfViewerDocSearchPaneProps) {
  return (
    docSearchOpen && !loading ? (
      <PdfDockedPane docks={pdfTaskPaneDocks} pane="search">
        <PdfDocSearchPanel
          results={docSearchResults}
          total={findMatches.length}
          truncated={findTruncated}
          activeIndex={findActiveIndex}
          pageNumberForIndex={docSearchPageNumber}
          ready={docSearchReady}
          disabled={loading || redactionBulkRecoveryRequired}
          onSelect={selectDocSearchResult}
          onClose={() => closeNavigationPanel("search")}
          redactAvailable={Boolean(dataItemId)}
          redactMode={docSearchRedactMode}
          onToggleRedactMode={toggleDocSearchRedactMode}
          measurableForIndex={docSearchMatchMeasurable}
          checkedIndices={docSearchRedactChecked}
          onToggleChecked={toggleDocSearchRedactChecked}
          onConfirmRedact={() => void confirmDocSearchRedact()}
          redactBusy={docSearchRedactBusy}
          term={findTerm}
          onTermChange={setFindTerm}
          inputRef={findInputRef}
        />
      </PdfDockedPane>
    ) : null
  );
}
