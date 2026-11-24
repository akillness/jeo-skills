/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
type ChartPrintSnapshotProvider = () => string;

const providers = new WeakMap<HTMLElement, ChartPrintSnapshotProvider>();

/**
 * Keep the live ECharts instance out of document serialization while still
 * giving the structural print path a current pixel snapshot. The provider is
 * deliberately attached through a WeakMap instead of a data attribute: large
 * data URLs must never leak into ProseMirror content or autosave payloads.
 */
export function registerChartPrintSnapshot(
  shell: HTMLElement,
  provider: ChartPrintSnapshotProvider,
): () => void {
  providers.set(shell, provider);
  return () => {
    if (providers.get(shell) === provider) providers.delete(shell);
  };
}

/** Return a current printable image, or null until the live chart is ready. */
export function captureChartPrintSnapshot(shell: HTMLElement): string | null {
  const provider = providers.get(shell);
  if (!provider) return null;
  const snapshot = provider();
  return typeof snapshot === "string" && snapshot.startsWith("data:image/")
    ? snapshot
    : null;
}
