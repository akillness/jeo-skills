/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
export const PDF_PAGE_WINDOW_SCOPED_STYLE = `
  .pdf-page-window__workspace-actions {
    align-items: center;
    display: inline-flex;
    gap: 4px;
    justify-content: flex-end;
    min-width: 0;
  }

  .pdf-page-window__workspace-actions > button {
    background: transparent;
    border-color: transparent;
    border-radius: 6px;
    color: #334155;
    font-size: 12px;
    font-weight: 600;
    gap: 5px;
    min-height: 32px;
    padding: 0 9px;
    white-space: nowrap;
  }

  .pdf-page-window__workspace-actions > button.is-active {
    background: rgba(13, 148, 136, 0.1);
    border-color: rgba(13, 148, 136, 0.2);
    color: var(--console-accent-strong, #0f766e);
  }

  .pdf-page-window__page-actions {
    align-items: center;
    display: inline-flex;
    gap: 6px;
    min-width: 0;
  }

  .pdf-page-window__page-actions > button {
    align-items: center;
    display: inline-flex;
    gap: 5px;
    height: 36px;
    justify-content: center;
    min-height: 36px;
    min-width: 36px;
    padding: 0 9px;
  }

  .pdf-page-window__writeback-status {
    align-items: center;
    color: #475569;
    display: inline-flex;
    font-size: 11px;
    gap: 4px;
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pdf-page-window__writeback-status[data-state="synced"] {
    color: var(--console-accent-strong, #0f766e);
  }

  .pdf-page-window__writeback-status[data-state="failed"],
  .pdf-page-window__writeback-status[data-state="conflict"] {
    color: #b45309;
  }

  .pdf-page-window__source-replacement-status {
    align-items: center;
    background: var(--console-accent-tint-soft, #f0fdfa);
    border-bottom: 1px solid var(--console-border-flat, #99f6e4);
    color: var(--console-text-primary, #115e59);
    display: flex;
    flex: 0 0 auto;
    font-size: 11px;
    gap: 8px;
    line-height: 1.45;
    min-height: 32px;
    padding: 6px 12px;
    position: relative;
    z-index: 8;
  }

  .pdf-page-window__source-replacement-status strong {
    font-weight: 700;
  }

  .pdf-page-window__source-replacement-status span {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pdf-page-window__source-replacement-status button {
    align-items: center;
    background: #ffffff;
    border: 1px solid var(--console-text-faint, #5eead4);
    border-radius: 7px;
    color: var(--console-accent-strong, #0f766e);
    display: inline-flex;
    flex: 0 0 auto;
    font-size: 11px;
    font-weight: 700;
    gap: 5px;
    min-height: 25px;
    padding: 0 9px;
  }

  .pdf-page-window__source-replacement-status button:disabled {
    cursor: wait;
    opacity: 0.6;
  }

  .pdf-page-window__source-replacement-loss-details {
    flex: 0 0 auto;
    position: relative;
  }

  .pdf-page-window__source-replacement-loss-details summary {
    align-items: center;
    background: #ffffff;
    border: 1px solid var(--console-text-faint, #5eead4);
    border-radius: 7px;
    color: var(--console-accent-strong, #0f766e);
    cursor: pointer;
    display: inline-flex;
    font-size: 11px;
    font-weight: 700;
    gap: 5px;
    min-height: 25px;
    padding: 0 9px;
    user-select: none;
  }

  .pdf-page-window__source-replacement-loss-details summary::-webkit-details-marker {
    display: none;
  }

  .pdf-page-window__source-replacement-loss-panel {
    background: #ffffff;
    border: 1px solid var(--console-border-flat, #99f6e4);
    border-radius: 10px;
    box-shadow: 0 14px 38px rgba(15, 23, 42, 0.18);
    color: var(--console-text-primary, #134e4a);
    min-width: 260px;
    padding: 10px 11px;
    position: absolute;
    right: 0;
    top: calc(100% + 6px);
    z-index: 30;
  }

  .pdf-page-window__source-replacement-loss-panel > strong {
    display: block;
    font-size: 11px;
    margin-bottom: 7px;
  }

  .pdf-page-window__source-replacement-loss-panel ul {
    display: grid;
    gap: 5px;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .pdf-page-window__source-replacement-loss-panel li {
    align-items: center;
    display: flex;
    font-size: 11px;
    gap: 12px;
    justify-content: space-between;
  }

  .pdf-page-window__text-ribbon {
    flex: 0 0 auto;
    z-index: 7;
  }

  .pdf-page-window__text-ribbon-group {
    align-items: center;
    display: flex;
    flex-direction: row;
    flex: 0 0 auto;
    flex-wrap: nowrap;
    gap: 6px;
    min-height: 84px;
    padding: 4px 7px 18px;
    position: relative;
  }
  /* (row padding/caption offsets above apply only until a group converts) */

  .pdf-page-window__text-ribbon-group + .pdf-page-window__text-ribbon-group {
    border-left: 0;
    padding-left: 7px;
  }

  /* Converted groups (--docs) fall through to note-editor.css's shared
     column + caption chrome, exactly like the viewer ribbon. */
  .pdf-page-window__text-ribbon-group--docs {
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: 2px;
    padding: 4px 5px 2px;
  }
  .pdf-page-window__text-ribbon-group--docs::after {
    position: static;
    margin-top: auto;
  }

  .pdf-page-window__text-ribbon-grid {
    display: grid;
    grid-auto-flow: column;
    grid-template-rows: repeat(2, auto);
    gap: 2px 4px;
    align-items: center;
    justify-items: center;
  }
  /* A two-control group reads better as one centred row. */
  .pdf-page-window__text-ribbon-grid--single {
    grid-template-rows: auto;
  }

  .pdf-page-window__text-ribbon-group:not(
      .pdf-page-window__text-ribbon-group--docs
    )::after {
    bottom: 3px;
    color: #64748b;
    content: attr(data-ribbon-label);
    font-size: 10px;
    font-weight: 500;
    left: 8px;
    line-height: 14px;
    overflow: hidden;
    position: absolute;
    right: 8px;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pdf-page-window
    .note-editor-ribbon-track
    .pdf-page-window__text-ribbon-group
    button {
    /* Docs compact metrics — the shared toolbar's 28px button, not the old
       36px touch square, so both ribbons read as one system. */
    height: 28px;
    min-height: 28px;
    min-width: 28px;
    padding: 0 5px;
  }

  .pdf-page-window
    .note-editor-ribbon-track
    .pdf-page-window__text-ribbon-color {
    border-radius: 6px;
    height: 30px;
    min-height: 30px;
    min-width: 30px;
    padding: 0;
    width: 30px;
  }

  .pdf-page-window__text-ribbon-hint {
    align-items: center;
    color: var(--console-text-secondary, #3f625c);
    display: flex;
    flex: 0 0 auto;
    font-size: 12px;
    font-style: normal;
    line-height: 1.35;
    max-width: 360px;
    min-width: 220px;
    padding: 8px 14px;
  }

  .pdf-page-window__native-ink-import-status {
    align-items: center;
    background: var(--console-accent-tint-soft, #f0fdfa);
    border-bottom: 1px solid var(--console-border-flat, #ccfbf1);
    color: var(--console-text-primary, #115e59);
    display: flex;
    flex: 0 0 auto;
    font-size: 11px;
    gap: 7px;
    line-height: 1.4;
    min-height: 30px;
    padding: 5px 14px;
  }

  .pdf-page-window__native-ink-import-status[data-state="loss"] {
    background: #fffbeb;
    border-bottom-color: #fde68a;
    color: #92400e;
  }

  .pdf-page-window__native-ink-import-status strong {
    font-weight: 700;
  }

  .pdf-page-window__annotation-card-head {
    align-items: center;
    display: flex;
    gap: 8px;
    justify-content: space-between;
  }

  .pdf-page-window__annotation-card-meta {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 7px;
    min-width: 0;
  }

  .pdf-page-window__annotation-native-badge {
    align-items: center;
    background: rgba(13, 148, 136, 0.1);
    border: 1px solid rgba(13, 148, 136, 0.2);
    border-radius: 999px;
    color: var(--console-accent-strong, #0f766e);
    display: inline-flex;
    font-size: 10px;
    font-weight: 700;
    gap: 3px;
    line-height: 18px;
    padding: 0 6px;
  }

  .pdf-page-window__annotation-review-state {
    display: inline-block;
    margin: 2px 0;
    padding: 1px 6px;
    border-radius: 999px;
    background: #e0f2fe;
    color: #075985;
    font-size: 11px;
    font-weight: 600;
  }
  .pdf-page-window__annotation-author {
    color: #334155;
    font-size: 11px;
    font-weight: 600;
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pdf-page-window__annotation-color {
    border: 1px solid rgba(15, 23, 42, 0.18);
    border-radius: 999px;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.72);
    display: inline-block;
    height: 12px;
    width: 12px;
  }

  .pdf-page-window__annotation-empty {
    color: #64748b;
    font-style: italic;
  }

  .pdf-page-window__annotation-card-actions {
    display: inline-flex;
    flex: 0 0 auto;
    gap: 2px;
  }

  .pdf-page-window__annotation-card-actions button {
    align-items: center;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 8px;
    color: #64748b;
    cursor: pointer;
    display: inline-flex;
    height: 44px;
    justify-content: center;
    padding: 0;
    transition:
      background-color 160ms ease,
      border-color 160ms ease,
      color 160ms ease;
    width: 44px;
  }

  .pdf-page-window__annotation-card-actions button:hover:not(:disabled) {
    background: rgba(13, 148, 136, 0.08);
    color: var(--console-accent-strong, #0f766e);
  }

  .pdf-page-window__annotation-card-actions button:focus-visible,
  .pdf-page-window__annotation-card-editor textarea:focus-visible,
  .pdf-page-window__annotation-card-editor button:focus-visible,
  .pdf-page-window__annotation-card-editor input:focus-visible {
    box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.2);
    outline: none;
  }

  .pdf-page-window__annotation-card-actions button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .pdf-page-window__annotation-card-editor {
    display: grid;
    gap: 8px;
    margin-top: 6px;
  }

  .pdf-page-window__annotation-card-editor textarea {
    box-sizing: border-box;
    min-height: 88px;
    resize: vertical;
    width: 100%;
  }

  .pdf-page-window__annotation-color-editor {
    align-items: center;
    background: rgba(248, 250, 252, 0.92);
    border: 1px solid rgba(15, 23, 42, 0.08);
    border-radius: 9px;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 7px 8px;
  }

  .pdf-page-window__annotation-color-editor > span {
    color: #475569;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11px;
    margin-left: 2px;
    min-width: 58px;
  }

  .pdf-page-window .pdf-page-window__annotation-color-swatch {
    align-items: center;
    border: 1px solid rgba(15, 23, 42, 0.2);
    border-radius: 999px;
    color: #0f172a;
    display: inline-flex;
    height: 30px;
    justify-content: center;
    min-height: 30px;
    padding: 0;
    width: 30px;
  }

  .pdf-page-window .pdf-page-window__annotation-color-swatch[aria-pressed="true"] {
    border-color: var(--console-accent-strong, #0f766e);
    box-shadow:
      0 0 0 2px #fff,
      0 0 0 4px rgba(13, 148, 136, 0.45);
  }

  .pdf-page-window__annotation-color-custom {
    background: transparent;
    border: 0;
    border-radius: 7px;
    cursor: pointer;
    height: 32px;
    padding: 1px;
    width: 38px;
  }

  .pdf-page-window__annotation-card-editor-actions {
    display: flex;
    gap: 6px;
    justify-content: flex-end;
  }

  @media (prefers-reduced-motion: reduce) {
    .pdf-page-window__annotation-card-actions button {
      transition: none;
    }
  }

  @media (max-width: 1400px) {
    /* Only the old plain buttons fold to their icon here. A ribbon command
       (PdfRibbonButton, data-office-anatomy) is its glyph and label spans:
       hiding its spans left a blank, clickable 58x66 cell (LIVE-322). */
    .pdf-page-window__workspace-actions > button:not([data-office-anatomy]) > span {
      display: none;
    }

    .pdf-page-window__writeback-status > span {
      display: none;
    }
  }

  /* Dark and high contrast: the slate inks and white wells above are light
     paper values; the window around them is graphite there. */
  :is([data-theme-mode="dark"], [data-theme-mode="high-contrast"])
    :is(
      .pdf-page-window__workspace-actions > button:not(.is-active),
      .pdf-page-window__writeback-status,
      .pdf-page-window__annotation-author,
      .pdf-page-window__annotation-color,
      .pdf-page-window__annotation-empty,
      .pdf-page-window__annotation-card-actions button:not(:hover),
      .pdf-page-window__annotation-color-editor > span
    ) {
    color: var(--text-secondary, #a8a8b0);
  }

  :is([data-theme-mode="dark"], [data-theme-mode="high-contrast"])
    .pdf-page-window__text-ribbon-group:not(
      .pdf-page-window__text-ribbon-group--docs
    )::after {
    color: #a1a1a8;
  }

  :is([data-theme-mode="dark"], [data-theme-mode="high-contrast"])
    .pdf-page-window__writeback-status:is([data-state="failed"], [data-state="conflict"]) {
    color: #fb923c;
  }

  :is([data-theme-mode="dark"], [data-theme-mode="high-contrast"])
    :is(
      .pdf-page-window__source-replacement-status button,
      .pdf-page-window__source-replacement-loss-details summary
    ) {
    background: var(--bg-raised, #26272c);
  }

  :is([data-theme-mode="dark"], [data-theme-mode="high-contrast"])
    .pdf-page-window__source-replacement-loss-panel {
    background: var(--bg-raised, #26272c);
    box-shadow: 0 14px 38px rgba(0, 0, 0, 0.5);
  }

  :is([data-theme-mode="dark"], [data-theme-mode="high-contrast"])
    .pdf-page-window__native-ink-import-status[data-state="loss"] {
    background: rgba(251, 146, 60, 0.12);
    border-bottom-color: rgba(251, 146, 60, 0.32);
    color: #fdba74;
  }

  :is([data-theme-mode="dark"], [data-theme-mode="high-contrast"])
    .pdf-page-window__annotation-color-editor {
    background: rgba(0, 0, 0, 0.22);
    border-color: rgba(255, 255, 255, 0.1);
  }

  :is([data-theme-mode="dark"], [data-theme-mode="high-contrast"])
    .pdf-page-window
    .pdf-page-window__annotation-color-swatch[aria-pressed="true"] {
    box-shadow:
      0 0 0 2px var(--bg-surface, #1c1d21),
      0 0 0 4px rgba(45, 212, 191, 0.55);
  }

`;
