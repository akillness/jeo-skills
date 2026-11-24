/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * PDF-only command adaptations around the shared Docs ribbon shell.
 * PdfOfficeRibbon imports note-editor.css and emits the exact Docs
 * toolbar/tabs/strip/body/track contract; this block only maps legacy PDF
 * command clusters into that shared group anatomy.
 */
export const PDF_RIBBON_STYLE = `
  .pdf-viewer__ribbon-count {
    align-items: center;
    background: rgba(13, 148, 136, 0.12);
    border-radius: 999px;
    color: var(--console-accent-strong, #0f766e);
    display: inline-flex;
    font-size: 10px;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    height: 18px;
    justify-content: center;
    min-width: 18px;
    padding: 0 5px;
  }

  /* The shell, tabs, scrolling body, track and group chrome come directly
     from the shared chassis + note-editor.css fidelity skin (every group is
     docs-anatomy now); PDF keeps only its CSS-only tab gating below so all
     groups stay mounted across tab switches. */
  .note-editor-ribbon-track
    > .pdf-viewer__toolbar-group
    + .pdf-viewer__toolbar-group {
    border-left: 0;
    padding-left: 7px;
  }

  .pdf-viewer__office-ribbon[data-pdf-ribbon-active="file"]
    [data-pdf-ribbon-tab]:not([data-pdf-ribbon-tab~="file"]),
  .pdf-viewer__office-ribbon[data-pdf-ribbon-active="home"]
    [data-pdf-ribbon-tab]:not([data-pdf-ribbon-tab~="home"]),
  .pdf-viewer__office-ribbon[data-pdf-ribbon-active="insert"]
    [data-pdf-ribbon-tab]:not([data-pdf-ribbon-tab~="insert"]),
  .pdf-viewer__office-ribbon[data-pdf-ribbon-active="draw"]
    [data-pdf-ribbon-tab]:not([data-pdf-ribbon-tab~="draw"]),
  .pdf-viewer__office-ribbon[data-pdf-ribbon-active="edit"]
    [data-pdf-ribbon-tab]:not([data-pdf-ribbon-tab~="edit"]),
  .pdf-viewer__office-ribbon[data-pdf-ribbon-active="annotate"]
    [data-pdf-ribbon-tab]:not([data-pdf-ribbon-tab~="annotate"]),
  .pdf-viewer__office-ribbon[data-pdf-ribbon-active="comment-tool"]
    [data-pdf-ribbon-tab]:not([data-pdf-ribbon-tab~="comment-tool"]),
  .pdf-viewer__office-ribbon[data-pdf-ribbon-active="text-format"]
    [data-pdf-ribbon-tab]:not([data-pdf-ribbon-tab~="text-format"]),
  .pdf-viewer__office-ribbon[data-pdf-ribbon-active="form-field-format"]
    [data-pdf-ribbon-tab]:not([data-pdf-ribbon-tab~="form-field-format"]),
  .pdf-viewer__office-ribbon[data-pdf-ribbon-active="link-format"]
    [data-pdf-ribbon-tab]:not([data-pdf-ribbon-tab~="link-format"]),
  .pdf-viewer__office-ribbon[data-pdf-ribbon-active="table-format"]
    [data-pdf-ribbon-tab]:not([data-pdf-ribbon-tab~="table-format"]),
  .pdf-viewer__office-ribbon[data-pdf-ribbon-active="chart-design"]
    [data-pdf-ribbon-tab]:not([data-pdf-ribbon-tab~="chart-design"]),
  .pdf-viewer__office-ribbon[data-pdf-ribbon-active="chart-format"]
    [data-pdf-ribbon-tab]:not([data-pdf-ribbon-tab~="chart-format"]),
  .pdf-viewer__office-ribbon[data-pdf-ribbon-active="annotation-format"]
    [data-pdf-ribbon-tab]:not([data-pdf-ribbon-tab~="annotation-format"]),
  .pdf-viewer__office-ribbon[data-pdf-ribbon-active="picture-format"]
    [data-pdf-ribbon-tab]:not([data-pdf-ribbon-tab~="picture-format"]),
  .pdf-viewer__office-ribbon[data-pdf-ribbon-active="page"]
    [data-pdf-ribbon-tab]:not([data-pdf-ribbon-tab~="page"]),
  .pdf-viewer__office-ribbon[data-pdf-ribbon-active="protect"]
    [data-pdf-ribbon-tab]:not([data-pdf-ribbon-tab~="protect"]),
  .pdf-viewer__office-ribbon[data-pdf-ribbon-active="tools"]
    [data-pdf-ribbon-tab]:not([data-pdf-ribbon-tab~="tools"]),
  .pdf-viewer__office-ribbon[data-pdf-ribbon-active="help"]
    [data-pdf-ribbon-tab]:not([data-pdf-ribbon-tab~="help"]) {
    display: none;
  }

  .pdf-viewer__office-ribbon[data-pdf-ribbon-active="annotate"]
    .pdf-viewer__toolbar-group--annotate,
  .pdf-viewer__office-ribbon[data-pdf-ribbon-active="tools"]
    .pdf-viewer__toolbar-group--download {
    border-left: 0;
    margin-left: 0;
    padding-left: 0;
  }

  .pdf-viewer__office-ribbon .pdf-viewer__toolbar-group--download {
    margin-left: 0;
  }

  .pdf-viewer__annotation-clipboard-error {
    color: #b42318;
    font-size: 10px;
    line-height: 1.25;
    max-width: 92px;
    padding-inline: 4px;
  }

  .pdf-viewer--presentation .pdf-viewer__office-ribbon {
    display: none;
  }

  .pdf-viewer__page-organizer-toggle {
    align-items: center;
    background: linear-gradient(180deg, #ffffff, #f8fafc);
    border: 1px solid #dbe3ec;
    border-radius: 8px;
    color: #334155;
    cursor: pointer;
    display: inline-flex;
    font-size: 12px;
    font-weight: 650;
    gap: 6px;
    height: 36px;
    justify-content: center;
    min-width: 104px;
    padding: 0 11px;
    white-space: nowrap;
  }

  .pdf-viewer__page-organizer-toggle:hover:not(:disabled) {
    background: var(--console-accent-tint-soft, #f0fdfa);
    border-color: rgba(13, 148, 136, 0.42);
    color: var(--console-accent-strong, #0f766e);
  }

  .pdf-viewer__page-organizer-toggle:focus-visible {
    box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.2);
    outline: none;
  }

  /* The page paints every widget's value itself (pdf.js annotation storage,
     see renderPageInner); an idle control draws nothing over that painting
     (pdf-viewer.css). The control the caret is in becomes an opaque live
     editor, so its text is never doubled with the painted value beneath. */
  .pdf-viewer__form-layer.is-active
    .pdf-viewer__form-text:not(:disabled):focus,
  .pdf-viewer__form-layer.is-active
    .pdf-viewer__form-choice[data-field-editable="true"]:not(:disabled):focus {
    background: #ffffff;
  }

  .pdf-viewer__navigation-rail {
    align-items: center;
    background: #f8fafc;
    border-right: 1px solid rgba(15, 23, 42, 0.08);
    display: flex;
    flex: 0 0 52px;
    flex-direction: column;
    gap: 4px;
    padding: 6px 4px;
    width: 52px;
  }

  .pdf-viewer__navigation-rail-button,
  .pdf-viewer__panel-close {
    align-items: center;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 8px;
    color: #64748b;
    cursor: pointer;
    display: inline-flex;
    flex: 0 0 auto;
    height: 44px;
    justify-content: center;
    padding: 0;
    position: relative;
    transition:
      background-color 160ms ease,
      border-color 160ms ease,
      color 160ms ease;
    width: 44px;
  }

  .pdf-viewer__navigation-rail-button:hover:not(:disabled),
  .pdf-viewer__panel-close:hover:not(:disabled) {
    background: rgba(13, 148, 136, 0.08);
    color: var(--console-accent-strong, #0f766e);
  }

  .pdf-viewer__navigation-rail-button.is-active {
    background: rgba(13, 148, 136, 0.12);
    border-color: rgba(13, 148, 136, 0.22);
    color: var(--console-accent-strong, #0f766e);
  }

  .pdf-viewer__navigation-rail-button:focus-visible,
  .pdf-viewer__panel-close:focus-visible {
    box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.22);
    outline: none;
  }

  .pdf-viewer__navigation-rail-button:disabled,
  .pdf-viewer__panel-close:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .pdf-viewer__navigation-rail-count {
    align-items: center;
    background: var(--console-accent-strong, #0d9488);
    border: 2px solid #f8fafc;
    border-radius: 999px;
    color: #fff;
    display: inline-flex;
    font-size: 8px;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    height: 16px;
    justify-content: center;
    min-width: 16px;
    padding: 0 3px;
    position: absolute;
    right: -4px;
    top: -4px;
  }

  .pdf-viewer__panel-close {
    margin-left: auto;
  }

  .pdf-viewer__docsearch-header .pdf-viewer__panel-close {
    margin-left: 0;
  }

  .pdf-viewer--presentation .pdf-viewer__navigation-rail {
    display: none;
  }

  @media (max-width: 720px) {
    .pdf-viewer__navigation-rail {
      flex-basis: 48px;
      padding-inline: 2px;
      width: 48px;
    }

    .pdf-viewer__navigation-rail-button,
    .pdf-viewer__panel-close {
      height: 44px;
      width: 44px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .pdf-viewer__navigation-rail-button,
    .pdf-viewer__panel-close {
      transition: none;
    }
  }
`;
