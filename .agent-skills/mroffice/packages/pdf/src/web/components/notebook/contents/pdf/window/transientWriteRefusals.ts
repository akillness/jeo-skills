/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/*
 * Refusals a PDF write waits out instead of failing on.
 */

/** Another write, the commands rebinding, the saved revision reloading:
 * they pass on their own, so a write waits for them (in order). */
export const PDF_TRANSIENT_WRITE_REFUSALS: ReadonlySet<string> = new Set([
  "pdf.capability.mutationInFlight",
  "pdf.savePolicy.documentLoading",
  "pdf.capability.documentLoading",
  "pdf.capability.registryInitializing",
  "pdf.savePolicy.staleAuthority",
]);

/** The same for a text line's commit, with the line's own passing states:
 * the last save still verified (native-replay-pending), its source reloading. */
export const PDF_TRANSIENT_COMMIT_REFUSALS: ReadonlySet<string> = new Set([
  ...PDF_TRANSIENT_WRITE_REFUSALS,
  "pdf.capability.registryStale",
  "pdf.nativeText.native-replay-pending",
  "pdf.nativeText.source-not-ready",
]);

/** The refusals of a page still opening for the first time (its source not
 * shown yet): a write made then waits for it to open, a minute at most. */
export const PDF_FIRST_OPEN_WRITE_REFUSALS: ReadonlySet<string> = new Set([
  "pdf.savePolicy.documentLoading",
  "pdf.capability.documentLoading",
  "pdf.capability.registryInitializing",
]);
